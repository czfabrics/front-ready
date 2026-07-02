import { CommandError } from '#errors/command'
import { runCommand } from '#helpers/command'
import { genLoaderUi } from '#ui/loader'
import { Command } from '@effect/platform'
import { PlatformError } from '@effect/platform/Error'
import { Duration, Effect } from 'effect'

export const genCommandUi = function ({
  command,
  message,
}: {
  command: Command.Command
  message: {
    resolveStart: () => string
    resolveCancel: (exitCode: number) => string
    resolveError: (error: PlatformError | CommandError) => string
    resolveEnd: (duration: Duration.Duration) => string
  }
}) {
  return genLoaderUi({
    process: (logMessage) =>
      Effect.gen(function* () {
        const exitCode = yield* runCommand(command, logMessage)

        if (exitCode !== 0) {
          return yield* Effect.fail(
            new CommandError({
              message: `Command exited with code '${exitCode}'`,
              code: exitCode,
            })
          )
        }

        return exitCode
      }),
    message: message,
  })
}
