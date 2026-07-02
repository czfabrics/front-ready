import { startCli } from '#cli/cli_starter'
import { CliCommandContext } from '#contexts/cli_command'
import { InternalConfigContext } from '#contexts/internal_config'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { runAndInterruptOnCtrlC } from '#helpers/runtime'
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

      yield* Effect.gen(function* () {
        const useCase = yield* CreateFrontBucketUseCase

        yield* runAndInterruptOnCtrlC(useCase.run())

        outro(`Creation finished`)
      }).pipe(
        Effect.provide(CreateFrontBucketUseCase.Default),
        Effect.provide(ConfigContextLayer),
        Effect.provide(DeploymentContextLayer),
        Effect.onInterrupt(() => Effect.sync(() => cancel(`Creation aborted`))),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            log.error(error.message)
            log.message(Inspectable.toStringUnknown(error))
            outro(`Creation aborted`)
          })
        )
      )
    }).pipe(Effect.provide(CommandContextLayer))
  },
})
