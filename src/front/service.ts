import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileRepositoryContext } from '#contexts/file_repository'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { FileError } from '#errors/interop/file'
import { FileRepository } from '#file/repository'
import { FileComponent, FileItem, FileTree } from '#file/types'
import { FileObjectRepository } from '#file_object/repository'
import { genFn } from '#helpers/effect'
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
        listFrontBuildFileTrees: genFn(function* () {
          const files = yield* fileRepository.listFiles(
            configContext.bucket.upload.filesToTheEnd
          )

          let map = HashMap.empty<string, FileComponent>()

          for (const file of files) {
            const resolvedFileTree = yield* extractRootFileTree(
              file,
              frontContext.buildOutputPath
            )
            if (Option.isNone(resolvedFileTree)) {
              map = HashMap.set(map, file.absolutePath, file)

              continue
            }

            const existingFileTree = HashMap.get(map, resolvedFileTree.value.absolutePath)
            if (Option.isNone(existingFileTree)) {
              map = HashMap.set(
                map,
                resolvedFileTree.value.absolutePath,
                resolvedFileTree.value
              )
              continue
            }

            if (!FileTree.is(existingFileTree.value)) {
              return yield* Effect.fail(
                new FileError({
                  message: `The same path was resolved both file item & file tree`,
                  file: existingFileTree.value,
                })
              )
            }

            const updatedFileTree = yield* existingFileTree.value.append([file])
            map = HashMap.set(map, existingFileTree.value.absolutePath, updatedFileTree)
          }

          return HashMap.values(map)
        }),
        createFrontBucket: genFn(function* () {
          yield* fileObjectRepository.createBucket()
          yield* fileObjectRepository.setPublicReadAclOnBucket()
          yield* fileObjectRepository.setWebsiteConfigurationOnBucket(
            configContext.bucket.front.indexDocumentSuffix,
            configContext.bucket.front.errorDocumentKey
          )
        }),
        uploadFrontFileToBucket: genFn(function* (file: FileItem) {
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
