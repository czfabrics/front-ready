import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileRepositoryContext } from '#contexts/file_repository'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { FileRepository } from '#file/repository'
import { FileItem, FileTree } from '#file/types'
import { FileObjectRepository } from '#file_object/repository'
import {
  detectAndFillCacheControl,
  extractRootFileTree,
  fileIntoObject,
} from '#helpers/file'
import { BucketLocationConstraint } from '@aws-sdk/client-s3'
import { Effect, HashMap, Layer, Option } from 'effect'

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
      region: config.bucket.params.region as BucketLocationConstraint,
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
      const frontContext = yield* FrontDeploymentContext

      return {
        doesFrontBucketExist: () => {
          return fileObjectRepository.doesBucketExist()
        },
        listFrontBuildFiles: () => {
          return fileRepository.listFiles(configContext.bucket.upload.filesToTheEnd)
        },
        listFrontBuildFileTree: () => {
          return Effect.gen(function* () {
            const files = yield* fileRepository.listFiles(
              configContext.bucket.upload.filesToTheEnd
            )

            const map = HashMap.make<[string, FileTree][]>()

            for (const file of files) {
              const fileTree = yield* extractRootFileTree(
                file,
                frontContext.buildOutputPath
              )

              const existingFileTree = HashMap.get(map, fileTree.absolutePath)

              if (Option.isSome(existingFileTree)) {
                HashMap.set(
                  existingFileTree.value.absolutePath,
                  existingFileTree.value.append([file])
                )
              } else {
                HashMap.set(
                  file.absolutePath,
                  FileTree.new({
                    relativePath: fileTree.relativePath,
                    cwd: frontContext.buildOutputPath,
                    items: [file],
                  })
                )
              }
            }

            return HashMap.values(map)
          })
        },
        createFrontBucket: () =>
          Effect.gen(function* () {
            yield* fileObjectRepository.createBucket()
            yield* fileObjectRepository.setPublicReadAclOnBucket()
            yield* fileObjectRepository.setWebsiteConfigurationOnBucket(
              configContext.bucket.front.indexDocumentSuffix,
              configContext.bucket.front.errorDocumentKey
            )
          }),
        uploadFrontFileToBucket: (file: FileItem) =>
          Effect.gen(function* () {
            const object = detectAndFillCacheControl(
              yield* fileIntoObject(file),
              configContext.bucket.front.cacheControlMapping
            )

            yield* fileObjectRepository.putObject(object)
          }),
      }
    }),
    dependencies: [
      FileRepository.Default.pipe(Layer.provide(FileRepositoryContextLive)),
      FileObjectRepository.Default.pipe(Layer.provide(FileObjectBucketContextLive)),
    ],
  }
) {}
