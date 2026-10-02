import { CacheControlMappingSchema, CacheControlSchema } from '#config/cache_control'
import { describe, expect, it } from 'vitest'

const patternsOf = function (overrides: Record<string, string | null> | undefined) {
  return CacheControlMappingSchema.parse(overrides).map(({ pattern }) => pattern)
}

const valueFor = function (overrides: Record<string, string | null>, key: string) {
  return CacheControlMappingSchema.parse(overrides).find(({ regExp }) => regExp.test(key))
    ?.value
}

describe('CacheControlMappingSchema', () => {
  it('uses the defaults when nothing is configured', () => {
    expect(patternsOf(undefined)).toStrictEqual([
      '^index\\.html$',
      '^assets/.+$',
      '^translate/.+$',
      '^.+\\.html$',
      '^.+$',
    ])
  })

  // Supplying one rule used to replace the whole mapping, catch-all included, so
  // every hashed chunk silently fell back to the 60 s default.
  it('adds a new rule ahead of the defaults instead of replacing them', () => {
    expect(patternsOf({ '^fonts/.+$': 'max-age=604800' })).toStrictEqual([
      '^fonts/.+$',
      '^index\\.html$',
      '^assets/.+$',
      '^translate/.+$',
      '^.+\\.html$',
      '^.+$',
    ])
  })

  it('keeps the hashed-chunk catch-all when a rule is added', () => {
    expect(valueFor({ '^fonts/.+$': 'max-age=604800' }, '_astro/x.abc123.js')).toContain(
      'max-age=31536000'
    )
  })

  it('overrides a default in place, so the catch-all stays last', () => {
    expect(patternsOf({ '^.+$': 'max-age=3600' }).at(-1)).toBe('^.+$')
    expect(valueFor({ '^.+$': 'max-age=3600' }, '_astro/x.abc123.js')).toBe(
      'max-age=3600'
    )
  })

  it('removes a default set to null', () => {
    expect(patternsOf({ '^translate/.+$': null })).not.toContain('^translate/.+$')
  })

  it('accepts an unanchored pattern', () => {
    expect(CacheControlMappingSchema.safeParse({ 'assets/': 'max-age=60' }).success).toBe(
      true
    )
  })

  // An uncompilable pattern used to pass, then throw mid-deploy.
  it('rejects a pattern that does not compile', () => {
    expect(CacheControlMappingSchema.safeParse({ '^[a$': 'max-age=60' }).success).toBe(
      false
    )
  })

  it('escapes the dot of the default index rule', () => {
    expect(valueFor({}, 'indexXhtml')).toContain('max-age=31536000')
  })

  it('marks hashed chunks immutable by default', () => {
    expect(valueFor({}, '_astro/x.abc123.js')).toContain('immutable')
  })
})

describe('CacheControlSchema', () => {
  it.each([
    ['max-age=60, max-age=120', 'repeated'],
    ['no-store, max-age=60', 'contradicts "no-store"'],
    ['immutable, no-store', 'contradicts "no-store"'],
    ['public, private', 'contradict'],
    ['no-cache, immutable', 'contradict'],
    ['no-cache=1', 'does not take a value'],
    ['max-age=-5', 'non-negative integer'],
    ['max-age=forever', 'non-negative integer'],
    ['max-stale=60', 'Unknown directive'],
  ])('rejects %j', (header, reason) => {
    const result = CacheControlSchema.safeParse(header)

    expect(result.error?.issues.map(({ message }) => message).join('\n')).toContain(
      reason
    )
  })

  // The header is sent as written, so stray spacing used to reach every cache.
  it('normalises spacing and case', () => {
    expect(CacheControlSchema.parse('MAX-AGE= 60 ,  Public')).toBe('max-age=60, public')
  })

  it('leaves a well-formed value unchanged', () => {
    const header = 'max-age=86400, stale-while-revalidate=600, stale-if-error=86400'

    expect(CacheControlSchema.parse(header)).toBe(header)
  })
})
