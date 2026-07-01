import { spinner } from '@clack/prompts'
import { Effect } from 'effect'

export const genLoaderUi = function <TResult, TError extends Error>({
  process,
  message,
}: {
  process: () => Effect.Effect<TResult, TError, never>
  message: {
    resolveStart: () => string
    resolveError: (error: Error) => string
    resolveEnd: () => string
  }
}) {
  return Effect.gen(function* () {
    const spin = spinner({
      indicator: 'timer',
      frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      delay: 80,
      styleFrame: (frame) => `\x1b[35m${frame}\x1b[0m`,
    })
    spin.start(message.resolveStart())

    const result = yield* process().pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          spin.error(message.resolveError(error))

          return yield* Effect.fail(error)
        })
      )
    )

    spin.stop(message.resolveEnd())
    return result
  })
}
