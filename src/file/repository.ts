import { FileRepositoryContext } from '#contexts/file_repository'
import { FileItem } from '#file/types'
import { Path } from '@effect/platform'
import { FileSystem } from '@effect/platform/FileSystem'
import { Effect } from 'effect'

export class FileRepository extends Effect.Service<FileRepository>()('FileRepository', {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem
    const path = yield* Path.Path
    const context = yield* FileRepositoryContext

    return {
      listFiles: (relativePathsToTheEnd: string[]) =>
        Effect.gen(function* () {
          const paths = yield* fs.readDirectory(context.cwd, {
            recursive: true,
          })

          const filePaths = yield* Effect.filter(
            paths,
            (relativePath) =>
              fs
                .stat(path.resolve(context.cwd, relativePath))
                .pipe(Effect.map((info) => info.type === 'File')),
            { concurrency: 'unbounded' }
          )

          for (const pathToTheEnd of relativePathsToTheEnd) {
            const index = filePaths.findIndex((path) => path === pathToTheEnd)

            if (index < 0) {
              continue
            }

            filePaths.splice(index, 1)
            filePaths.push(pathToTheEnd)
          }

          return yield* Effect.forEach(filePaths, (filePath) => {
            return FileItem.new({
              relativePath: filePath,
              cwd: context.cwd,
            })
          })
        }),
    }
  }),
  dependencies: [],
}) {}
