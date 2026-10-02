import { interceptProcessExit } from '#helpers/runtime'
import { Cause, Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  process.exitCode = undefined
})

describe('interceptProcessExit', () => {
  // The call used to be swallowed and the work ran on, in a state its caller
  // believed was over.
  it('interrupts the work when it asks the process to exit', async () => {
    let reachedAfterExit = false

    const exit = await Effect.runPromiseExit(
      interceptProcessExit(
        Effect.gen(function* () {
          process.exit(0)
          yield* Effect.sleep('50 millis')
          reachedAfterExit = true
        }),
        () => {}
      )
    )

    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true)
    expect(reachedAfterExit).toBe(false)
  })

  it('reports the exit code to the callback, defaulting to the cancellation one', async () => {
    const codes: number[] = []

    await Effect.runPromiseExit(
      interceptProcessExit(
        Effect.sync(() => process.exit()),
        (code) => codes.push(code)
      )
    )

    expect(codes).toStrictEqual([130])
  })

  it('keeps a non-zero code asked for as the exit code', async () => {
    await Effect.runPromiseExit(
      interceptProcessExit(
        Effect.sync(() => process.exit(2)),
        () => {}
      )
    )

    expect(process.exitCode).toBe(2)
  })

  it('restores process.exit afterwards', async () => {
    const original = process.exit

    await Effect.runPromise(interceptProcessExit(Effect.void, () => {}))

    expect(process.exit).toBe(original)
  })

  it('lets the work finish normally when nothing asks to exit', async () => {
    const exit = await Effect.runPromiseExit(
      interceptProcessExit(Effect.succeed('done'), () => {})
    )

    expect(exit).toStrictEqual(Exit.succeed('done'))
  })
})
