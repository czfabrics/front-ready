import { FileRepositoryContext } from '#contexts/file_repository'
import { FileTypeWrapperError } from '#errors/interop/file_type_wrapper'
import { toEffect } from '#helpers/promise'
import { Path } from '@effect/platform'
import { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import { Effect } from 'effect'
import { UnknownException } from 'effect/Cause'
import { fileTypeFromBuffer, FileTypeResult } from 'file-type'

export type FileItem = {
    name: string
    relativePath: string
    absolutePath: string
    content: Effect.Effect<Uint8Array<ArrayBufferLike>, PlatformError, never>
    contentType: Effect.Effect<
        FileTypeResult,
        PlatformError | FileTypeWrapperError,
        never
    >
}

export class FileRepository extends Effect.Service<FileRepository>()('FileRepository', {
    effect: Effect.gen(function* () {
        const fs = yield* FileSystem
        const path = yield* Path.Path
        const context = yield* FileRepositoryContext

        return {
            listFiles: (relativePathsToTheEnd: string[]) =>
                Effect.gen(function* () {
                    const filePaths = yield* fs.readDirectory(context.cwd, {
                        recursive: true,
                    })

                    for (const pathToTheEnd of relativePathsToTheEnd) {
                        const index = filePaths.findIndex((path) => path === pathToTheEnd)

                        filePaths.splice(index, 1)
                        filePaths.push(pathToTheEnd)
                    }

                    return filePaths.map((filePath) => {
                        const absolutePath = path.resolve(context.cwd, filePath)
                        const content = fs.readFile(absolutePath)
                        const contentType = content.pipe(
                            Effect.flatMap((value) =>
                                toEffect(fileTypeFromBuffer(value), FileTypeWrapperError)
                            ),
                            Effect.flatMap((value) => {
                                return value
                                    ? Effect.succeed(value)
                                    : Effect.fail(
                                          new FileTypeWrapperError({
                                              message:
                                                  'Unable to determine the content type of the file',
                                              cause: new UnknownException(
                                                  'Unable to determine the content type of the file'
                                              ),
                                          })
                                      )
                            })
                        )

                        return {
                            name: path.basename(filePath),
                            relativePath: filePath,
                            absolutePath: absolutePath,
                            content: content,
                            contentType: contentType,
                        } satisfies FileItem
                    })
                }),
        }
    }),
    dependencies: [],
}) {}
