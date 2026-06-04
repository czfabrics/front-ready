import { InternalConfig } from '#core/config_loader'
import { PromptError } from '#errors/prompt'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { resolveAngularConfigurations } from '#helpers/angular'
import { promiseIntoEffect } from '#helpers/promise_into_effect'
import { log, select } from '@clack/prompts'
import { Command } from '@effect/platform'
import { Effect, Layer, Match } from 'effect'
import { FrontDeploymentContext } from 'src/context/front_deployment'

export const makeFrontDeploymentContextLayer = function (rootConfig: InternalConfig) {
    return Layer.effect(
        FrontDeploymentContext,
        Match.value(rootConfig.front).pipe(
            Match.when({ type: 'angular' }, (config) =>
                Effect.gen(function* () {
                    const { configurations, outputPath } =
                        yield* resolveAngularConfigurations(
                            config.angular.angularJsonPath,
                            config.angular.projectName
                        )

                    if (config.angular.configurationName) {
                        return {
                            command: Command.make(
                                'ng',
                                'build',
                                config.angular.configurationName
                            ),
                            bucketName: makeDeploymentBucketName(
                                rootConfig,
                                config.angular.configurationName
                            ),
                            buildOutputPath: outputPath,
                        }
                    }

                    log.warning('Angular configuration name not found in configuration')
                    log.message(
                        `Reading '${config.angular.angularJsonPath}' file to get available configurations`
                    )

                    const options = configurations.map((name) => ({
                        value: name,
                        label: name,
                    }))

                    const configurationName = yield* promiseIntoEffect(
                        select({
                            message: 'Pick an Angular configuration.',
                            options: options,
                        }),
                        {
                            errorConstructor: PromptError,
                            default: {
                                message: 'Unable to parse user input',
                            },
                        }
                    )

                    return {
                        command: Command.make(
                            'ng',
                            'build',
                            configurationName.toString()
                        ),
                        bucketName: makeDeploymentBucketName(
                            rootConfig,
                            configurationName.toString()
                        ),
                        buildOutputPath: outputPath,
                    }
                })
            ),
            Match.exhaustive
        )
    )
}
