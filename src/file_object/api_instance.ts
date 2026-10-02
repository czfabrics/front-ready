import { InternalConfigContext } from '#contexts/internal_config'
import { S3Client } from '@aws-sdk/client-s3'
import { Context, Effect, Layer } from 'effect'

export class FileObjectApiInstance extends Context.Tag('FileObjectApiInstance')<
  FileObjectApiInstance,
  S3Client
>() {}

/**
 * Scoped, so the client is destroyed once the command is done with it: an
 * `S3Client` holds a keep-alive HTTP agent whose open sockets otherwise outlive
 * the work and keep the process alive.
 */
export const FileObjectApiInstanceLive = Layer.scoped(
  FileObjectApiInstance,
  Effect.gen(function* () {
    const config = yield* InternalConfigContext

    return yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new S3Client({
            region: config.bucket.params.region,
            apiVersion: config.bucket.params.apiVersion,
            endpoint: config.bucket.params.endpoint,
            forcePathStyle: config.bucket.params.forcePathStyle,
            credentials: {
              accessKeyId: config.bucket.params.credentials.accessKeyId,
              secretAccessKey: config.bucket.params.credentials.secretAccessKey,
            },
          })
      ),
      (client) => Effect.sync(() => client.destroy())
    )
  })
)
