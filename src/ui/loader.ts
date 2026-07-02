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
      }),
      (exitCode) => spin.cancel(message.resolveCancel(exitCode))
    )
  })
}
