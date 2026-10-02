import { getAngularConfigurations, resolveAngularConfiguration } from '#helpers/angular'
import { NodeContext } from '@effect/platform-node'
import { Effect } from 'effect'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let projectPath: string

beforeEach(() => {
  projectPath = mkdtempSync(join(tmpdir(), 'front-ready-angular-'))
})

afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true })
})

const writeAngularJson = function (content: unknown): string {
  const angularJsonPath = join(projectPath, 'angular.json')

  writeFileSync(
    angularJsonPath,
    typeof content === 'string' ? content : JSON.stringify(content)
  )

  return angularJsonPath
}

const resolve = function (
  angularJsonPath: string,
  projectName = 'app',
  configurationName = 'production'
) {
  return Effect.runPromise(
    resolveAngularConfiguration(angularJsonPath, projectName, configurationName).pipe(
      Effect.provide(NodeContext.layer)
    )
  )
}

const resolveFailure = function (
  angularJsonPath: string,
  projectName = 'app',
  configurationName = 'production'
) {
  return Effect.runPromise(
    resolveAngularConfiguration(angularJsonPath, projectName, configurationName).pipe(
      Effect.flip,
      Effect.provide(NodeContext.layer)
    )
  )
}

const listConfigurations = function (angularJsonPath: string) {
  return Effect.runPromise(
    getAngularConfigurations(angularJsonPath).pipe(Effect.provide(NodeContext.layer))
  )
}

const makeAngularJson = function (
  build: Record<string, unknown>,
  targetsKey: 'architect' | 'targets' = 'architect'
) {
  return {
    projects: {
      app: {
        [targetsKey]: {
          build,
        },
      },
    },
  }
}

describe('resolveAngularConfiguration', () => {
  describe('output path', () => {
    it('reads a plain string outputPath for a non-application builder', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app' },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app',
      })
    })

    it("appends the implicit '/browser' for the application builder", async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:application',
          options: { outputPath: 'dist/app' },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app/browser',
      })
    })

    it("defaults the object form's browser folder to 'browser'", async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular/build:application',
          options: { outputPath: { base: 'dist/app' } },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app/browser',
      })
    })

    it('honours an explicit browser folder in the object form', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular/build:application',
          options: { outputPath: { base: 'dist/app', browser: 'web' } },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app/web',
      })
    })

    it('flattens onto base when the browser folder is emptied out', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular/build:application',
          options: { outputPath: { base: 'dist/app', browser: '' } },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app',
      })
    })

    it("reads targets when the project uses the 'targets' key", async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson(
          {
            builder: '@angular-devkit/build-angular:browser',
            options: { outputPath: 'dist/app' },
            configurations: { production: {} },
          },
          'targets'
        )
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app',
      })
    })

    it('lets the selected configuration override outputPath', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app' },
          configurations: { production: { outputPath: 'dist/app-production' } },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app-production',
      })
    })

    it('applies the application builder suffix to a configuration override', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular/build:application',
          options: { outputPath: 'dist/app' },
          configurations: { production: { outputPath: 'dist/app-production' } },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputPath: 'dist/app-production/browser',
      })
    })
  })

  describe('output hashing', () => {
    it('takes outputHashing from the selected configuration', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app', outputHashing: 'none' },
          configurations: { production: { outputHashing: 'all' } },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputHashing: 'all',
      })
    })

    it('falls back to the base options when the configuration is silent', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app', outputHashing: 'bundles' },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputHashing: 'bundles',
      })
    })

    it("falls back to the builder default 'none' when nothing declares it", async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app' },
          configurations: { production: {} },
        })
      )

      await expect(resolve(angularJsonPath)).resolves.toMatchObject({
        outputHashing: 'none',
      })
    })
  })

  describe('failures', () => {
    it('reports a missing build target for an unknown project', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app' },
          configurations: { production: {} },
        })
      )

      const error = await resolveFailure(angularJsonPath, 'unknown-app')

      expect(error._tag).toBe('AngularJsonMissingDataError')
      expect(error.message).toContain('build target')
    })

    it('reports a missing output path', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: {},
          configurations: { production: {} },
        })
      )

      const error = await resolveFailure(angularJsonPath)

      expect(error._tag).toBe('AngularJsonMissingDataError')
      expect(error.message).toContain('output path')
    })

    it('reports a configuration that the project does not declare', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app' },
          configurations: { staging: {} },
        })
      )

      const error = await resolveFailure(angularJsonPath)

      expect(error._tag).toBe('AngularJsonMissingDataError')
      expect(error.message).toContain('production')
    })

    it('reports which key is malformed when the json has the wrong shape', async () => {
      const angularJsonPath = writeAngularJson(
        makeAngularJson({
          builder: '@angular-devkit/build-angular:browser',
          options: { outputPath: 'dist/app', outputHashing: 'sometimes' },
          configurations: { production: {} },
        })
      )

      const error = await resolveFailure(angularJsonPath)

      expect(error._tag).toBe('AngularJsonFormatError')
      expect(error.message).toContain('outputHashing')
    })

    it('fails on a file that is not valid json', async () => {
      const angularJsonPath = writeAngularJson('{ not json')

      const error = await resolveFailure(angularJsonPath)

      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('untouched options', () => {
    it('ignores the angular.json keys it does not care about', async () => {
      const angularJsonPath = writeAngularJson({
        $schema: './node_modules/@angular/cli/lib/config/schema.json',
        version: 1,
        cli: { packageManager: 'bun' },
        projects: {
          app: {
            projectType: 'application',
            root: '',
            sourceRoot: 'src',
            prefix: 'app',
            architect: {
              build: {
                builder: '@angular-devkit/build-angular:browser',
                options: { outputPath: 'dist/app', index: 'src/index.html' },
                configurations: { production: { outputHashing: 'all', budgets: [] } },
              },
              serve: { builder: '@angular-devkit/build-angular:dev-server' },
            },
          },
        },
      })

      await expect(resolve(angularJsonPath)).resolves.toStrictEqual({
        outputPath: 'dist/app',
        outputHashing: 'all',
      })
    })
  })
})

describe('getAngularConfigurations', () => {
  it('collects configuration names across every project and target', async () => {
    const angularJsonPath = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { configurations: { production: {}, staging: {} } },
          },
        },
        admin: {
          targets: {
            build: { configurations: { production: {}, preprod: {} } },
          },
        },
      },
    })

    await expect(listConfigurations(angularJsonPath)).resolves.toStrictEqual([
      'production',
      'staging',
      'preprod',
    ])
  })

  it('ignores configurations declared on targets other than build', async () => {
    const angularJsonPath = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { configurations: { production: {} } },
            serve: { configurations: { development: {} } },
            test: { configurations: { ci: {} } },
          },
        },
      },
    })

    await expect(listConfigurations(angularJsonPath)).resolves.toStrictEqual([
      'production',
    ])
  })

  it('returns an empty list when no configuration is declared', async () => {
    const angularJsonPath = writeAngularJson(
      makeAngularJson({
        builder: '@angular-devkit/build-angular:browser',
        options: { outputPath: 'dist/app' },
      })
    )

    await expect(listConfigurations(angularJsonPath)).resolves.toStrictEqual([])
  })
})
