import { Command } from '@effect/platform'
import { Effect, Option, pipe, Stream } from 'effect'

/** Arguments made only of these need no quoting in either shell. */
const SHELL_SAFE = /^[A-Za-z0-9_\-./=:@+,]+$/

/**
 * Quotes one argument for the shell `runInShell` spawns, which receives the
 * arguments joined with spaces and re-parses them. Unquoted, an argument holding
 * a space was split in two, and one holding `;` or `&&` ran as a command of its
 * own. `cmd.exe` still expands `%VAR%` inside double quotes — it has no fully
 * inert quoting.
 */
export const quoteShellArgument = function (
  argument: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (SHELL_SAFE.test(argument)) {
    return argument
  }

  return platform === 'win32'
    ? `"${argument.replace(/"/g, '""')}"`
    : `'${argument.replace(/'/g, `'\\''`)}'`
}

/**
 * The command itself still goes through a shell: a configured `command` such as
 * `'npx ng build'` relies on it, and so do Windows `.cmd` shims like `ng.cmd`.
 * Its arguments are quoted, so each one stays exactly one argument.
 */
const toShellCommand = function (command: Command.Command): Command.Command {
  if (command._tag !== 'StandardCommand') {
    return command.pipe(Command.runInShell(true))
  }

  const quoted = Command.make(
    command.command,
    ...command.args.map((argument) => quoteShellArgument(argument))
  ).pipe(Command.env(Object.fromEntries(command.env)), Command.runInShell(true))

  return Option.match(command.cwd, {
    onNone: () => quoted,
    onSome: (cwd) => quoted.pipe(Command.workingDirectory(cwd)),
  })
}

export const runCommand = function (
  command: Command.Command,
  logMessage: (message: string) => void
) {
  return Effect.scoped(
    pipe(
      Command.start(toShellCommand(command)),
      Effect.flatMap((process) =>
        Effect.all(
          [
            process.exitCode,
            process.stdout.pipe(
              Stream.decodeText(),
              Stream.runForEach((chunk) => Effect.sync(() => logMessage(chunk)))
            ),
            process.stderr.pipe(
              Stream.decodeText(),
              Stream.runForEach((chunk) => Effect.sync(() => logMessage(chunk)))
            ),
          ],
          { concurrency: 3 }
        )
      ),
      Effect.map((result) => result[0])
    )
  )
}
