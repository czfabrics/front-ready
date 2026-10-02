import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileObjectDescription, FileObjectError } from '#errors/file_object'
import {
  FileObjectApiInstance,
  FileObjectApiInstanceLive,
} from '#file_object/api_instance'
import { genFn, toEffect } from '#helpers/effect'
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketAclCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { Effect } from 'effect'

export type FileObject = {
  key: string
  content: Uint8Array<ArrayBufferLike>
  contentType: string
  cacheControlValue: string | undefined
}

/**
 * Everything about an object except its bytes, for error contexts: a
 * `FileObject` carries the whole upload payload, which has no business being
 * rendered to a terminal or a CI log.
 */
const describeFileObject = function (file: FileObject): FileObjectDescription {
  return {
    key: file.key,
    contentType: file.contentType,
    cacheControlValue: file.cacheControlValue,
  }
}

export class FileObjectRepository extends Effect.Service<FileObjectRepository>()(
  'FileObjectRepository',
  {
    effect: Effect.gen(function* () {
      const apiInstance = yield* FileObjectApiInstance
      const context = yield* FileObjectBucketContext

      return {
        createBucket: genFn(function* () {
          const command = new CreateBucketCommand({
            Bucket: context.bucketName,
            CreateBucketConfiguration: {
              LocationConstraint: context.region,
            },
            ObjectOwnership: 'BucketOwnerEnforced',
          })

          yield* toEffect(apiInstance.send(command), FileObjectError, {
            context,
            commandName: 'CreateBucket',
            file: {},
          })
        }),
        doesBucketExist: genFn(function* () {
          const command = new HeadBucketCommand({
            Bucket: context.bucketName,
          })

          const doesExist = yield* Effect.matchEffect(
            toEffect(apiInstance.send(command), FileObjectError, {
              context,
              commandName: 'HeadBucket',
              file: {},
            }),
            {
              onFailure: () => Effect.succeed(false),
              onSuccess: () => Effect.succeed(true),
            }
          )

          return doesExist
        }),
        setPublicReadAclOnBucket: genFn(function* () {
          const command = new PutBucketAclCommand({
            Bucket: context.bucketName,
            ACL: 'public-read',
          })

          yield* toEffect(apiInstance.send(command), FileObjectError, {
            context,
            commandName: 'PutBucketAcl',
            file: {},
          })
        }),
        setWebsiteConfigurationOnBucket: genFn(function* (
          indexFileKeySuffix: string,
          errorFileKey: string
        ) {
          const command = new PutBucketWebsiteCommand({
            Bucket: context.bucketName,
            WebsiteConfiguration: {
              IndexDocument: {
                Suffix: indexFileKeySuffix,
              },
              ErrorDocument: {
                Key: errorFileKey,
              },
            },
          })

          yield* toEffect(apiInstance.send(command), FileObjectError, {
            context,
            commandName: 'PutBucketWebsite',
            file: {},
          })
        }),
        putObject: genFn(function* (file: FileObject) {
          const command = new PutObjectCommand({
            ACL: 'public-read',
            Bucket: context.bucketName,
            Key: file.key,
            Body: file.content,
            ContentType: file.contentType,
            CacheControl: file.cacheControlValue,
          })

          yield* toEffect(apiInstance.send(command), FileObjectError, {
            context,
            commandName: 'PutObject',
            // Never the whole `file`: `content` would put the entire uploaded
            // payload into the error, and from there into the terminal.
            file: describeFileObject(file),
          })
        }),
        readObject: genFn(function* (objectKey: string) {
          const command = new GetObjectCommand({
            Bucket: context.bucketName,
            Key: objectKey,
          })

          const result = yield* toEffect(apiInstance.send(command), FileObjectError, {
            context,
            commandName: 'GetObject',
            file: { key: objectKey },
          })

          if (result.Body === undefined) {
            return yield* Effect.fail(
              new FileObjectError({
                message: 'Bucket returns undefined response',
                context,
                commandName: 'GetObject',
                file: { key: objectKey },
              })
            )
          }

          return yield* toEffect(result.Body.transformToByteArray(), FileObjectError, {
            context,
            commandName: 'GetObject',
            file: { key: objectKey },
          })
        }),
        countObjects: genFn(function* () {
          const finalState = yield* Effect.iterate(
            { count: 0, token: undefined as string | undefined, done: false },
            {
              while: (state) => !state.done,
              body: (state) =>
                genFn(function* () {
                  const command = new ListObjectsV2Command({
                    Bucket: context.bucketName,
                    ContinuationToken: state.token,
                  })

                  const result = yield* toEffect(
                    apiInstance.send(command),
                    FileObjectError,
                    { context, commandName: 'ListObjectsV2', file: {} }
                  )

                  return {
                    count: state.count + (result.KeyCount ?? 0),
                    token: result.NextContinuationToken,
                    done: result.IsTruncated !== true,
                  }
                })(),
            }
          )

          return finalState.count
        }),
      }
    }),
    dependencies: [FileObjectApiInstanceLive],
  }
) {}
