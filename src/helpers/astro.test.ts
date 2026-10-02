import { resolveAstroConfiguration } from '#helpers/astro'
import { NodeContext } from '@effect/platform-node'
import { Effect } from 'effect'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let projectPath: string
let previousCwd: string

// c12 discovers `astro.config.*` relative to the cwd, so each test gets a throwaway
// project directory to act as the user's Astro project.
beforeEach(() => {
  previousCwd = process.cwd()
  projectPath = mkdtempSync(join(tmpdir(), 'front-ready-astro-'))

  process.chdir(projectPath)
})

afterEach(() => {
  process.chdir(previousCwd)

  rmSync(projectPath, { recursive: true, force: true })
})

const writeAstroConfig = function (source: string, fileName = 'astro.config.mjs') {
  writeFileSync(join(projectPath, fileName), source)
}

const resolve = function (astroConfigPath?: string) {
  return Effect.runPromise(
    resolveAstroConfiguration(astroConfigPath).pipe(Effect.provide(NodeContext.layer))
  )
}

const resolveFailure = function (astroConfigPath?: string) {
  return Effect.runPromise(
    resolveAstroConfiguration(astroConfigPath).pipe(
      Effect.flip,
      Effect.provide(NodeContext.layer)
    )
  )
}

describe('resolveAstroConfiguration', () => {
  describe('output path', () => {
    it("falls back to Astro's default outDir when the config sets nothing", async () => {
      writeAstroConfig('export default {}')

      await expect(resolve()).resolves.toMatchObject({ outputPath: './dist' })
    })

    it('honours an explicit outDir', async () => {
      writeAstroConfig("export default { outDir: './build' }")

      await expect(resolve()).resolves.toMatchObject({ outputPath: './build' })
    })

    it('keeps outDir when output is explicitly static', async () => {
      writeAstroConfig("export default { output: 'static', outDir: './build' }")

      await expect(resolve()).resolves.toMatchObject({ outputPath: './build' })
    })

    it('resolves into the default client folder for a server output', async () => {
      writeAstroConfig("export default { output: 'server' }")

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('dist', 'client'),
      })
    })

    it('resolves an explicit build.client against outDir for a server output', async () => {
      writeAstroConfig(
        "export default { output: 'server', outDir: './out', build: { client: './public-assets' } }"
      )

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('out', 'public-assets'),
      })
    })

    it('treats an unknown output value as non-static', async () => {
      writeAstroConfig("export default { output: 'hybrid' }")

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('dist', 'client'),
      })
    })
  })

  describe('output hashing', () => {
    it("always reports 'all', since Astro cannot disable Vite's content hashes", async () => {
      writeAstroConfig("export default { outDir: './build' }")

      await expect(resolve()).resolves.toMatchObject({ outputHashing: 'all' })
    })
  })

  describe('config loading', () => {
    it('loads a TypeScript config file', async () => {
      writeAstroConfig("export default { outDir: './ts-out' }", 'astro.config.ts')

      await expect(resolve()).resolves.toMatchObject({ outputPath: './ts-out' })
    })

    it('reads the config at an explicit path', async () => {
      mkdirSync(join(projectPath, 'config'))
      writeFileSync(
        join(projectPath, 'config', 'astro.conf.ts'),
        "export default { outDir: './nested-out' }"
      )

      await expect(resolve('./config/astro.conf.ts')).resolves.toMatchObject({
        outputPath: './nested-out',
      })
    })

    it('ignores Astro options it does not care about', async () => {
      writeAstroConfig(
        "export default { site: 'https://example.com', srcDir: './source', integrations: [] }"
      )

      await expect(resolve()).resolves.toStrictEqual({
        outputPath: './dist',
        outputHashing: 'all',
      })
    })
  })

  describe('failures', () => {
    // Regression guard for `toEffect`: the rejection reason used to be swallowed by
    // `UnknownException`, leaving every interop error reading "An unknown error
    // occurred in Effect.tryPromise".
    it('surfaces the underlying reason when no Astro config can be found', async () => {
      const error = await resolveFailure()

      expect(error._tag).toBe('ConfigWrapperError')
      expect(error.message).toContain('astro.config')
      expect(error.message).not.toContain('Effect.tryPromise')
    })

    it('reports which key is malformed when the config has the wrong shape', async () => {
      writeAstroConfig('export default { outDir: 42 }')

      const error = await resolveFailure()

      expect(error._tag).toBe('AstroConfigFormatError')
      expect(error.message).toContain('outDir')
    })
  })
})
