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
    resolveStart: () => string
    resolveError: (exitCode: number) => string
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
    spin.start(message.resolveStart())

    const [duration, exitCode] = yield* Effect.timed(runCommand(command, spin.message))

    if (exitCode !== 0) {
      spin.error(message.resolveError(exitCode))
      return yield* Effect.fail(
        new CommandError({
          message: message.resolveError(exitCode),
          code: exitCode,
        })
      )
    }

    spin.stop(message.resolveEnd(duration))
  })
}
