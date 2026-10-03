import { ConfigSchema } from '#config/schema'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { log } from '@clack/prompts'
import { Effect, Either } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

const configFor = function (namePrefix: string) {
  return ConfigSchema.parse({
    bucket: { namePrefix, params: { region: 'eu-west-3' } },
    front: {
      type: 'custom',
      custom: {
        build: { command: 'true', args: [] },
        environmentName: 'production',
        buildOutputPath: './dist',
      },
    },
  })
}

const nameFor = function (identifier: string, namePrefix = 'front-ready') {
  return Effect.runSync(
    Effect.either(makeDeploymentBucketName(configFor(namePrefix), identifier))
  )
}

/** S3's rules: 3–63 chars, lowercase letters, digits and hyphens, alphanumeric ends. */
const S3_BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

describe('makeDeploymentBucketName', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('composes the prefix and the identifier', () => {
    expect(nameFor('production')).toStrictEqual(Either.right('front-ready-production'))
  })

  it.each([
    ['Production', 'front-ready-production'],
    ['prod_eu', 'front-ready-prod-eu'],
    ['Prod EU', 'front-ready-prod-eu'],
    ['a..b', 'front-ready-a-b'],
    ['__staging__', 'front-ready-staging'],
    ['pre--prod', 'front-ready-pre-prod'],
    ['Préprod', 'front-ready-preprod'],
    ['España', 'front-ready-espana'],
  ])('normalizes the identifier %j', (identifier, bucketName) => {
    expect(nameFor(identifier)).toStrictEqual(Either.right(bucketName))
  })

  // The identifier names the environment: cutting it could merge two of them.
  it('cuts the prefix, never the identifier', () => {
    const result = Either.getOrThrow(nameFor('production', 'p'.repeat(70)))

    expect(result).toBe(`${'p'.repeat(52)}-production`)
    expect(result).toMatch(S3_BUCKET_NAME)
  })

  it('keeps a long identifier whole, cutting the prefix to make room', () => {
    const identifier = 'x'.repeat(61)

    expect(nameFor(identifier)).toStrictEqual(Either.right(`f-${identifier}`))
  })

  it('warns that the prefix was cut', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})

    nameFor('production', 'p'.repeat(70))

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('name prefix was cut')
  })

  it('does not warn when the name fits', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})

    nameFor('Prod_EU')

    expect(warn).not.toHaveBeenCalled()
  })

  // A cut landing right after a hyphen would leave the prefix ending on it.
  it('never ends a cut prefix on a hyphen', () => {
    const result = nameFor('production', `${'a'.repeat(51)}-${'b'.repeat(20)}`)

    expect(result).toStrictEqual(Either.right(`${'a'.repeat(51)}-production`))
  })

  it('rejects an identifier that leaves no room for the prefix', () => {
    const result = nameFor('x'.repeat(62))

    expect(Either.isLeft(result) && result.left.message).toContain('too long')
  })

  it.each(['___', '🚀', '日本語'])(
    'rejects the identifier %j, which has nothing left once normalized',
    (identifier) => {
      const result = nameFor(identifier)

      expect(Either.isLeft(result) && result.left.message).toContain('no letter or digit')
    }
  )
})
