import { CANCEL_EXIT_CODE } from '#core/exit_codes'
import { interceptProcessExit } from '#helpers/runtime'
import { spinner } from '@clack/prompts'
import { Duration, Effect } from 'effect'

export const genLoaderUi = function <TResult, TError, TDeps>({
  process,
  message,
}: {
  process: (
    logMessage: (message: string) => void
  ) => Effect.Effect<TResult, TError, TDeps>
  message: {
    resolveStart: () => string
    resolveCancel: (exitCode: number) => string
    resolveError: (error: TError) => string
    resolveEnd: (duration: Duration.Duration) => string
  }
}) {
  return Effect.gen(function* () {
    const spin = spinner({
      indicator: 'timer',
      frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      delay: 80,
      styleFrame: (frame) => `\x1b[35m${frame}\x1b[0m`,
    })

    let isSettled = false

    return yield* interceptProcessExit(
      Effect.gen(function* () {
        spin.start(message.resolveStart())

        const [duration, result] = yield* Effect.timed(
          process(spin.message).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                spin.error(message.resolveError(error))

                return yield* Effect.fail(error)
              })
            )
          )
        )

        spin.stop(message.resolveEnd(duration))

        return result
      }).pipe(
        // Any interruption that is neither a signal nor a `process.exit` — a
        // sibling failing in a race, a timeout — must still stop the spinner, or
        // the terminal keeps spinning with its cursor hidden.
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            if (!isSettled) spin.cancel(message.resolveCancel(CANCEL_EXIT_CODE))
          })
        )
      ),
      (exitCode) => {
        isSettled = true
        spin.cancel(message.resolveCancel(exitCode))
      }
    )
  })
}
