import { FileRepositoryContext } from '#contexts/file_repository'
import { FileItem } from '#file/types'
import { Path } from '@effect/platform'
import { FileSystem } from '@effect/platform/FileSystem'
import { Effect } from 'effect'

/**
 * A recursive listing can hold thousands of entries; one `stat` fiber each, all
 * at once, is churn for nothing.
 */
const STAT_CONCURRENCY = 64

export class FileRepository extends Effect.Service<FileRepository>()('FileRepository', {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem
    const path = yield* Path.Path
    const context = yield* FileRepositoryContext

    return {
      listFiles: () =>
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
            { concurrency: STAT_CONCURRENCY }
          )

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
