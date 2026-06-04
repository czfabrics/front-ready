import { ZodError } from '#errors/config_format'
import { FileSystem } from '@effect/platform'
import { Effect } from 'effect'
import z from 'zod'

const AngularTargetSchema = z.object({
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

const getAngularConfigurationNames = (angularJson: AngularJson): string[] => {
    const configurationNames = new Set<string>()

    for (const project of Object.values(angularJson.projects ?? {})) {
        const targets = project.architect ?? project.targets ?? {}
        for (const target of Object.values(targets)) {
            for (const name of Object.keys(target.configurations ?? {})) {
                configurationNames.add(name)
            }
        }
    }
    return [...configurationNames]
}

export const resolveAngularConfigurations = function (angularJsonPath: string) {
    return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem

        const content = yield* fs.readFileString(angularJsonPath)
        const angularJson = yield* Effect.try(() => JSON.parse(content) as AngularJson)

        const parsedJson = AngularJsonSchema.safeParse(angularJson)

        if (parsedJson.success) {
            return getAngularConfigurationNames(parsedJson.data)
        }

        return yield* Effect.fail(
            new ZodError({
                cause: parsedJson.error,
            })
        )
    })
}
