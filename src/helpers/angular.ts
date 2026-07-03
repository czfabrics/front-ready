import { AngularJsonFormatError, AngularJsonMissingDataError } from '#errors/angular'
import { genFn } from '#helpers/effect'
import { FileSystem } from '@effect/platform'
import { Effect } from 'effect'
import z from 'zod'

const OutputPathSchema = z.union([
  z.string(),
  z.object({
    base: z.string(),
    browser: z.string().optional(),
  }),
])

// none    → nothing hashed
// media   → only assets (images, fonts…) hashed, NOT chunks
// bundles → JS/CSS chunks hashed
// all     → chunks + media hashed
const OutputHashingSchema = z.enum(['none', 'media', 'bundles', 'all'])
type OutputHashing = z.infer<typeof OutputHashingSchema>

const AngularOptionsSchema = z.object({
  outputPath: OutputPathSchema.optional(),
  outputHashing: OutputHashingSchema.optional(),
})

const AngularTargetSchema = z.object({
  builder: z.string().optional(),
  options: AngularOptionsSchema.optional(),
  // A configuration is a partial override of options; we only care about
  // outputPath/outputHashing, the rest is stripped by the schema.
  configurations: z.record(z.string(), AngularOptionsSchema).optional(),
})

const AngularProjectSchema = z.object({
  architect: z.record(z.string(), AngularTargetSchema).optional(),
  targets: z.record(z.string(), AngularTargetSchema).optional(),
})

const AngularJsonSchema = z.object({
  projects: z.record(z.string(), AngularProjectSchema).optional(),
})

type AngularJson = z.infer<typeof AngularJsonSchema>
type AngularProject = z.infer<typeof AngularProjectSchema>
type AngularTarget = z.infer<typeof AngularTargetSchema>

const getProjectTargets = (project: AngularProject) => {
  return project.architect ?? project.targets ?? {}
}

const getAngularConfigurationNames = (angularJson: AngularJson): string[] => {
  const configurationNames = new Set<string>()

  for (const project of Object.values(angularJson.projects ?? {})) {
    for (const target of Object.values(getProjectTargets(project))) {
      for (const name of Object.keys(target.configurations ?? {})) {
        configurationNames.add(name)
      }
    }
  }
  return [...configurationNames]
}

const getBuildTarget = (
  angularJson: AngularJson,
  projectName: string,
  targetName = 'build'
): AngularTarget | undefined => {
  const project = (angularJson.projects ?? {})[projectName]
  if (!project) return undefined

  return getProjectTargets(project)[targetName]
}

/**
 * Only the `:application` builder emits into a `browser` subfolder.
 */
const usesBrowserSubfolder = (builder?: string): boolean =>
  builder?.endsWith(':application') ?? false

const getAngularOutputPath = (target: AngularTarget): string | undefined => {
  const outputPath = target.options?.outputPath
  if (outputPath === undefined) return undefined

  // Angular 17+ object form: { base, browser? } — browser defaults to "browser"
  if (typeof outputPath === 'object') {
    const browser = outputPath.browser ?? 'browser'
    return browser ? `${outputPath.base}/${browser}` : outputPath.base
  }

  // String form: the application builder still appends /browser; older builders don't.
  return usesBrowserSubfolder(target.builder) ? `${outputPath}/browser` : outputPath
}

const resolveOutputHashing = (
  target: AngularTarget,
  configurationName: string
): OutputHashing => {
  const fromConfiguration = target.configurations?.[configurationName]?.outputHashing
  const fromBaseOptions = target.options?.outputHashing

  return fromConfiguration ?? fromBaseOptions ?? 'none'
}

export const getAngularConfigurations = genFn(function* (angularJsonPath: string) {
  const fs = yield* FileSystem.FileSystem

  const content = yield* fs.readFileString(angularJsonPath)
  const angularJson = yield* Effect.try(() => JSON.parse(content) as AngularJson)

  const parsedJson = AngularJsonSchema.safeParse(angularJson)

  if (!parsedJson.success) {
    return yield* Effect.fail(
      new AngularJsonFormatError({
        cause: parsedJson.error,
      })
    )
  }

  return getAngularConfigurationNames(parsedJson.data)
})

export const resolveAngularConfiguration = function (
  angularJsonPath: string,
  projectName: string,
  configurationName: string
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    const content = yield* fs.readFileString(angularJsonPath)
    const angularJson = yield* Effect.try(() => JSON.parse(content) as AngularJson)

    const parsedJson = AngularJsonSchema.safeParse(angularJson)

    if (!parsedJson.success) {
      return yield* Effect.fail(
        new AngularJsonFormatError({
          cause: parsedJson.error,
        })
      )
    }

    const target = getBuildTarget(parsedJson.data, projectName)

    if (!target) {
      return yield* Effect.fail(
        new AngularJsonMissingDataError({
          subject: 'build target',
          projectName,
        })
      )
    }

    const outputPath = getAngularOutputPath(target)

    if (!outputPath) {
      return yield* Effect.fail(
        new AngularJsonMissingDataError({
          subject: 'output path',
          projectName,
        })
      )
    }

    const isConfigurationExist = configurationName in (target.configurations ?? {})
    if (!isConfigurationExist) {
      return yield* Effect.fail(
        new AngularJsonMissingDataError({
          subject: `configuration "${configurationName}"`,
          projectName,
        })
      )
    }

    const outputHashing = resolveOutputHashing(target, configurationName)

    return {
      outputPath,
      outputHashing,
    }
  })
}
