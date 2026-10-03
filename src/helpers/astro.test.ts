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

    it('resolves outDir against an explicit root', async () => {
      writeAstroConfig("export default { root: './frontend' }")

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('frontend', 'dist'),
      })
    })

    it('resolves an explicit outDir against an explicit root', async () => {
      writeAstroConfig("export default { root: './frontend', outDir: './build' }")

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('frontend', 'build'),
      })
    })

    it('resolves the client folder inside a rooted outDir for a server output', async () => {
      writeAstroConfig("export default { root: './frontend', output: 'server' }")

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('frontend', 'dist', 'client'),
      })
    })

    // `path.join` ignores absoluteness, so a rooted config used to answer
    // `<root>/var/tmp/build-out` for an outDir Astro would read as `/var/tmp/build-out`.
    it('keeps an absolute outDir instead of grafting it onto the root', async () => {
      writeAstroConfig(
        "export default { root: './frontend', outDir: '/var/tmp/build-out' }"
      )

      await expect(resolve()).resolves.toMatchObject({
        outputPath: '/var/tmp/build-out',
      })
    })

    it('keeps an absolute build.client instead of nesting it under outDir', async () => {
      writeAstroConfig(
        "export default { output: 'server', outDir: './out', build: { client: '/var/tmp/client-out' } }"
      )

      await expect(resolve()).resolves.toMatchObject({
        outputPath: '/var/tmp/client-out',
      })
    })

    it('keeps an absolute build.client even when outDir is itself absolute', async () => {
      writeAstroConfig(
        "export default { root: './frontend', output: 'server', outDir: '/var/tmp/build-out', build: { client: '/var/tmp/client-out' } }"
      )

      await expect(resolve()).resolves.toMatchObject({
        outputPath: '/var/tmp/client-out',
      })
    })

    it('resolves a relative build.client against an absolute outDir', async () => {
      writeAstroConfig(
        "export default { output: 'server', outDir: '/var/tmp/build-out' }"
      )

      await expect(resolve()).resolves.toMatchObject({
        outputPath: join('/var/tmp/build-out', 'client'),
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

    it('prefers astro.config.mjs over astro.config.ts, as Astro does', async () => {
      writeAstroConfig("export default { outDir: './mjs-out' }", 'astro.config.mjs')
      writeAstroConfig("export default { outDir: './ts-out' }", 'astro.config.ts')

      await expect(resolve()).resolves.toMatchObject({ outputPath: './mjs-out' })
    })

    // Node's own TypeScript support cannot resolve `./shared` without its extension;
    // Vite can, like it does for Astro.
    it('loads a TypeScript config importing a local module without its extension', async () => {
      writeFileSync(
        join(projectPath, 'shared.ts'),
        "export const outDir: string = './shared-out'"
      )
      writeAstroConfig(
        "import { outDir } from './shared'\nexport default { outDir }",
        'astro.config.ts'
      )

      await expect(resolve()).resolves.toMatchObject({ outputPath: './shared-out' })
    })

    it('loads a TypeScript config importing defineConfig from astro/config', async () => {
      const astroPackagePath = join(projectPath, 'node_modules', 'astro')

      mkdirSync(astroPackagePath, { recursive: true })
      writeFileSync(
        join(astroPackagePath, 'package.json'),
        JSON.stringify({
          name: 'astro',
          type: 'module',
          exports: { './config': './config.mjs' },
        })
      )
      writeFileSync(
        join(astroPackagePath, 'config.mjs'),
        'export const defineConfig = (config) => config'
      )
      writeAstroConfig(
        "import { defineConfig } from 'astro/config'\nexport default defineConfig({ outDir: './astro-out' })",
        'astro.config.ts'
      )

      await expect(resolve()).resolves.toMatchObject({ outputPath: './astro-out' })
    })

    // Query suffixes are a Vite feature: neither Node nor jiti can resolve them.
    for (const fileName of ['astro.config.ts', 'astro.config.mjs']) {
      it(`loads ${fileName} importing a file with the ?raw suffix`, async () => {
        writeFileSync(join(projectPath, 'out-dir.txt'), './raw-out')
        writeAstroConfig(
          "import outDir from './out-dir.txt?raw'\nexport default { outDir: outDir.trim() }",
          fileName
        )

        await expect(resolve()).resolves.toMatchObject({ outputPath: './raw-out' })
      })
    }

    it('loads a TypeScript config using syntax Node cannot strip', async () => {
      writeAstroConfig(
        "enum Folder { Out = './enum-out' }\nexport default { outDir: Folder.Out }",
        'astro.config.ts'
      )

      await expect(resolve()).resolves.toMatchObject({ outputPath: './enum-out' })
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
    it('lists the files it looked for when no Astro config can be found', async () => {
      const error = await resolveFailure()

      expect(error._tag).toBe('AstroConfigNotFoundError')
      expect(error.message).toContain('astro.config.ts')
    })

    it('reports an explicit config path that does not exist', async () => {
      const error = await resolveFailure('./missing/astro.config.ts')

      expect(error._tag).toBe('AstroConfigNotFoundError')
      expect(error.message).toContain(join('missing', 'astro.config.ts'))
    })

    // Regression guard for `toEffect`: the rejection reason used to be swallowed by
    // `UnknownException`, leaving every interop error reading "An unknown error
    // occurred in Effect.tryPromise".
    it('surfaces the underlying reason when the config throws', async () => {
      writeAstroConfig("throw new Error('broken astro config')", 'astro.config.ts')

      const error = await resolveFailure()

      expect(error._tag).toBe('ViteWrapperError')
      expect(error.message).toContain('broken astro config')
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
