import { Config, ConfigSchema } from '#config/schema'
import { InternalConfigContext } from '#contexts/internal_config'
import { FileComponent, FileItem, FileTree } from '#file/types'
import { FileObject } from '#file_object/repository'
import { detectAndFillCacheControl, pickIndexDocument, toObjectKey } from '#helpers/file'
import { NodeContext } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const BUILD_OUTPUT_PATH = '/tmp/front-ready-build'

const RAW_CONFIG = {
  bucket: {
    namePrefix: 'front-ready',
    params: {
      region: 'eu-west-3',
      apiVersion: '2006-03-01',
      endpoint: 'https://example.invalid',
      credentials: {
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      },
    },
  },
  front: {
    type: 'astro',
    astro: {
      mode: 'production',
    },
  },
} satisfies Config

const parsedConfig = ConfigSchema.parse(RAW_CONFIG)

const InternalConfigContextLive = Layer.succeed(InternalConfigContext, parsedConfig)

/**
 * Mirrors what `listFrontBuildFileByRootComponents` produces: each root-level file
 * stays a bare `FileItem`, everything below a folder is grouped into one `FileTree`
 * per first path segment.
 */
const makeComponents = function (relativePaths: string[]) {
  return Effect.gen(function* () {
    const files = yield* Effect.forEach(relativePaths, (relativePath) =>
      FileItem.new({ relativePath, cwd: BUILD_OUTPUT_PATH })
    )

    const rootFiles: FileItem[] = []
    const filesByFolder = new Map<string, FileItem[]>()

    for (const file of files) {
      const segments = file.relativePath.split('/')

      if (segments.length === 1) {
        rootFiles.push(file)

        continue
      }

      const folder = segments[0]!
      const folderFiles = filesByFolder.get(folder) ?? []

      folderFiles.push(file)
      filesByFolder.set(folder, folderFiles)
    }

    const trees = yield* Effect.forEach(
      Array.from(filesByFolder),
      ([relativePath, items]) =>
        FileTree.new({ relativePath, cwd: BUILD_OUTPUT_PATH, items })
    )

    return [...rootFiles, ...trees] as FileComponent[]
  })
}

const listRelativePaths = function (components: Iterable<FileComponent>) {
  const relativePaths: string[] = []

  for (const component of components) {
    for (const file of component) {
      relativePaths.push(file.relativePath)
    }
  }

  return relativePaths.sort()
}

const pick = function (relativePaths: string[]) {
  return Effect.runPromise(
    makeComponents(relativePaths).pipe(
      Effect.flatMap(pickIndexDocument),
      Effect.provide(InternalConfigContextLive),
      Effect.provide(NodeContext.layer)
    )
  )
}

const pickFailure = function (relativePaths: string[]) {
  return Effect.runPromise(
    makeComponents(relativePaths).pipe(
      Effect.flatMap(pickIndexDocument),
      Effect.flip,
      Effect.provide(InternalConfigContextLive),
      Effect.provide(NodeContext.layer)
    )
  )
}

// A realistic multi-page Astro build: one `index.html` per route, plus the hashed
// chunks the root document references.
const MULTI_PAGE_BUILD = [
  'index.html',
  'about/index.html',
  'blog/post-1/index.html',
  '_astro/a.123.js',
  '_astro/b.456.css',
]

describe('pickIndexDocument', () => {
  // The match used to be `relativePath.endsWith(indexDocumentSuffix)` over a
  // hash-ordered iteration, so a nested route document could be the one deferred —
  // leaving the root `index.html` to go up alongside the chunks it references.
  it('defers the root index document, not a nested one', async () => {
    const { indexDocument } = await pick(MULTI_PAGE_BUILD)

    expect(indexDocument.relativePath).toBe('index.html')
  })

  it('leaves the nested index documents in the first upload batch', async () => {
    const { components } = await pick(MULTI_PAGE_BUILD)

    expect(listRelativePaths(components)).toStrictEqual([
      '_astro/a.123.js',
      '_astro/b.456.css',
      'about/index.html',
      'blog/post-1/index.html',
    ])
  })

  it('picks the root index document whatever the order the files come in', async () => {
    const { indexDocument } = await pick([...MULTI_PAGE_BUILD].reverse())

    expect(indexDocument.relativePath).toBe('index.html')
  })

  it('fails rather than falling back to a nested index document', async () => {
    const error = await pickFailure([
      'about/index.html',
      'blog/post-1/index.html',
      '_astro/a.123.js',
    ])

    expect(error._tag).toBe('FileNotFoundError')
  })

  it('reports the exact path it looked for when no root index document exists', async () => {
    const error = await pickFailure(['docs/index.html'])

    expect(error.file.relativePath).toBe('index.html')
  })
})

