import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileObjectWrapperError } from '#errors/interop/file_object_wrapper'
import {
  FileObjectApiInstance,
  FileObjectApiInstanceLive,
} from '#file_object/api_instance'
import { toEffect } from '#helpers/promise'
import {
  CreateBucketCommand,
  HeadBucketCommand,
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

export class FileObjectRepository extends Effect.Service<FileObjectRepository>()(
  'FileObjectRepository',
  {
    effect: Effect.gen(function* () {
      const apiInstance = yield* FileObjectApiInstance
      const context = yield* FileObjectBucketContext

      return {
        createBucket: () =>
          Effect.gen(function* () {
            const command = new CreateBucketCommand({
              Bucket: context.bucketName,
              CreateBucketConfiguration: {
                LocationConstraint: context.region,
              },
              ObjectOwnership: 'BucketOwnerEnforced',
            })

            yield* toEffect(apiInstance.send(command), FileObjectWrapperError, {})
          }),
        doesBucketExist: () =>
          Effect.gen(function* () {
            const command = new HeadBucketCommand({
              Bucket: context.bucketName,
            })

            const doesExist = yield* Effect.matchEffect(
              toEffect(apiInstance.send(command), FileObjectWrapperError, {}),
              {
                onFailure: (error) => {
                  if (error.cause.name === 'NotFound') {
                    return Effect.succeed(false)
                  }

                  return Effect.fail(error)
                },
                onSuccess: () => Effect.succeed(true),
              }
            )

            return doesExist
          }),
        setPublicReadAclOnBucket: () =>
          Effect.gen(function* () {
            const command = new PutBucketAclCommand({
              Bucket: context.bucketName,
              ACL: 'public-read',
            })

            yield* toEffect(apiInstance.send(command), FileObjectWrapperError, {})
          }),
        setWebsiteConfigurationOnBucket: (
          indexFileKeySuffix: string,
          errorFileKey: string
        ) =>
          Effect.gen(function* () {
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

            yield* toEffect(apiInstance.send(command), FileObjectWrapperError, {})
          }),
        putObject: (file: FileObject) =>
          Effect.gen(function* () {
            const command = new PutObjectCommand({
              ACL: 'public-read',
              Bucket: context.bucketName,
              Key: file.key,
              Body: file.content,
              ContentEncoding: 'binary',
              ContentType: file.contentType,
              CacheControl: file.cacheControlValue,
            })

            yield* toEffect(apiInstance.send(command), FileObjectWrapperError, {})
          }),
      }
    }),
    dependencies: [FileObjectApiInstanceLive],
  }
) {}
