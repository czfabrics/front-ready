import { FileItem } from '#file/types'
import { NodeContext } from '@effect/platform-node'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const BUILD_OUTPUT_PATH = '/tmp/front-ready-build'

const contentTypeOf = function (relativePath: string) {
  return Effect.runPromise(
    FileItem.new({ relativePath, cwd: BUILD_OUTPUT_PATH }).pipe(
      Effect.flatMap((file) => file.contentType),
      Effect.provide(NodeContext.layer)
    )
  )
}

describe('FileItem.contentType', () => {
  it('resolves a known extension', async () => {
    await expect(contentTypeOf('index.html')).resolves.toBe('text/html')
  })

  it('resolves a known extension inside a folder', async () => {
    await expect(contentTypeOf('_astro/a.123.js')).resolves.toBe('text/javascript')
  })

  // Astro emits `_headers` and `_redirects`; `path.extname` returns '' for both, so
  // they used to be uploaded as `application/octet-stream` and offered as downloads.
  it("falls back to text for Astro's extensionless _headers", async () => {
    await expect(contentTypeOf('_headers')).resolves.toBe('text/plain')
  })

  it("falls back to text for Astro's extensionless _redirects", async () => {
    await expect(contentTypeOf('_redirects')).resolves.toBe('text/plain')
  })

  it('falls back to text for any other extensionless file', async () => {
    await expect(contentTypeOf('LICENSE')).resolves.toBe('text/plain')
  })

  it('keeps the binary fallback for an extension mrmime does not know', async () => {
    await expect(contentTypeOf('bundle.weirdext')).resolves.toBe(
      'application/octet-stream'
    )
  })
})
