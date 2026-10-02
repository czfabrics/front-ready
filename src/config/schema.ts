import {
  CacheControlMappingSchema,
  CacheControlSchema,
  DEFAULT_CACHE_CONTROL_VALUE,
  isValidRegExp,
} from '#config/cache_control'
import z from 'zod'

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
        defaultCacheControlValue: CacheControlSchema.default(DEFAULT_CACHE_CONTROL_VALUE),
        cacheControlMapping: CacheControlMappingSchema,
        indexDocumentSuffix: z.string().nonempty().default('index.html'),
        errorDocumentKey: z.string().nonempty().default('index.html'),
      })
      .prefault({}),
    /**
     * How objects become publicly readable. `'acl'` grants `public-read` on the
     * bucket and on every object — what most S3-compatible providers expect.
     * `'policy'` is the AWS way: ACLs disabled (`BucketOwnerEnforced`), Block
     * Public Access lifted, and read granted by a bucket policy. AWS refuses ACLs
     * on any bucket created since April 2023 defaults, so `'acl'` fails there.
     */
    accessMode: z.enum(['acl', 'policy']).default('acl'),
    upload: z
      .object({
        concurrency: z.number().positive().default(50),
        /**
         * Object keys matching any of these are not uploaded — e.g. `'\\.map$'`
         * to keep source maps, and the source they embed, off a public bucket.
         */
        exclude: z
          .array(
            z
              .string()
              .refine(isValidRegExp, { message: 'Not a valid regular expression' })
              .transform((pattern) => new RegExp(pattern))
          )
          .default([]),
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
      type: z.literal('astro'),
      astro: z.object({
        astroConfigPath: z.string().nonempty().optional(),
        mode: z.string().nonempty(),
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
