import { OutputHashing } from '#contexts/front_deployment'
import { AstroConfigFormatError, AstroConfigNotFoundError } from '#errors/astro'
import { ViteWrapperError } from '#errors/interop/vite_wrapper'
import { genFn, toEffect } from '#helpers/effect'
import { FileSystem, Path } from '@effect/platform'
import { Effect } from 'effect'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import z from 'zod'

// Astro exposes no option to disable content-hashed filenames: Vite always emits
// `_astro/[name].[hash].js` and hashes referenced assets. Only a raw
// `vite.build.rollupOptions.output` override could defeat it, so we report 'all'.
const ASTRO_OUTPUT_HASHING: OutputHashing = 'all'

const ASTRO_DEFAULT_OUT_DIR = './dist'
const ASTRO_DEFAULT_CLIENT_DIR = './client'

// Same names, same order as Astro's own lookup.
const ASTRO_CONFIG_FILE_NAMES = [
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.cjs',
  'astro.config.cts',
] as const

// Extensions Node can import as-is; anything else has to go through Vite.
const NATIVELY_IMPORTABLE_EXTENSIONS = ['.mjs', '.js']

// `output` is kept as a loose string rather than an enum so a future Astro value
// ('static' | 'server', plus the legacy 'hybrid') never hard-fails the parse.
const AstroConfigSchema = z.object({
  root: z.string().optional(),
  outDir: z.string().optional(),
  output: z.string().optional(),
  build: z
    .object({
      client: z.string().optional(),
    })
    .optional(),
})

/**
 * Only a prerendered ('static') build writes straight into `outDir`. With a server
 * output, the browser assets land in `build.client`, resolved against `outDir`.
 */
const isStaticOutput = (output?: string): boolean => (output ?? 'static') === 'static'

/**
 * Astro resolves `outDir` against the project `root`, so a config that moves the
 * root also moves the build output. Left untouched when no root is declared, to
 * keep the path exactly as the user wrote it — a relative `outDir` therefore stays
 * relative to the cwd, which is what Astro does too.
 *
 * An absolute `outDir` ignores the root entirely: `path.join` would otherwise strip
 * the leading separator and graft `/var/tmp/out` onto the root as
 * `<root>/var/tmp/out`.
 */
const resolveAgainstRoot = function (
  path: Path.Path,
  root: string | undefined,
  outDir: string
): string {
  if (root === undefined || path.isAbsolute(outDir)) {
    return outDir
  }

  return path.join(root, outDir)
}

/**
 * `build.client` is resolved against `outDir` for the same reason, with the same
 * absolute-path escape hatch.
 */
const resolveAgainstOutDir = function (
  path: Path.Path,
  outDir: string,
  clientDir: string
): string {
  if (path.isAbsolute(clientDir)) {
    return clientDir
  }

  return path.join(outDir, clientDir)
}

/**
 * An explicit path is resolved against the cwd and must exist; otherwise the first
 * `astro.config.*` found in the cwd wins, as with Astro.
 */
const findAstroConfigPath = genFn(function* (astroConfigPath?: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const candidates =
    astroConfigPath === undefined
      ? ASTRO_CONFIG_FILE_NAMES.map((fileName) => path.resolve(fileName))
      : [path.resolve(astroConfigPath)]

  for (const candidate of candidates) {
    const exists = yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))

    if (exists) {
      return candidate
    }
  }

  return yield* Effect.fail(new AstroConfigNotFoundError({ searchedPaths: candidates }))
})

/**
 * Loads the config through a throwaway Vite server, as Astro does: TypeScript,
 * extensionless relative imports and anything else Vite resolves just work. The
 * server never listens, watches nor opens a socket, and is closed whatever happens.
 */
const importWithVite = function (configPath: string) {
  return Effect.acquireUseRelease(
    toEffect(
      () =>
        createServer({
          root: process.cwd(),
          configFile: false,
          envFile: false,
          logLevel: 'silent',
          clearScreen: false,
          appType: 'custom',
          server: { middlewareMode: true, hmr: false, watch: null, ws: false },
          optimizeDeps: { noDiscovery: true },
          ssr: { external: true },
        }),
      ViteWrapperError,
      { configPath }
    ),
    (server) =>
      toEffect(
        () => server.ssrLoadModule(configPath, { fixStacktrace: true }),
        ViteWrapperError,
        { configPath }
      ),
    (server) =>
      toEffect(() => server.close(), ViteWrapperError, { configPath }).pipe(Effect.ignore)
  )
}

/**
 * Plain JavaScript is imported natively first and only falls back to Vite on
 * failure, mirroring Astro's own loader.
 */
const importAstroConfig = genFn(function* (configPath: string) {
  const path = yield* Path.Path

  const loadedModule: Record<string, unknown> = NATIVELY_IMPORTABLE_EXTENSIONS.includes(
    path.extname(configPath)
  )
    ? yield* toEffect(
        () => import(pathToFileURL(configPath).href) as Promise<Record<string, unknown>>,
        ViteWrapperError,
        { configPath }
      ).pipe(Effect.orElse(() => importWithVite(configPath)))
    : yield* importWithVite(configPath)

  return loadedModule['default'] ?? loadedModule
})

export const resolveAstroConfiguration = genFn(function* (astroConfigPath?: string) {
  const path = yield* Path.Path

  const configPath = yield* findAstroConfigPath(astroConfigPath)
  const config = yield* importAstroConfig(configPath)

  const parsedConfig = AstroConfigSchema.safeParse(config)

  if (!parsedConfig.success) {
    return yield* Effect.fail(
      new AstroConfigFormatError({
        cause: parsedConfig.error,
      })
    )
  }

  const outDir = resolveAgainstRoot(
    path,
    parsedConfig.data.root,
    parsedConfig.data.outDir ?? ASTRO_DEFAULT_OUT_DIR
  )

  const outputPath = isStaticOutput(parsedConfig.data.output)
    ? outDir
    : resolveAgainstOutDir(
        path,
        outDir,
        parsedConfig.data.build?.client ?? ASTRO_DEFAULT_CLIENT_DIR
      )

  return {
    outputPath,
    outputHashing: ASTRO_OUTPUT_HASHING,
  }
})
