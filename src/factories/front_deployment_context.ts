import { InternalConfig } from '#config/schema'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { getAngularConfigurations, resolveAngularConfiguration } from '#helpers/angular'
import { genSelectUi } from '#ui/select'
import { log } from '@clack/prompts'
import { Command } from '@effect/platform'
import { Effect, Layer, Match } from 'effect'

export const makeFrontDeploymentContextLayer = function (rootConfig: InternalConfig) {
  return Layer.effect(
    FrontDeploymentContext,
    Match.value(rootConfig.front).pipe(
      Match.when({ type: 'angular' }, (config) =>
        Effect.gen(function* () {
          if (!config.angular.configurationName) {
            log.warning('Angular configuration name not found in configuration')
            log.message(
              `Reading '${config.angular.angularJsonPath}' file to get available configurations`
            )

            const configurations = yield* getAngularConfigurations(
              config.angular.angularJsonPath
            )
            const options = configurations.map((name) => ({
              value: name,
              label: name,
            }))

            const configurationName = yield* genSelectUi({
              message: 'Pick an Angular configuration.',
              options: options,
            })

            config.angular.configurationName = configurationName.toString()
          }

          const { outputPath, outputHashing } = yield* resolveAngularConfiguration(
            config.angular.angularJsonPath,
            config.angular.projectName,
            config.angular.configurationName
          )

          return {
            command: Command.make('ng', 'build', config.angular.configurationName),
            bucketName: makeDeploymentBucketName(
              rootConfig,
              config.angular.configurationName
            ),
            buildOutputPath: outputPath,
            buildOutputHashing: outputHashing,
          }
        })
      ),
      Match.when({ type: 'custom' }, (config) =>
        Effect.gen(function* () {
          return {
            command: Command.make(
              config.custom.build.command,
              ...config.custom.build.args
            ),
            bucketName: makeDeploymentBucketName(
              rootConfig,
              config.custom.environmentName
            ),
            buildOutputPath: config.custom.buildOutputPath,
            buildOutputHashing: undefined,
          }
        })
      ),
      Match.exhaustive
    )
  )
}
