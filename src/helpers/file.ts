import { FileItem, FileTree } from '#file/types'
import { FileObject } from '#file_object/repository'
import { Path } from '@effect/platform'
import { Array, Effect, Option } from 'effect'

export const fileIntoObject = function (file: FileItem) {
  return Effect.gen(function* () {
    const content = yield* file.content
    const contentType = yield* file.contentType

    return {
      key: file.relativePath,
      content,
      contentType,
      cacheControlValue: undefined,
    } satisfies FileObject
  })
}

export const detectAndFillCacheControl = function (
  object: FileObject,
  cacheControlMapping: Record<string, string>
): FileObject {
  for (const [keyRawRegExp, cacheControlValue] of Object.entries(cacheControlMapping)) {
    const isCorrectCacheControl = new RegExp(keyRawRegExp).test(object.key)

    if (isCorrectCacheControl) {
      return {
        ...object,
        cacheControlValue,
      }
    }
  }

  return object
}

export const extractFirstFolderFromPath = function (relativePath: string) {
  return Effect.gen(function* () {
    const path = yield* Path.Path

    const segments = path
      .normalize(relativePath)
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment.length > 0 && segment !== '.')

    if (segments.length <= 1) {
      return Option.none()
    }

    return Array.head(segments)
  })
}

export const extractRootFileTree = function (file: FileItem, cwd: string) {
  return Effect.gen(function* () {
    const firstFolder = yield* extractFirstFolderFromPath(file.relativePath)

    if (Option.isNone(firstFolder)) {
      return yield* FileTree.new({ relativePath: './', cwd, items: [file] })
    }

    return yield* FileTree.new({ relativePath: firstFolder.value, cwd, items: [file] })
  })
}

export const hasMinOneFile = function (trees: IterableIterator<FileTree>) {
  for (const tree of trees) {
    if (tree.items.length > 0) {
      return true
    }
  }

  return false
}
