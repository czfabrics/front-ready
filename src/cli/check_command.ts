import { startCli } from '#cli/cli_starter'
import { CliCommandContext } from '#contexts/cli_command'
import { InternalConfigContext } from '#contexts/internal_config'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { runAndInterruptOnCtrlC } from '#helpers/runtime'
import { CheckUseCase } from '#use_cases/check'
import { cancel, log, outro } from '@clack/prompts'
import { command } from 'cmd-ts'
import { Effect, Inspectable, Layer } from 'effect'

export const checkCommand = command({
  name: 'check',
  description:
    'Verifies that your build produces randomly named (content-hashed) chunk files, which the default cache configuration relies on. Also checks that the configured bucket exists and that it contains at least one object.',
  args: {},
  handler: function () {
    const CommandContextLayer = Layer.succeed(CliCommandContext, {
      commandName: this.name,
    })

    return Effect.gen(function* () {
      const { config } = yield* startCli()

      const ConfigContextLayer = Layer.succeed(InternalConfigContext, config)
      const DeploymentContextLayer = makeFrontDeploymentContextLayer(config)

      yield* Effect.gen(function* () {
        const useCase = yield* CheckUseCase

        yield* runAndInterruptOnCtrlC(useCase.run())

        outro(`Check finished`)
      }).pipe(
        Effect.provide(CheckUseCase.Default),
        Effect.provide(ConfigContextLayer),
        Effect.provide(DeploymentContextLayer),
        Effect.onInterrupt(() => Effect.sync(() => cancel(`Check canceled`))),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            log.error(error.message)
            log.message(Inspectable.toStringUnknown(error))
            outro(`Check aborted`)
          })
        )
      )
    }).pipe(Effect.provide(CommandContextLayer))
  },
})
