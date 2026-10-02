import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileRepositoryContext } from '#contexts/file_repository'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { FileRepository } from '#file/repository'
import { FileComponent, FileItem, FileTree } from '#file/types'
import { FileObjectRepository } from '#file_object/repository'
import { genFn } from '#helpers/effect'
import {
  detectAndFillCacheControl,
  extractFirstFolderFromPath,
  fileIntoObject,
} from '#helpers/file'
import { Effect, Layer, Option } from 'effect'

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
      region: config.bucket.params.region,
      accessMode: config.bucket.accessMode,
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
          return fileRepository.listFiles()
        },
        /**
         * Root-level files stay bare `FileItem`s; everything below a folder is
         * grouped into one `FileTree` per first path segment. Grouped in a single
         * pass, each tree built once — appending to an immutable tree per file
         * copied the whole item list every time, quadratic in the folder size.
         */
        listFrontBuildFileByRootComponents: genFn(function* () {
          const files = yield* fileRepository.listFiles()

          const rootFiles: FileItem[] = []
          const itemsByFolder = new Map<string, FileItem[]>()

          for (const file of files) {
            const folder = yield* extractFirstFolderFromPath(file.relativePath)

            if (Option.isNone(folder)) {
              rootFiles.push(file)

              continue
            }

            const items = itemsByFolder.get(folder.value)
            if (items === undefined) {
              itemsByFolder.set(folder.value, [file])
            } else {
              items.push(file)
            }
          }

          const trees = yield* Effect.forEach(itemsByFolder, ([relativePath, items]) =>
            FileTree.new({ relativePath, cwd: frontContext.buildOutputPath, items })
          )

          return [...rootFiles, ...trees] satisfies FileComponent[]
        }),
        createFrontBucket: genFn(function* () {
          yield* fileObjectRepository.createBucket()
          yield* fileObjectRepository.grantPublicRead()
          yield* fileObjectRepository.setWebsiteConfigurationOnBucket(
            configContext.bucket.front.indexDocumentSuffix,
            configContext.bucket.front.errorDocumentKey
          )
        }),
        uploadFrontFileToBucket: genFn(function* (file: FileItem) {
          const object = detectAndFillCacheControl(
            yield* fileIntoObject(file),
            configContext.bucket.front.cacheControlMapping,
            configContext.bucket.front.defaultCacheControlValue
          )

          yield* fileObjectRepository.putObject(object)
        }),
        isAlreadyDeployed: genFn(function* () {
          const count = yield* fileObjectRepository.countObjects()

          return count > 0
        }),
      }
    }),
    dependencies: [
      FileRepository.Default.pipe(Layer.provide(FileRepositoryContextLive)),
      FileObjectRepository.Default.pipe(Layer.provide(FileObjectBucketContextLive)),
    ],
  }
) {}
