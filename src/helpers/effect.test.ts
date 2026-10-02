import { toEffect, toEffectSync } from '#helpers/effect'
import { Data, Effect, Fiber } from 'effect'
import { UnknownException } from 'effect/Cause'
import { describe, expect, it } from 'vitest'

class WrapperError extends Data.TaggedError('WrapperError')<{
  readonly message: string
  readonly cause: UnknownException
  readonly subject: string
}> {}

const failWith = function (reason: unknown) {
  return Effect.runPromise(
    toEffect(() => Promise.reject(reason), WrapperError, { subject: 'test' }).pipe(
      Effect.flip
    )
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

describe('toEffect laziness', () => {
  // The promise used to be passed in already started, so building the effect ran
  // the work, retrying replayed one settled result, and nothing could stop it.
  it('does not start the work until the effect runs', () => {
    let started = 0

    toEffect(
      () => {
        started++

        return Promise.resolve()
      },
      WrapperError,
      { subject: 'test' }
    )

    expect(started).toBe(0)
  })

  it('starts the work again on each retry', async () => {
    let attempts = 0

    await Effect.runPromiseExit(
      toEffect(
        () => {
          attempts++

          return Promise.reject(new Error('flaky'))
        },
        WrapperError,
        { subject: 'test' }
      ).pipe(Effect.retry({ times: 2 }))
    )

    expect(attempts).toBe(3)
  })

  it('aborts the signal handed to the work when the effect is interrupted', async () => {
    let received: AbortSignal | undefined

    const fiber = Effect.runFork(
      toEffect(
        (signal) => {
          received = signal

          return new Promise<never>(() => {})
        },
        WrapperError,
        { subject: 'test' }
      )
    )

    await Effect.runPromise(Effect.yieldNow())
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(received?.aborted).toBe(true)
  })
})

describe('toEffectSync', () => {
  // It used to route through a Promise, so it could not run synchronously at all.
  it('runs synchronously', () => {
    expect(
      Effect.runSync(toEffectSync(() => 42, WrapperError, { subject: 'test' }))
    ).toBe(42)
  })

  it('maps a throw into the tagged error, keeping its message', () => {
    const error = Effect.runSync(
      toEffectSync(
        () => {
          throw new Error('lookup failed')
        },
        WrapperError,
        { subject: 'test' }
      ).pipe(Effect.flip)
    )

    expect(error.message).toBe('lookup failed')
  })
})
