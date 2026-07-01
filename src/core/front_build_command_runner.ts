import { FrontDeploymentContext } from '#contexts/front_deployment'
import { runCommand } from '#core/command_runner'
import { CommandError } from '#errors/command'
import { spinner } from '@clack/prompts'
import { Duration, Effect } from 'effect'

export const runFrontBuildCommand = Effect.gen(function* () {
  const deploymentContext = yield* FrontDeploymentContext

  const spin = spinner()
  spin.start('Building front')

  const [duration, exitCode] = yield* Effect.timed(
    runCommand(deploymentContext.command, spin.message)
  )

  if (exitCode !== 0) {
    spin.error('Build failed')
    return yield* Effect.fail(
      new CommandError({
        message: 'Build failed',
        code: exitCode,
      })
    )
  }

  spin.stop(`Build finished in ${Duration.toMillis(duration)}ms`)
})
