import { startCli } from '#cli/cli_starter'
import { CliCommandContext } from '#contexts/cli_command'
import { InternalConfigContext } from '#contexts/internal_config'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { DeployOnBucketUseCase } from '#use_cases/deploy_on_bucket'
import { log, outro } from '@clack/prompts'
import { command } from 'cmd-ts'
import { Effect, Inspectable, Layer } from 'effect'

export const deployOnBucketCommand = command({
  name: 'deploy',
  description: 'TODO',
  args: {},
  handler: function () {
    const CommandContextLayer = Layer.succeed(CliCommandContext, {
      commandName: this.name,
    })

    return Effect.gen(function* () {
      const { config } = yield* startCli

      const ConfigContextLayer = Layer.succeed(InternalConfigContext, config)
      const DeploymentContextLayer = makeFrontDeploymentContextLayer(config)

      yield* Effect.gen(function* () {
        const useCase = yield* DeployOnBucketUseCase

        const { isAborted } = yield* useCase.run()

        if (isAborted) {
          outro(`Deployment aborted`)
        } else {
          outro(`Deployment finished`)
        }
      }).pipe(
        Effect.provide(DeployOnBucketUseCase.Default),
        Effect.provide(ConfigContextLayer),
        Effect.provide(DeploymentContextLayer),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            log.error(error.message)
            log.message(Inspectable.toStringUnknown(error))
            outro(`Deployment aborted`)
          })
        )
      )
    }).pipe(Effect.provide(CommandContextLayer))
  },
})
