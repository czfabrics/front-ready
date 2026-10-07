import { InternalConfig } from '#config/schema'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { AngularConfigurationNameMissingError } from '#errors/angular'
import { makeDeploymentBucketName } from '#factories/bucket_name'
import { getAngularConfigurations, resolveAngularConfiguration } from '#helpers/angular'
import { resolveAstroConfiguration } from '#helpers/astro'
import { genSelectUi } from '#ui/select'
import { log } from '@clack/prompts'
import { Command, Path } from '@effect/platform'
import { Effect, Layer, Match } from 'effect'

const promptAngularConfigurationName = function (
  angularJsonPath: string,
  projectName: string
) {
  return Effect.gen(function* () {
    log.warning('Angular configuration name not found in configuration')
    log.message(`Reading '${angularJsonPath}' file to get available configurations`)

    const configurations = yield* getAngularConfigurations(angularJsonPath, projectName)

    return yield* genSelectUi({
      message: 'Pick an Angular configuration.',
      options: configurations.map((name) => ({ value: name, label: name })),
    })
  })
}

/**
 * `interactive: false` (deploy `--yes`, CI) never prompts: whatever a prompt would
 * have resolved must come from the config, or building the context fails.
 */
export const makeFrontDeploymentContextLayer = function (
  rootConfig: InternalConfig,
  { interactive = true }: { interactive?: boolean } = {}
) {
  const { prebuild } = rootConfig.front
  const prebuildCommand = prebuild
    ? Command.make(prebuild.command, ...prebuild.args)
    : undefined

  return Layer.effect(
    FrontDeploymentContext,
    Match.value(rootConfig.front).pipe(
      Match.when({ type: 'angular' }, (config) =>
        Effect.gen(function* () {
          const path = yield* Path.Path

          // Resolved into a local rather than written back onto `config`: the parsed
          // config is shared through `InternalConfigContext`, and must keep saying
          // what was actually validated.
          const configurationName =
            config.angular.configurationName ??
            (interactive
              ? yield* promptAngularConfigurationName(
                  config.angular.angularJsonPath,
                  config.angular.projectName
                )
              : yield* new AngularConfigurationNameMissingError({
                  projectName: config.angular.projectName,
                  angularJsonPath: config.angular.angularJsonPath,
                }))

          const { outputPath, outputHashing } = yield* resolveAngularConfiguration(
            config.angular.angularJsonPath,
            config.angular.projectName,
            configurationName
          )

          // `angular.json` paths are relative to the workspace — the folder holding
          // it — not to wherever the CLI runs. Both the build and the folder it
          // writes must be resolved there, or a workspace below the cwd builds and
          // uploads the wrong place. Kept relative when the workspace is the cwd.
          const workspaceRoot = path.dirname(config.angular.angularJsonPath)
          const buildOutputPath = path.isAbsolute(outputPath)
            ? outputPath
            : path.join(workspaceRoot, outputPath)

          return {
            prebuildCommand,
            // `ng build`'s positional argument is the project, not the configuration:
            // the latter only ever arrives through `--configuration`.
            command: Command.make(
              'ng',
              'build',
              config.angular.projectName,
              '--configuration',
              configurationName
            ).pipe(Command.workingDirectory(workspaceRoot)),
            bucketName: yield* makeDeploymentBucketName(rootConfig, configurationName),
            buildOutputPath,
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
            prebuildCommand,
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
            bucketName: yield* makeDeploymentBucketName(rootConfig, config.astro.mode),
            buildOutputPath: outputPath,
            buildOutputHashing: outputHashing,
          }
        })
      ),
      Match.when({ type: 'custom' }, (config) =>
        Effect.gen(function* () {
          return {
            prebuildCommand,
            command: Command.make(
              config.custom.build.command,
              ...config.custom.build.args
            ),
            bucketName: yield* makeDeploymentBucketName(
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
