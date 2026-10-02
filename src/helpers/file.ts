import { CacheControlRule } from '#config/cache_control'
import { InternalConfigContext } from '#contexts/internal_config'
import { FileNotFoundError } from '#errors/file'
import { FileComponent, FileItem, FileTree } from '#file/types'
import { FileObject } from '#file_object/repository'
import { genFn } from '#helpers/effect'
import { Path } from '@effect/platform'
import { Effect, Array as EffectArray, Equal, Option, Stream } from 'effect'

/**
 * The object key for a file: its path below the build folder, always with `/`.
 * A recursive listing uses the platform separator, so on Windows the key used to
 * come out as `assets\\logo.svg` — a different object, invisible to any
 * `^assets/` cache rule.
 */
export const toObjectKey = function (relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

export const fileIntoObject = function (file: FileItem) {
  return Effect.gen(function* () {
    const content = yield* file.content
    const contentType = yield* file.contentType

    return {
      key: toObjectKey(file.relativePath),
      content,
      contentType,
      cacheControlValue: undefined,
    } satisfies FileObject
  })
}

export const detectAndFillCacheControl = function (
  object: FileObject,
  cacheControlRules: ReadonlyArray<CacheControlRule>,
  defaultCacheControlValue: string
): FileObject {
  const rule = cacheControlRules.find(({ regExp }) => regExp.test(object.key))

  return {
    ...object,
    cacheControlValue: rule?.value ?? defaultCacheControlValue,
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

/**
 * Matches on the whole root-relative path, never on a suffix: a multi-page build
 * (every Astro static site, Angular with prerendering) holds a nested `index.html`
 * per route, and `walkFiles` iterates in hash order, so a suffix match would pick an
 * arbitrary one of them.
 */
export const extractFileByRelativePath = genFn(function* (
  components: Iterable<FileComponent>,
  relativePath: string
) {
  for (const file of walkFiles(components)) {
    if (file.relativePath === relativePath) {
      return file
    }
  }

  return yield* Effect.fail(
    new FileNotFoundError({
      message: `File not found`,
      file: { relativePath },
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

  const indexDocument = yield* extractFileByRelativePath(
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
