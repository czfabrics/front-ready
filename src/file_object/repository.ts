import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileObjectDescription, FileObjectError } from '#errors/file_object'
import {
  FileObjectApiInstance,
  FileObjectApiInstanceLive,
} from '#file_object/api_instance'
import { genFn, toEffect } from '#helpers/effect'
import {
  BucketLocationConstraint,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketAclCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
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

/**
 * AWS rejects `LocationConstraint: 'us-east-1'` with `InvalidLocationConstraint`:
 * the default region is expressed by leaving the field out.
 */
const DEFAULT_AWS_REGION = 'us-east-1'

/**
 * Only a 404 means the bucket is not there. A 403 (it exists, but these
 * credentials may not see it), a wrong endpoint, a DNS failure or expired keys
 * are real errors and must surface as such — not as "does not exist".
 */
const isNotFound = function (error: FileObjectError): boolean {
  const thrown: unknown = error.cause?.error

  if (typeof thrown !== 'object' || thrown === null) {
    return false
  }

  const name = 'name' in thrown ? thrown.name : undefined
  const metadata = '$metadata' in thrown ? thrown.$metadata : undefined
  const statusCode =
    typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata
      ? metadata.httpStatusCode
      : undefined

  return name === 'NotFound' || name === 'NoSuchBucket' || statusCode === 404
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
            ...(context.region === DEFAULT_AWS_REGION
              ? {}
              : {
                  CreateBucketConfiguration: {
                    // Every region but the default one is a valid constraint.
                    LocationConstraint: context.region as BucketLocationConstraint,
                  },
                }),
            // Disabling ACLs only makes sense when read is granted by a policy: in
            // `'acl'` mode the very next calls set `public-read` ACLs.
            ...(context.accessMode === 'policy'
              ? { ObjectOwnership: 'BucketOwnerEnforced' as const }
              : {}),
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

          return yield* toEffect(apiInstance.send(command), FileObjectError, {
            context,
            commandName: 'HeadBucket',
            file: {},
          }).pipe(
            Effect.as(true),
            Effect.catchIf(isNotFound, () => Effect.succeed(false))
          )
        }),
        grantPublicRead: genFn(function* () {
          if (context.accessMode === 'acl') {
            const command = new PutBucketAclCommand({
              Bucket: context.bucketName,
              ACL: 'public-read',
            })

            return yield* toEffect(apiInstance.send(command), FileObjectError, {
              context,
              commandName: 'PutBucketAcl',
              file: {},
            })
          }

          // New AWS buckets block public access outright, which would refuse the
          // policy below; lift the block before granting read.
          const unblockCommand = new PutPublicAccessBlockCommand({
            Bucket: context.bucketName,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: false,
              IgnorePublicAcls: false,
              BlockPublicPolicy: false,
              RestrictPublicBuckets: false,
            },
          })

          yield* toEffect(apiInstance.send(unblockCommand), FileObjectError, {
            context,
            commandName: 'PutPublicAccessBlock',
            file: {},
          })

          const policyCommand = new PutBucketPolicyCommand({
            Bucket: context.bucketName,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Sid: 'PublicReadGetObject',
                  Effect: 'Allow',
                  Principal: '*',
                  Action: 's3:GetObject',
                  Resource: `arn:aws:s3:::${context.bucketName}/*`,
                },
              ],
            }),
          })

          yield* toEffect(apiInstance.send(policyCommand), FileObjectError, {
            context,
            commandName: 'PutBucketPolicy',
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
            // A `BucketOwnerEnforced` bucket rejects any ACL other than the owner's.
            ...(context.accessMode === 'acl' ? { ACL: 'public-read' as const } : {}),
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
