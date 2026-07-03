import { InternalConfigContext } from '#contexts/internal_config'
import { FileNotFoundError } from '#errors/file'
import { FileComponent, FileItem, FileTree } from '#file/types'
import { FileObject } from '#file_object/repository'
import { genFn } from '#helpers/effect'
import { Path } from '@effect/platform'
import { Effect, Array as EffectArray, Equal, Option, Stream } from 'effect'

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
  cacheControlMapping: Record<string, string>,
  defaultCacheControlValue: string
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

  return {
    ...object,
    cacheControlValue: defaultCacheControlValue,
  }
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

    return EffectArray.head(segments)
  })
}

export const extractRootFileTree = genFn(function* (file: FileItem, cwd: string) {
  const firstFolder = yield* extractFirstFolderFromPath(file.relativePath)

  if (Option.isNone(firstFolder)) {
    return Option.none()
  }

  return Option.some(
    yield* FileTree.new({ relativePath: firstFolder.value, cwd, items: [file] })
  )
})

export const hasMinOneFile = function (components: Iterable<FileComponent>) {
  for (const component of components) {
    if (component.length > 0) {
      return true
    }
  }

  return false
}

const walkFiles = function* (components: Iterable<FileComponent>): Generator<FileItem> {
  for (const component of components) {
    if (FileTree.is(component)) {
      yield* component.items
    } else {
      yield component
    }
  }
}

export const extractFile = genFn(function* (
  components: Iterable<FileComponent>,
  pathSuffix: string
) {
  for (const file of walkFiles(components)) {
    if (file.relativePath.endsWith(pathSuffix)) {
      return file
    }
  }

  return yield* Effect.fail(
    new FileNotFoundError({
      message: `File not found`,
      file: { relativePath: `${pathSuffix}$` },
    })
  )
})

export const excludeFiles = function (
  components: Iterable<FileComponent>,
  shouldExclude: (file: FileItem) => boolean
): Stream.Stream<FileComponent, never, Path.Path> {
  return Stream.fromIterable(components).pipe(
    Stream.filter((component) =>
      FileTree.is(component) ? true : !shouldExclude(component)
    ),
    Stream.mapEffect((component) => {
      if (FileTree.is(component)) {
        const keptItems = component.items.filter((item) => !shouldExclude(item))

        if (keptItems.length !== component.items.length) {
          return component.update(keptItems)
        }
      }

      return Effect.succeed(component)
    })
  )
}

export const pickIndexDocument = genFn(function* (components: Iterable<FileComponent>) {
  const config = yield* InternalConfigContext

  const indexDocument = yield* extractFile(
    components,
    config.bucket.front.indexDocumentSuffix
  )

  const alteredComponents = yield* Stream.runCollect(
    excludeFiles(components, (file) => Equal.equals(file, indexDocument))
  )

  return {
    components: alteredComponents,
    indexDocument,
  } satisfies {
    components: Iterable<FileComponent>
    indexDocument: FileItem
  }
})
