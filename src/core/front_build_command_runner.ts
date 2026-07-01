import { FrontDeploymentContext } from '#contexts/front_deployment'
import { runCommand } from '#core/command_runner'
import { CommandError } from '#errors/command'
import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { toEffect } from '#helpers/promise'
import { tasks } from '@clack/prompts'
import { CommandExecutor } from '@effect/platform'
import { Duration, Effect, Runtime } from 'effect'

export const runFrontBuildCommand = Effect.gen(function* () {
  const deploymentContext = yield* FrontDeploymentContext

  const runtime = yield* Effect.runtime<CommandExecutor.CommandExecutor>()
  const runPromise = Runtime.runPromise(runtime)

  yield* toEffect(
    tasks([
      {
        title: 'Building front',
        task: (logMessage) => {
          return runPromise(
            Effect.gen(function* () {
              const [duration, exitCode] = yield* Effect.timed(
                runCommand(deploymentContext.command, logMessage)
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
    TUiWrapperError
  )
})
