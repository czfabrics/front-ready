import { InternalConfig } from '#config/schema'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { getAngularConfigurations, resolveAngularConfiguration } from '#helpers/angular'
import { resolveAstroConfiguration } from '#helpers/astro'
import { genSelectUi } from '#ui/select'
import { log } from '@clack/prompts'
import { Command } from '@effect/platform'
import { Effect, Layer, Match } from 'effect'

const promptAngularConfigurationName = function (angularJsonPath: string) {
  return Effect.gen(function* () {
    log.warning('Angular configuration name not found in configuration')
    log.message(`Reading '${angularJsonPath}' file to get available configurations`)

    const configurations = yield* getAngularConfigurations(angularJsonPath)

    return yield* genSelectUi({
      message: 'Pick an Angular configuration.',
      options: configurations.map((name) => ({ value: name, label: name })),
    })
  })
}

export const makeFrontDeploymentContextLayer = function (rootConfig: InternalConfig) {
  return Layer.effect(
    FrontDeploymentContext,
    Match.value(rootConfig.front).pipe(
      Match.when({ type: 'angular' }, (config) =>
        Effect.gen(function* () {
          // Resolved into a local rather than written back onto `config`: the parsed
          // config is shared through `InternalConfigContext`, and must keep saying
          // what was actually validated.
          const configurationName =
            config.angular.configurationName ??
            (yield* promptAngularConfigurationName(config.angular.angularJsonPath))

          const { outputPath, outputHashing } = yield* resolveAngularConfiguration(
            config.angular.angularJsonPath,
            config.angular.projectName,
            configurationName
          )

          return {
            // `ng build`'s positional argument is the project, not the configuration:
            // the latter only ever arrives through `--configuration`.
            command: Command.make(
              'ng',
              'build',
              config.angular.projectName,
              '--configuration',
              configurationName
            ),
            bucketName: makeDeploymentBucketName(rootConfig, configurationName),
            buildOutputPath: outputPath,
            buildOutputHashing: outputHashing,
          }
        })
      ),
      Match.when({ type: 'astro' }, (config) =>
        Effect.gen(function* () {
          const { outputPath, outputHashing } = yield* resolveAstroConfiguration(
            config.astro.astroConfigPath
          )

          return {
            command: Command.make(
              'astro',
              'build',
              '--mode',
              config.astro.mode,
              // Keep the build pointed at the very config file we just parsed.
              ...(config.astro.astroConfigPath
                ? ['--config', config.astro.astroConfigPath]
                : [])
            ),
            bucketName: makeDeploymentBucketName(rootConfig, config.astro.mode),
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