describe('detectAndFillCacheControl', () => {
  const SHORT_CACHE = 'max-age=60, stale-while-revalidate=600, stale-if-error=86400'
  const DAY_CACHE = 'max-age=86400, stale-while-revalidate=600, stale-if-error=86400'
  const ONE_YEAR_CACHE =
    'max-age=31536000, immutable, stale-while-revalidate=600, stale-if-error=86400'

  const { cacheControlMapping, defaultCacheControlValue } = parsedConfig.bucket.front

  const cacheControlOf = function (key: string) {
    const object: FileObject = {
      key,
      content: new Uint8Array(),
      contentType: 'text/html',
      cacheControlValue: undefined,
    }

    return detectAndFillCacheControl(
      object,
      cacheControlMapping,
      defaultCacheControlValue
    ).cacheControlValue
  }

  it('accepts the HTML rule as a valid mapping key', () => {
    expect(cacheControlMapping.map(({ pattern }) => pattern)).toContain('^.+\\.html$')
  })

  it('keeps the root index document on a short cache', () => {
    expect(cacheControlOf('index.html')).toBe(SHORT_CACHE)
  })

  // The `^.+$` catch-all used to swallow every page but the root one, pinning
  // `about/index.html` for a year on any multi-page build.
  it('gives a nested HTML page the same short cache as the root index', () => {
    expect(cacheControlOf('about/index.html')).toBe(SHORT_CACHE)
  })

  it('gives a deeply nested HTML page the short cache too', () => {
    expect(cacheControlOf('blog/post/index.html')).toBe(SHORT_CACHE)
  })

  it('keeps hashed assets on a one-year cache', () => {
    expect(cacheControlOf('_astro/x.abc123.js')).toBe(ONE_YEAR_CACHE)
  })

  it('keeps Pagefind index chunks on a one-year cache', () => {
    expect(cacheControlOf('pagefind/fragment/en_abc123.pf_fragment')).toBe(ONE_YEAR_CACHE)
  })

  // Copied from `public/` under its own name: pinning it would serve it stale.
  it('gives an unhashed public file a one-day cache', () => {
    expect(cacheControlOf('favicon.svg')).toBe(DAY_CACHE)
  })
})

describe('toObjectKey', () => {
  // A recursive listing on Windows yields `assets\logo.svg`.
  it('uses forward slashes whatever the platform separator', () => {
    expect(toObjectKey('assets\\img\\logo.svg')).toBe('assets/img/logo.svg')
  })

  it('leaves a POSIX path untouched', () => {
    expect(toObjectKey('_astro/a.123.js')).toBe('_astro/a.123.js')
  })
})

describe('upload.exclude', () => {
  const parseExclude = function (exclude: string[]) {
    return ConfigSchema.safeParse({
      ...RAW_CONFIG,
      bucket: { ...RAW_CONFIG.bucket, upload: { exclude } },
    })
  }

  it('compiles each pattern', () => {
    const result = parseExclude(['\\.map$'])

    expect(result.data?.bucket.upload.exclude[0]?.test('_astro/a.123.js.map')).toBe(true)
  })

  it('rejects a pattern that does not compile', () => {
    expect(parseExclude(['[']).success).toBe(false)
  })

  it('excludes nothing by default', () => {
    expect(parsedConfig.bucket.upload.exclude).toStrictEqual([])
  })
})
