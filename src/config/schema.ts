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
export const ConfigSchema = z.strictObject({
  bucket: z.strictObject({
    namePrefix: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]*$/,
        'Should be kebab-case: lowercase letters, digits and hyphens, starting with a letter or digit'
      ),
    params: z.strictObject({
      region: z.string().nonempty(),
      apiVersion: z.string().nonempty().optional(),
      /** Omit for AWS S3; set it for any S3-compatible provider. */
      endpoint: z.string().nonempty().optional(),
      forcePathStyle: z.union([z.stringbool(), z.boolean()]).optional(),
      /**
       * Omit to use the AWS SDK's default credential chain — environment
       * variables, shared config files, or an instance / IRSA role — so CI need
       * not write secrets into the config file.
       */
      credentials: z
        .strictObject({
          accessKeyId: z.string().nonempty(),
          secretAccessKey: z.string().nonempty(),
          sessionToken: z.string().nonempty().optional(),
        })
        .optional(),
    }),
    front: z
      .strictObject({
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
      .strictObject({
        concurrency: z.number().int().positive().default(50),
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
    z.strictObject({
      type: z.literal('angular'),
      angular: z.strictObject({
        projectName: z.string().nonempty(),
        angularJsonPath: z.string().nonempty(),
        configurationName: z.string().nonempty().optional(),
      }),
    }),
    z.strictObject({
      type: z.literal('astro'),
      astro: z.strictObject({
        astroConfigPath: z.string().nonempty().optional(),
        mode: z.string().nonempty(),
      }),
    }),
    z.strictObject({
      type: z.literal('custom'),
      custom: z.strictObject({
        build: z.strictObject({
          command: z.string().nonempty(),
          args: z.array(z.string().nonempty()),
        }),
        environmentName: z.string().nonempty(),
        buildOutputPath: z.string().nonempty(),
      }),
    }),
  ]),
})
