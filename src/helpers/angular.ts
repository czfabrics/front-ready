import {
  AngularJsonFormatError,
  AngularJsonMissingDataError,
  AngularJsonSyntaxError,
} from '#errors/angular'
import { genFn, toEffectSync } from '#helpers/effect'
import { FileSystem } from '@effect/platform'
import { JSONCParseError, parseJSONC } from 'confbox'
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

const BUILD_TARGET_NAME = 'build'

const getProjectTargets = (project: AngularProject) => {
  return project.architect ?? project.targets ?? {}
}

// Only the project's own build target is offered: a name coming from another
// project, or from `serve` or `test`, would be accepted by the prompt and then
// rejected by `resolveAngularConfiguration`, which only ever looks at this
// project's `build`.
const getAngularConfigurationNames = (
  angularJson: AngularJson,
  projectName: string
): string[] => {
  return Object.keys(getBuildTarget(angularJson, projectName)?.configurations ?? {})
}

const getBuildTarget = (
  angularJson: AngularJson,
  projectName: string,
  targetName = BUILD_TARGET_NAME
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

const getAngularOutputPath = (
  target: AngularTarget,
  configurationName: string
): string | undefined => {
  // A configuration is a partial override of the base options, so it may redirect
  // the build somewhere else entirely — mirror `resolveOutputHashing` here.
  const outputPath =
    target.configurations?.[configurationName]?.outputPath ?? target.options?.outputPath
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

/**
 * `parseJSONC` is fault-tolerant: broken input comes back as a best-effort value
 * — `{}` for a truncated file — with the problems reported only through
 * `errors`. Left unchecked, a syntax error would surface far from its cause, as a
 * missing build target.
 */
const parseJsoncStrictly = function (content: string): unknown {
  const errors: JSONCParseError[] = []
  const value = parseJSONC<unknown>(content, { allowTrailingComma: true, errors })

  const [first] = errors
  if (first !== undefined) {
    const line = content.slice(0, first.offset).split('\n').length

    throw new Error(
      `Invalid JSON at line ${line} (jsonc-parser error code ${first.error})`
    )
  }

  return value
}

/**
 * The Angular CLI reads `angular.json` as JSONC, so comments and trailing commas
 * are legal there — and common. A plain `JSON.parse` rejected them with an
 * untagged `UnknownException` naming neither the file nor the problem.
 */
const readAngularJson = genFn(function* (angularJsonPath: string) {
  const fs = yield* FileSystem.FileSystem

  const content = yield* fs.readFileString(angularJsonPath)
  const angularJson = yield* toEffectSync(
    () => parseJsoncStrictly(content),
    AngularJsonSyntaxError,
    { angularJsonPath }
  )

  const parsedJson = AngularJsonSchema.safeParse(angularJson)

  if (!parsedJson.success) {
    return yield* Effect.fail(
      new AngularJsonFormatError({
        cause: parsedJson.error,
      })
    )
  }

  return parsedJson.data
})

export const getAngularConfigurations = genFn(function* (
  angularJsonPath: string,
  projectName: string
) {
  return getAngularConfigurationNames(
    yield* readAngularJson(angularJsonPath),
    projectName
  )
})

export const resolveAngularConfiguration = function (
  angularJsonPath: string,
  projectName: string,
  configurationName: string
) {
  return Effect.gen(function* () {
    const angularJson = yield* readAngularJson(angularJsonPath)

    const target = getBuildTarget(angularJson, projectName)

    if (!target) {
      return yield* Effect.fail(
        new AngularJsonMissingDataError({
          subject: 'build target',
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

    const outputPath = getAngularOutputPath(target, configurationName)

    if (!outputPath) {
      return yield* Effect.fail(
        new AngularJsonMissingDataError({
          subject: 'output path',
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
