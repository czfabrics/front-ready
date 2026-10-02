import { Effect } from 'effect'
import * as readline from 'node:readline'

/**
 * `emitKeypressEvents` attaches a permanent `'data'` listener that puts stdin in
 * flowing mode, and a flowing stdin keeps the event loop alive. Removing our own
 * `'keypress'` listener is not enough: the stream has to be paused again, or a
 * command that never ran a clack prompt (which pauses stdin on close) finishes its
 * outro and then hangs forever on a real terminal. Raw mode is restored to what it
 * was, not forced off, so a caller that had it on keeps it.
 */
const interruptOnCtrlC = function () {
  return Effect.async<never>((resume) => {
    const wasRaw = process.stdin.isTTY ? process.stdin.isRaw : false

    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    const onKeypress = (_: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') {
        resume(Effect.interrupt)
      }
    }
    process.stdin.on('keypress', onKeypress)

    return Effect.sync(() => {
      process.stdin.off('keypress', onKeypress)
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw)
      process.stdin.pause()
    })
  })
}

export const runAndInterruptOnCtrlC = function <TResult, TError, TDeps>(
  effect: Effect.Effect<TResult, TError, TDeps>
): Effect.Effect<TResult, TError, TDeps> {
  return Effect.raceFirst(interruptOnCtrlC(), effect)
}

const overrideProcessExit = (override: (code?: number) => void) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const original = process.exit
      process.exit = override as typeof process.exit
      return original
    }),
    (original) =>
      Effect.sync(() => {
        process.exit = original
      })
  )

export const interceptProcessExit = function <TResult, TError, TDeps>(
  effect: Effect.Effect<TResult, TError, TDeps>,
  callback: (exitCode: number) => void
) {
  return Effect.scoped(
    Effect.gen(function* () {
      yield* overrideProcessExit((exitCode) => {
        callback(exitCode ?? 130)
      })

      return yield* effect
    })
  )
}
