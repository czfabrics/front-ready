import { ConfigSchema } from '#config/schema'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { Effect, Either } from 'effect'
import { describe, expect, it } from 'vitest'

const config = ConfigSchema.parse({
  bucket: { namePrefix: 'front-ready', params: { region: 'eu-west-3' } },
  front: {
    type: 'custom',
    custom: {
      build: { command: 'true', args: [] },
      environmentName: 'production',
      buildOutputPath: './dist',
    },
  },
})

const nameFor = function (identifier: string) {
  return Effect.runSync(Effect.either(makeDeploymentBucketName(config, identifier)))
}

describe('makeDeploymentBucketName', () => {
  it('composes the prefix and the identifier', () => {
    expect(nameFor('production')).toStrictEqual(Either.right('front-ready-production'))
  })

  // S3 rejects these with an opaque `InvalidBucketName`; say which rule broke.
  it.each([
    ['Production', 'lowercase'],
    ['prod_eu', 'lowercase'],
    ['x'.repeat(60), '63 characters'],
    ['prod-', 'start and end'],
    ['a..b', 'adjacent dots'],
  ])('rejects the identifier %j, naming the rule', (identifier, rule) => {
    const result = nameFor(identifier)

    expect(Either.isLeft(result) && result.left.message).toContain(rule)
  })
})
