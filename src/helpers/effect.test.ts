import { toEffect } from '#helpers/effect'
import { Data, Effect } from 'effect'
import { UnknownException } from 'effect/Cause'
import { describe, expect, it } from 'vitest'

class WrapperError extends Data.TaggedError('WrapperError')<{
  readonly message: string
  readonly cause: UnknownException
  readonly subject: string
}> {}

const failWith = function (reason: unknown) {
  return Effect.runPromise(
    toEffect(Promise.reject(reason), WrapperError, { subject: 'test' }).pipe(Effect.flip)
  )
}

describe('toEffect', () => {
  it('reports the message of a rejected Error rather than the Effect wrapper text', async () => {
    const error = await failWith(new Error('Required config cannot be resolved.'))

    expect(error.message).toBe('Required config cannot be resolved.')
  })

  it('reports a rejected string as-is', async () => {
    const error = await failWith('the bucket is not reachable')

    expect(error.message).toBe('the bucket is not reachable')
  })

  it('falls back to the Effect wrapper text for a non-Error rejection', async () => {
    const error = await failWith({ statusCode: 403 })

    expect(error.message).toContain('Effect.tryPromise')
  })

  it('falls back to the Effect wrapper text for an Error with no message', async () => {
    const error = await failWith(new Error(''))

    expect(error.message).toContain('Effect.tryPromise')
  })

  it('keeps the original rejection reachable on the cause', async () => {
    const thrown = new Error('boom')
    const error = await failWith(thrown)

    expect(error.cause.error).toBe(thrown)
  })

  it('attaches the extra context passed by the caller', async () => {
    const error = await failWith(new Error('boom'))

    expect(error.subject).toBe('test')
  })
})
