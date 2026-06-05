import { ConfigFormatError } from '#errors/config_format'
import { ConfigWrapperError } from '#errors/interop/config_wrapper'
import { toEffect } from '#helpers/promise'
import { loadConfig as c12LoadConfig } from 'c12'
import { Effect } from 'effect'
import z from 'zod'

const NUMERIC = new Set([
    'max-age',
    's-maxage',
    'stale-while-revalidate',
    'stale-if-error',
])

const FLAGS = new Set([
    'no-cache',
    'no-store',
    'no-transform',
    'must-revalidate',
    'proxy-revalidate',
    'must-understand',
    'private',
    'public',
    'immutable',
])

const CacheControlSchema = z.string().superRefine((header, ctx) => {
    for (const part of header.split(',')) {
        const t = part.trim()
        if (!t) continue

        const i = t.indexOf('=')
        const name = (i === -1 ? t : t.slice(0, i)).trim().toLowerCase()
        const value =
            i === -1
                ? undefined
                : t
                      .slice(i + 1)
                      .trim()
                      .replace(/^"(.*)"$/, '$1')

        if (NUMERIC.has(name)) {
            if (value === undefined || !/^\d+$/.test(value)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `Directive "${name}" requires a non-negative integer`,
                })
            }
        } else if (FLAGS.has(name)) {
            if (value !== undefined) {
                ctx.addIssue({
                    code: 'custom',
                    message: `Directive "${name}" does not take a value`,
                })
            }
        } else {
            ctx.addIssue({
                code: 'custom',
                message: `Unknown directive "${name}"`,
            })
        }
    }
})

export type Config = z.input<typeof ConfigSchema>
export type InternalConfig = z.output<typeof ConfigSchema>
type ConfigSchema = typeof ConfigSchema
const ConfigSchema = z.object({
    bucket: z.object({
        namePrefix: z.string().nonempty(),
        region: z.string().nonempty(),
        apiVersion: z.string().nonempty(),
        endpoint: z.string().nonempty(),
        forcePathStyle: z.union([z.stringbool(), z.boolean()]).optional(),
        credentials: z.object({
            accessKeyId: z.string().nonempty(),
            secretAccessKey: z.string().nonempty(),
        }),
    }),
    bucketFront: z.object({
        cacheControlMapping: z.record(
            z.templateLiteral([z.literal('^'), z.string(), z.literal('$')]),
            CacheControlSchema
        ),
        indexDocumentSuffix: z.string().nonempty().default('index.html'),
        errorDocumentKey: z.string().nonempty().default('index.html'),
    }),
    upload: z.object({
        concurrency: z.number().positive().default(50),
        filesToTheEnd: z.array(z.string()).default(['index.html']),
    }),
    front: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('angular'),
            angular: z.object({
                projectName: z.string().nonempty(),
                angularJsonPath: z.string().nonempty(),
                configurationName: z.string().nonempty().optional(),
            }),
        }),
    ]),
})

export const loadConfig = Effect.gen(function* () {
    const { config } = yield* toEffect(
        c12LoadConfig<Config>({
            name: 'frontready',
            configFileRequired: true,
        }),
        ConfigWrapperError
    )

    const parsedConfig = ConfigSchema.safeParse(config)

    if (parsedConfig.success) {
        return parsedConfig.data
    }

    return yield* Effect.fail(
        new ConfigFormatError({
            cause: parsedConfig.error,
        })
    )
})
