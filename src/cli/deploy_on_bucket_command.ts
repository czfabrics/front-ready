import { startCli } from '#cli/cli_starter'
import { runFrontBuildCommand } from '#core/front_build_command_runner'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { confirm, log, outro } from '@clack/prompts'
import { command } from 'cmd-ts'
import { Effect, Layer } from 'effect'
import { CliCommandContext } from 'src/context/cli_command'
import { FrontDeploymentContext } from 'src/context/front_deployment'

export const deployOnBucketCommand = command({
    name: 'deploy',
    description: 'TODO',
    args: {},
    handler: function () {
        const commandContextLayer = Layer.succeed(CliCommandContext, {
            commandName: this.name,
        })

        return Effect.gen(function* () {
            const { config } = yield* startCli
            const deploymentContextLayer = makeFrontDeploymentContextLayer(config)

            yield* Effect.gen(function* () {
                const deploymentContext = yield* FrontDeploymentContext
                const shouldContinue = yield* Effect.tryPromise(() =>
                    confirm({
                        message: `Do you want to build and upload '${deploymentContext.buildOutputPath}' to bucket '${deploymentContext.bucketName}'?`,
                    })
                )

                if (!shouldContinue) {
                    log.message(`User answered no`)
                    outro(`Deployment aborted`)
                }

                yield* runFrontBuildCommand

                // Upload...

                // result: number of file, size etc...
            }).pipe(Effect.provide(deploymentContextLayer))
        }).pipe(Effect.provide(commandContextLayer))
    },
})
