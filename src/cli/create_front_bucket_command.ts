import { startCli } from '#cli/cli_starter'
import { CliCommandContext } from '#contexts/cli_command'
import { InternalConfigContext } from '#contexts/internal_config'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { CreateFrontBucketUseCase } from '#use_cases/create_front_bucket'
import { cancel, log, outro } from '@clack/prompts'
import { command } from 'cmd-ts'
import { Effect, Inspectable, Layer } from 'effect'

export const createFrontBucketCommand = command({
  name: 'create',
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

      const tt = Effect.gen(function* () {
        const useCase = yield* CreateFrontBucketUseCase

        const { isAborted } = yield* useCase.run()

        if (isAborted) {
          cancel(`Creation aborted`)
        } else {
          outro(`Creation finished`)
        }
      }).pipe(
        Effect.provide(CreateFrontBucketUseCase.Default),
        Effect.provide(ConfigContextLayer),
        Effect.provide(DeploymentContextLayer),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            log.error(error.message)
            log.message(Inspectable.toStringUnknown(error))
            outro(`Creation aborted`)
          })
        )
      )

      yield* tt
    }).pipe(Effect.provide(CommandContextLayer))
  },
})
