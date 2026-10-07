import { ConfigSchema } from '#config/schema'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { AngularConfigurationNameMissingError } from '#errors/angular'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { Command } from '@effect/platform'
import { NodeContext } from '@effect/platform-node'
import { Effect, Exit, Option } from 'effect'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let originalCwd: string
let tempDir: string

beforeEach(() => {
  originalCwd = process.cwd()
  tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'front-ready-factory-'))
  process.chdir(tempDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(tempDir, { recursive: true, force: true })
})

const writeWorkspace = function (directory: string, outputPath: string) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    nodePath.join(directory, 'angular.json'),
    JSON.stringify({
      projects: {
        web: {
          architect: {
            build: {
              builder: '@angular-devkit/build-angular:browser',
              options: { outputPath },
              configurations: { production: {} },
            },
          },
        },
      },
    })
  )
}

const contextFor = function (
  angularJsonPath: string,
  prebuild?: { command: string; args?: string[] }
) {
  const config = ConfigSchema.parse({
    bucket: { namePrefix: 'front-ready', params: { region: 'eu-west-3' } },
    front: {
      prebuild,
      type: 'angular',
      angular: { projectName: 'web', angularJsonPath, configurationName: 'production' },
    },
  })

  return Effect.runPromise(
    FrontDeploymentContext.pipe(
      Effect.provide(makeFrontDeploymentContextLayer(config)),
      Effect.provide(NodeContext.layer)
    )
  )
}

const workingDirectoryOf = function (command: Command.Command) {
  return command._tag === 'StandardCommand'
    ? Option.getOrUndefined(command.cwd)
    : undefined
}

describe('makeFrontDeploymentContextLayer — angular', () => {
  // `outputPath` was read relative to the cwd, while Angular resolves it against
  // the workspace: a workspace below the cwd uploaded a folder that did not exist.
  it('resolves the output path against the workspace holding angular.json', async () => {
    writeWorkspace('apps/web', 'dist/web')

    const context = await contextFor('./apps/web/angular.json')

    expect(context.buildOutputPath).toBe(nodePath.join('apps', 'web', 'dist', 'web'))
  })

  it('runs the build in that same workspace', async () => {
    writeWorkspace('apps/web', 'dist/web')

    const context = await contextFor('./apps/web/angular.json')

    expect(workingDirectoryOf(context.command)).toBe('./apps/web')
  })

  it('keeps the path as written when the workspace is the cwd', async () => {
    writeWorkspace('.', 'dist/web')

    const context = await contextFor('./angular.json')

    expect(context.buildOutputPath).toBe('dist/web')
  })

  it('keeps an absolute output path as is', async () => {
    const absolute = nodePath.join(tempDir, 'elsewhere')
    writeWorkspace('apps/web', absolute)

    const context = await contextFor('./apps/web/angular.json')

    expect(context.buildOutputPath).toBe(absolute)
  })

  it('has no prebuild command unless one is configured', async () => {
    writeWorkspace('.', 'dist/web')

    const context = await contextFor('./angular.json')

    expect(context.prebuildCommand).toBeUndefined()
  })

  it('runs the prebuild command in the cwd, not the workspace', async () => {
    writeWorkspace('apps/web', 'dist/web')

    const context = await contextFor('./apps/web/angular.json', {
      command: 'npm',
      args: ['run', 'codegen'],
    })

    expect(
      context.prebuildCommand?._tag === 'StandardCommand' &&
        context.prebuildCommand.command
    ).toBe('npm')
    expect(workingDirectoryOf(context.prebuildCommand!)).toBeUndefined()
  })
})

describe('makeFrontDeploymentContextLayer — non-interactive', () => {
  // With `deploy --yes` or in CI there is no one to answer the configuration
  // picker: it must fail rather than hang the pipeline on a prompt.
  it('fails instead of prompting for a missing Angular configuration name', async () => {
    writeWorkspace('.', 'dist/web')

    const config = ConfigSchema.parse({
      bucket: { namePrefix: 'front-ready', params: { region: 'eu-west-3' } },
      front: {
        type: 'angular',
        angular: { projectName: 'web', angularJsonPath: './angular.json' },
      },
    })

    const exit = await Effect.runPromiseExit(
      FrontDeploymentContext.pipe(
        Effect.provide(makeFrontDeploymentContextLayer(config, { interactive: false })),
        Effect.provide(NodeContext.layer)
      )
    )

    expect(exit).toStrictEqual(
      Exit.fail(
        new AngularConfigurationNameMissingError({
          projectName: 'web',
          angularJsonPath: './angular.json',
        })
      )
    )
  })
})
