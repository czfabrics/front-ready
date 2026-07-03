import { IteratorImpl } from '#core/types'
import { FileTypeWrapperError } from '#errors/interop/file_type_wrapper'
import { toEffectSync } from '#helpers/effect'
import { Path } from '@effect/platform'
import { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import { Effect, Equal, Hash } from 'effect'
import { lookup } from 'mrmime'

const FileItemTypeId: unique symbol = Symbol.for('FileItem')
type FileItemTypeId = typeof FileItemTypeId

const isFileItem = function (thing: unknown): thing is FileItem {
  return typeof thing === 'object' && thing !== null && FileItemTypeId in thing
}

export interface FileItem extends IteratorImpl<FileItem>, Equal.Equal {
  readonly [FileItemTypeId]: FileItemTypeId
  readonly name: string
  readonly extension: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly cwd: string
  readonly content: Effect.Effect<Uint8Array<ArrayBufferLike>, PlatformError, never>
  readonly contentType: Effect.Effect<string, PlatformError | FileTypeWrapperError, never>
  readonly length: number
}

export const FileItem = {
  new: function (data: { relativePath: string; cwd: string }) {
    return Effect.gen(function* () {
      const path = yield* Path.Path
      const fs = yield* FileSystem

      const name = path.basename(data.relativePath)
      const extension = path.extname(data.relativePath)
      const absolutePath = path.resolve(data.cwd, data.relativePath)
      const content = fs.readFile(absolutePath)

      return {
        [FileItemTypeId]: FileItemTypeId,
        name,
        extension,
        relativePath: data.relativePath,
        absolutePath,
        cwd: data.cwd,
        content: content,
        get contentType() {
          return toEffectSync(
            () => lookup(extension) ?? 'application/octet-stream',
            FileTypeWrapperError,
            {
              file: this,
            }
          )
        },
        get length() {
          return 1
        },
        [Symbol.iterator](): Iterator<FileItem> {
          let isFirst = true

          return {
            next: (): IteratorResult<FileItem> => {
              if (isFirst) {
                isFirst = false

                return { value: this, done: false }
              }

              return { value: undefined, done: true }
            },
          }
        },
        [Equal.symbol](that: Equal.Equal): boolean {
          return isFileItem(that) && this.absolutePath === that.absolutePath
        },
        [Hash.symbol](): number {
          return Hash.string(this.absolutePath)
        },
      } satisfies FileItem
    })
  },
  is: function (thing: unknown): thing is FileItem {
    return isFileItem(thing)
  },
}

const FileTreeTypeId: unique symbol = Symbol.for('FileTree')
type FileTreeTypeId = typeof FileTreeTypeId

const isFileTree = function (thing: unknown): thing is FileTree {
  return typeof thing === 'object' && thing !== null && FileTreeTypeId in thing
}

export interface FileTree extends IteratorImpl<FileItem>, Equal.Equal {
  readonly [FileTreeTypeId]: FileTreeTypeId
  readonly name: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly cwd: string
  readonly items: FileItem[]
  readonly length: number
  readonly append: (
    this: FileTree,
    addedItems: FileItem[]
  ) => Effect.Effect<FileTree, never, Path.Path>
  readonly update: (
    this: FileTree,
    newItems: FileItem[]
  ) => Effect.Effect<FileTree, never, Path.Path>
}

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
        get length() {
          return this.items.length
        },
        append: function (
          addedItems: FileItem[]
        ): Effect.Effect<FileTree, never, Path.Path> {
          return FileTree.new({
            ...this,
            items: [...this.items, ...addedItems],
          })
        },
        update: function (
          newItems: FileItem[]
        ): Effect.Effect<FileTree, never, Path.Path> {
          return FileTree.new({
            ...this,
            items: newItems,
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
  is: function (thing: unknown): thing is FileTree {
    return isFileTree(thing)
  },
}

export type FileComponent = FileTree | FileItem
