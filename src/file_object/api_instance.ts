import { InternalConfigContext } from '#contexts/internal_config'
import { S3Client } from '@aws-sdk/client-s3'
import { Context, Effect, Layer } from 'effect'

export class FileObjectApiInstance extends Context.Tag('FileObjectApiInstance')<
    FileObjectApiInstance,
    S3Client
>() {}

export const FileObjectApiInstanceLive = Layer.effect(
    FileObjectApiInstance,
    Effect.gen(function* () {
        const config = yield* InternalConfigContext

        return new S3Client({
            region: config.bucket.params.region,
            apiVersion: config.bucket.params.apiVersion,
            endpoint: config.bucket.params.endpoint,
            forcePathStyle: config.bucket.params.forcePathStyle,
            credentials: {
                accessKeyId: config.bucket.params.credentials.accessKeyId,
                secretAccessKey: config.bucket.params.credentials.secretAccessKey,
            },
        })
    })
)
