import { Effect } from 'effect'
import * as readline from 'node:readline'

const interruptOnCtrlC = function () {
  return Effect.async<never>((resume) => {
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
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
    })
  })
}

export const runAndInterruptOnCtrlC = function <TResult, TError, TDeps>(
  effect: Effect.Effect<TResult, TError, TDeps>
): Effect.Effect<TResult, TError, TDeps> {
  return Effect.raceFirst(interruptOnCtrlC(), effect)
}
