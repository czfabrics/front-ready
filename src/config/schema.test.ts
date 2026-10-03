import { ConfigSchema } from '#config/schema'
import { describe, expect, it } from 'vitest'

const BASE = {
  bucket: {
    namePrefix: 'front-ready',
    params: {
      region: 'eu-west-3',
      credentials: { accessKeyId: 'id', secretAccessKey: 'secret' },
    },
  },
  front: {
    type: 'custom',
    custom: {
      build: { command: 'true', args: [] },
      environmentName: 'production',
      buildOutputPath: './dist',
    },
  },
} as const

const withBucket = function (bucket: Record<string, unknown>) {
  return ConfigSchema.safeParse({ ...BASE, bucket: { ...BASE.bucket, ...bucket } })
}

describe('ConfigSchema', () => {
  it('accepts a minimal config', () => {
    expect(ConfigSchema.safeParse(BASE).success).toBe(true)
  })

  // The regex was unanchored and `*`-quantified, so it matched every string.
  it.each(['MyApp', 'my_app', 'my app', '-app', ''])(
    'rejects the name prefix %j',
    (prefix) => {
      expect(withBucket({ namePrefix: prefix }).success).toBe(false)
    }
  )

  it.each(['app', 'my-app', '2fa-portal'])('accepts the name prefix %j', (prefix) => {
    expect(withBucket({ namePrefix: prefix }).success).toBe(true)
  })

  // Unknown keys were silently dropped, so a typo quietly fell back to a default.
  it('rejects a misspelt key instead of silently ignoring it', () => {
    const result = withBucket({ front: { indexDocumentSufix: 'main.html' } })

    expect(result.success).toBe(false)
  })

  it('rejects an unknown top-level key', () => {
    expect(ConfigSchema.safeParse({ ...BASE, buket: {} }).success).toBe(false)
  })

  it.each([2.7, 0.5, 0, -1])('rejects the upload concurrency %j', (concurrency) => {
    expect(withBucket({ upload: { concurrency } }).success).toBe(false)
  })

  // Credentials were mandatory, forcing CI to write secrets into the config.
  it('leaves credentials, endpoint and API version to the AWS SDK when omitted', () => {
    const result = withBucket({ params: { region: 'eu-west-3' } })

    expect(result.data?.bucket.params).toStrictEqual({ region: 'eu-west-3' })
  })

  it('defaults to ACL-based public access', () => {
    expect(ConfigSchema.parse(BASE).bucket.accessMode).toBe('acl')
  })

  describe('useDefaultCacheControl', () => {
    const frontOf = function (front: Record<string, unknown>) {
      return ConfigSchema.parse({ ...BASE, bucket: { ...BASE.bucket, front } }).bucket
        .front
    }

    it('applies the default rules and value unless disabled', () => {
      const front = frontOf({})

      expect(front.defaultCacheControlValue).toBeDefined()
      expect(front.cacheControlMapping.map(({ pattern }) => pattern)).toContain('^.+$')
    })

    it('drops both the default rules and the default value when disabled', () => {
      const front = frontOf({
        useDefaultCacheControl: false,
        cacheControlMapping: { '^x$': 'max-age=60' },
      })

      expect(front.defaultCacheControlValue).toBeUndefined()
      expect(front.cacheControlMapping.map(({ pattern }) => pattern)).toStrictEqual([
        '^x$',
      ])
    })

    it('keeps a default value set explicitly when disabled', () => {
      const front = frontOf({
        useDefaultCacheControl: false,
        defaultCacheControlValue: 'no-cache',
      })

      expect(front.defaultCacheControlValue).toBe('no-cache')
    })
  })

  describe('front.prebuild', () => {
    it('defaults the prebuild arguments to none', () => {
      const config = ConfigSchema.parse({
        ...BASE,
        front: { ...BASE.front, prebuild: { command: 'npm' } },
      })

      expect(config.front.prebuild).toStrictEqual({ command: 'npm', args: [] })
    })

    it('rejects an empty prebuild command', () => {
      const result = ConfigSchema.safeParse({
        ...BASE,
        front: { ...BASE.front, prebuild: { command: '' } },
      })

      expect(result.success).toBe(false)
    })
  })
})
