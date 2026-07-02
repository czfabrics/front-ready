import { Command } from '@effect/platform'
import { Effect, pipe, Stream } from 'effect'

export const runCommand = function (
  command: Command.Command,
  logMessage: (message: string) => void
) {
  return Effect.scoped(
    pipe(
      Command.start(command.pipe(Command.runInShell(true))),
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
