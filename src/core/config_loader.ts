import { ConfigError } from '#errors/config'
import { ZodError } from '#errors/config_format'
import { promiseIntoEffect } from '#helpers/promise_into_effect'
import { loadConfig as c12LoadConfig } from 'c12'
import { Effect } from 'effect'
import z from 'zod'

export type Config = z.input<typeof ConfigSchema>
export type InternalConfig = z.output<typeof ConfigSchema>
type ConfigSchema = typeof ConfigSchema
const ConfigSchema = z.object({
    bucket: z.object({
        namePrefix: z.string().nonempty(),
        region: z.string().nonempty(),
        apiVersion: z.string().nonempty(),
        endpoint: z.string().nonempty(),
        forcePathStyle: z.string().nonempty().optional(),
        credentials: z.object({
            accessKeyId: z.string().nonempty(),
            secretAccessKey: z.string().nonempty(),
        }),
    }),
    front: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('angular'),
            angular: z.object({
                angularJsonPath: z.string().nonempty(),
                configurationName: z.string().nonempty().optional(),
            }),
        }),
    ]),
})

export const loadConfig = Effect.gen(function* () {
    const { config } = yield* promiseIntoEffect(
        c12LoadConfig<Config>({
            name: 'frontready',
            configFileRequired: true,
        }),
        {
            errorConstructor: ConfigError,
            default: {
                message: 'Unable to load the configuration',
            },
        }
    )

    const parsedConfig = ConfigSchema.safeParse(config)

    if (parsedConfig.success) {
        return parsedConfig.data
    }

    return yield* Effect.fail(
        new ZodError({
            cause: parsedConfig.error,
        })
    )
})
