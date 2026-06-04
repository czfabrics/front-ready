import { AngularJsonFormatError, AngularJsonMissingDataError } from '#errors/angular'
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

const AngularTargetSchema = z.object({
    builder: z.string().optional(),
    options: z
        .object({
            outputPath: OutputPathSchema.optional(),
        })
        .optional(),
    configurations: z.record(z.string(), z.unknown()).optional(),
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

/**
 * Only the `:application` builder emits into a `browser` subfolder.
 * @param builder
 * @returns
 */
const usesBrowserSubfolder = (builder?: string): boolean =>
    builder?.endsWith(':application') ?? false

const getAngularOutputPath = (
    angularJson: AngularJson,
    projectName: string,
    targetName = 'build'
): string | undefined => {
    const projects = angularJson.projects ?? {}
    const project = projects[projectName]

    if (!project) return undefined

    const target = getProjectTargets(project)[targetName]
    const outputPath = target?.options?.outputPath
    if (outputPath === undefined) return undefined

    // Angular 17+ object form: { base, browser? } — browser defaults to "browser"
    if (typeof outputPath === 'object') {
        const browser = outputPath.browser ?? 'browser'
        return browser ? `${outputPath.base}/${browser}` : outputPath.base
    }

    // String form: the application builder still appends /browser; older builders don't.
    return usesBrowserSubfolder(target?.builder) ? `${outputPath}/browser` : outputPath
}

export const resolveAngularConfigurations = function (
    angularJsonPath: string,
    projectName: string
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

        const outputPath = getAngularOutputPath(parsedJson.data, projectName)

        if (!outputPath) {
            return yield* Effect.fail(
                new AngularJsonMissingDataError({
                    subject: 'output path',
                    projectName: projectName,
                })
            )
        }

        return {
            configurations: getAngularConfigurationNames(parsedJson.data),
            outputPath,
        }
    })
}
