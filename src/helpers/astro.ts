import { OutputHashing } from '#contexts/front_deployment'
import { AstroConfigFormatError } from '#errors/astro'
import { ConfigWrapperError } from '#errors/interop/config_wrapper'
import { genFn, toEffect } from '#helpers/effect'
import { Path } from '@effect/platform'
import { loadConfig as c12LoadConfig } from 'c12'
import { Effect } from 'effect'
import z from 'zod'

// Astro exposes no option to disable content-hashed filenames: Vite always emits
// `_astro/[name].[hash].js` and hashes referenced assets. Only a raw
// `vite.build.rollupOptions.output` override could defeat it, so we report 'all'.
const ASTRO_OUTPUT_HASHING: OutputHashing = 'all'

const ASTRO_DEFAULT_OUT_DIR = './dist'
const ASTRO_DEFAULT_CLIENT_DIR = './client'

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

type AstroConfig = z.infer<typeof AstroConfigSchema>

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

export const resolveAstroConfiguration = genFn(function* (astroConfigPath?: string) {
  const path = yield* Path.Path

  const { config } = yield* toEffect(
    () =>
      c12LoadConfig<AstroConfig>({
        name: 'astro',
        configFile: astroConfigPath,
        configFileRequired: true,
      }),
    ConfigWrapperError,
    {}
  )

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
