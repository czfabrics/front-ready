import { interruptOnPromptCancel } from '#ui/prompt'
import { Cause, Effect, Exit } from 'effect'
import { describe, expect, it, vi } from 'vitest'

// Clack's real cancel symbol is module-private, so stand one in and make
// `isCancel` recognise it — the wrapper must go through `isCancel`, not a guess.
const { CANCEL } = vi.hoisted(() => ({ CANCEL: Symbol('clack:cancel') }))

vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === CANCEL,
}))

const run = function <TValue>(value: TValue | symbol) {
  return Effect.runPromiseExit(interruptOnPromptCancel(Effect.succeed(value)))
}

describe('interruptOnPromptCancel', () => {
  // A cancelled confirmation used to resolve to the (truthy) cancel symbol, so
  // `if (!shouldContinue)` was skipped and the deploy went ahead.
  it('interrupts on a cancelled confirmation instead of yielding a truthy value', async () => {
    const exit = await run<boolean>(CANCEL)

    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true)
  })

  // A cancelled select used to be `.toString()`ed into "Symbol(clack:cancel)" and
  // used as the Angular configuration name.
  it('interrupts on a cancelled select instead of yielding the symbol', async () => {
    const exit = await run<string>(CANCEL)

    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true)
  })

  it('passes an explicit "no" through as false, not as an interrupt', async () => {
    const exit = await run<boolean>(false)

    expect(exit).toStrictEqual(Exit.succeed(false))
  })

  it('passes a picked value through unchanged', async () => {
    const exit = await run<string>('production')

    expect(exit).toStrictEqual(Exit.succeed('production'))
  })
})
