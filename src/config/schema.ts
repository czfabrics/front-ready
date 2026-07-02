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
export type ConfigSchema = typeof ConfigSchema
export const ConfigSchema = z.object({
  bucket: z.object({
    namePrefix: z
      .string()
      .nonempty()
      .regex(/[a-z-]*/, 'String should be kekab-case string'),
    params: z.object({
      region: z.string().nonempty(),
      apiVersion: z.string().nonempty(),
      endpoint: z.string().nonempty(),
      forcePathStyle: z.union([z.stringbool(), z.boolean()]).optional(),
      credentials: z.object({
        accessKeyId: z.string().nonempty(),
        secretAccessKey: z.string().nonempty(),
      }),
    }),
    front: z
      .object({
        cacheControlMapping: z
          .record(
            z.templateLiteral([z.literal('^'), z.string(), z.literal('$')]),
            CacheControlSchema
          )
          .default({
            '^index.html$':
              'max-age=60, stale-while-revalidate=600, stale-if-error=86400',
            '^assets/.+$':
              'max-age=86400, stale-while-revalidate=600, stale-if-error=86400',
            '^translate/.+$':
              'max-age=14400, stale-while-revalidate=600, stale-if-error=86400',
            '^.+$': 'max-age=31536000, stale-while-revalidate=600, stale-if-error=86400',
          }),
        indexDocumentSuffix: z.string().nonempty().default('index.html'),
        errorDocumentKey: z.string().nonempty().default('index.html'),
      })
      .prefault({}),
    upload: z
      .object({
        concurrency: z.number().positive().default(50),
      })
      .prefault({}),
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
    z.object({
      type: z.literal('custom'),
      custom: z.object({
        build: z.object({
          command: z.string().nonempty(),
          args: z.array(z.string().nonempty()),
        }),
        environmentName: z.string().nonempty(),
        buildOutputPath: z.string().nonempty(),
      }),
    }),
  ]),
})
