import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfig } from '#core/config_loader'
import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { resolveAngularConfigurations } from '#helpers/angular'
import { toEffect } from '#helpers/promise'
import { log, select } from '@clack/prompts'
import { Command } from '@effect/platform'
import { Effect, Layer, Match } from 'effect'

export const makeFrontDeploymentContextLayer = function (rootConfig: InternalConfig) {
  return Layer.effect(
    FrontDeploymentContext,
    Match.value(rootConfig.front).pipe(
      Match.when({ type: 'angular' }, (config) =>
        Effect.gen(function* () {
          const { configurations, outputPath } = yield* resolveAngularConfigurations(
            config.angular.angularJsonPath,
            config.angular.projectName
          )

          if (config.angular.configurationName) {
            return {
              command: Command.make('ng', 'build', config.angular.configurationName),
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

          const configurationName = yield* toEffect(
            select({
              message: 'Pick an Angular configuration.',
              options: options,
            }),
            TUiWrapperError
          )

          return {
            command: Command.make('ng', 'build', configurationName.toString()),
            bucketName: makeDeploymentBucketName(
              rootConfig,
              configurationName.toString()
            ),
            buildOutputPath: outputPath,
          }
        })
      ),
      Match.when({ type: 'custom' }, (config) =>
        Effect.gen(function* () {
          return {
            command: Command.make(config.custom.command, ...config.custom.args),
            bucketName: makeDeploymentBucketName(
              rootConfig,
              config.custom.environmentName
            ),
            buildOutputPath: config.custom.buildOutputPath,
          }
        })
      ),
      Match.exhaustive
    )
  )
}
