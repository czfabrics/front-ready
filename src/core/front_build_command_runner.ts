import { runCommand } from '#core/command_runner'
import { CommandError } from '#errors/command'
import { InternalError } from '#errors/internal'
import { promiseIntoEffect } from '#helpers/promise_into_effect'
import { tasks } from '@clack/prompts'
import { Command, CommandExecutor } from '@effect/platform'
import { Duration, Effect, Runtime } from 'effect'

export const runFrontBuildCommand = function (command: Command.Command) {
    return Effect.gen(function* () {
        const runtime = yield* Effect.runtime<CommandExecutor.CommandExecutor>()
        const runPromise = Runtime.runPromise(runtime)

        yield* promiseIntoEffect(
            tasks([
                {
                    title: 'Building front',
                    task: (logMessage) => {
                        return runPromise(
                            Effect.gen(function* () {
                                const [duration, exitCode] = yield* Effect.timed(
                                    runCommand(command, logMessage)
                                )

                                if (exitCode !== 0) {
                                    return yield* Effect.fail(
                                        new CommandError({
                                            message: `Build failed`,
                                            code: exitCode,
                                        })
                                    )
                                }

                                return `Build finished in ${Duration.toMillis(duration)}ms`
                            })
                        )
                    },
                },
            ]),
            {
                errorConstructor: InternalError,
                default: {
                    message: 'Unable to run build command',
                },
            }
        )
    })
}
