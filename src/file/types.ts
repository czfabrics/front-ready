import { IteratorImpl } from '#core/common'
import { FileTypeWrapperError } from '#errors/interop/file_type_wrapper'
import { Path } from '@effect/platform'
import { PlatformError } from '@effect/platform/Error'
import { Effect, Equal, Hash } from 'effect'
import { FileTypeResult } from 'file-type'

export type FileItem = {
  readonly name: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly content: Effect.Effect<Uint8Array<ArrayBufferLike>, PlatformError, never>
  readonly contentType: Effect.Effect<
    FileTypeResult,
    PlatformError | FileTypeWrapperError,
    never
  >
}

const FileTreeTypeId: unique symbol = Symbol.for('FileTree')
type FileTreeTypeId = typeof FileTreeTypeId

const isFileTree = function (thing: unknown): thing is FileTree {
  return typeof thing === 'object' && thing !== null && FileTreeTypeId in thing
}

export type FileTree = {
  readonly [FileTreeTypeId]: FileTreeTypeId
  readonly name: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly cwd: string
  readonly items: FileItem[]
  readonly append: (
    this: FileTree,
    newItems: FileItem[]
  ) => Effect.Effect<FileTree, never, Path.Path>
} & IteratorImpl<FileItem> &
  Equal.Equal

export const FileTree = {
  new: function (data: { relativePath: string; cwd: string; items: FileItem[] }) {
    return Effect.gen(function* () {
      const path = yield* Path.Path

      return {
        [FileTreeTypeId]: FileTreeTypeId,
        name: path.basename(data.relativePath),
        relativePath: data.relativePath,
        absolutePath: path.resolve(data.cwd, data.relativePath),
        cwd: data.cwd,
        items: data.items,
        append: function (
          newItems: FileItem[]
        ): Effect.Effect<FileTree, never, Path.Path> {
          return FileTree.new({
            ...this,
            items: [...this.items, ...newItems],
          })
        },
        [Symbol.iterator](): Iterator<FileItem> {
          let currentIndex = 0

          return {
            next: (): IteratorResult<FileItem> => {
              if (currentIndex < this.items.length) {
                const currentItem = this.items[currentIndex]!

                currentIndex++

                return { value: currentItem, done: false }
              }

              return { value: undefined, done: true }
            },
          }
        },
        [Equal.symbol](that: Equal.Equal): boolean {
          return isFileTree(that) && this.absolutePath === that.absolutePath
        },
        [Hash.symbol](): number {
          return Hash.string(this.absolutePath)
        },
      } satisfies FileTree
    })
  },
}
