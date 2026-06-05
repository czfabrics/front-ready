import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileRepositoryContext } from '#contexts/file_repository'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { FileObject, FileObjectRepository } from '#file_object/repository'
import { detectAndFillCacheControl, fileIntoObject } from '#helpers/file'
import { BucketLocationConstraint } from '@aws-sdk/client-s3'
import { Effect, Layer } from 'effect'
import { FileItem, FileRepository } from 'src/file/repository'

const FileRepositoryContextLive = Layer.effect(
    FileRepositoryContext,
    Effect.gen(function* () {
        const front = yield* FrontDeploymentContext
        return { cwd: front.buildOutputPath }
    })
)

const FileObjectBucketContextLive = Layer.effect(
    FileObjectBucketContext,
    Effect.gen(function* () {
        const front = yield* FrontDeploymentContext
        const config = yield* InternalConfigContext
        return {
            bucketName: front.bucketName,
            region: config.bucket.region as BucketLocationConstraint,
        }
    })
)

export class FrontFileObjectService extends Effect.Service<FrontFileObjectService>()(
    'FrontFileObjectService',
    {
        effect: Effect.gen(function* () {
            const configContext = yield* InternalConfigContext
            const fileRepository = yield* FileRepository
            const fileObjectRepository = yield* FileObjectRepository

            return {
                doesFrontBucketExist: () => {
                    return fileObjectRepository.doesBucketExist()
                },
                listFrontBuildFiles: () => {
                    return fileRepository.listFiles(configContext.upload.filesToTheEnd)
                },
                createFrontBucket: () =>
                    Effect.gen(function* () {
                        yield* fileObjectRepository.createBucket()
                        yield* fileObjectRepository.setPublicReadAclOnBucket()
                        yield* fileObjectRepository.setWebsiteConfigurationOnBucket(
                            configContext.bucketFront.indexDocumentSuffix,
                            configContext.bucketFront.errorDocumentKey
                        )
                    }),
                uploadFrontFilesToBucket: (
                    files: FileItem[],
                    finishCallback: (object: FileObject) => void
                ) =>
                    Effect.gen(function* () {
                        const fileUploadings = files.map((file) =>
                            Effect.gen(function* () {
                                const object = detectAndFillCacheControl(
                                    yield* fileIntoObject(file),
                                    configContext.bucketFront.cacheControlMapping
                                )

                                yield* fileObjectRepository.putObject(object)

                                finishCallback(object)
                            })
                        )

                        yield* Effect.all(fileUploadings, {
                            concurrency: configContext.upload.concurrency,
                        })
                    }),
            }
        }),
        dependencies: [
            FileRepository.Default.pipe(Layer.provide(FileRepositoryContextLive)),
            FileObjectRepository.Default.pipe(Layer.provide(FileObjectBucketContextLive)),
        ],
    }
) {}
