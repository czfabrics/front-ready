import { runCommand } from '#core/command_runner'
import { CommandError } from '#errors/command'
import { spinner } from '@clack/prompts'
import { Command } from '@effect/platform'
import { Duration, Effect } from 'effect'

export const genCommandUi = function ({
  command,
  message,
}: {
  command: Command.Command
  message: {
    resolveStartMessage: () => string
    resolveErrorMessage: (exitCode: number) => string
    resolveEndMessage: (duration: Duration.Duration) => string
  }
}) {
  return Effect.gen(function* () {
    const spin = spinner()
    spin.start(message.resolveStartMessage())

    const [duration, exitCode] = yield* Effect.timed(runCommand(command, spin.message))

    if (exitCode !== 0) {
      spin.error(message.resolveErrorMessage(exitCode))
      return yield* Effect.fail(
        new CommandError({
          message: message.resolveErrorMessage(exitCode),
          code: exitCode,
        })
      )
    }

    spin.stop(message.resolveEndMessage(duration))
  })
}
