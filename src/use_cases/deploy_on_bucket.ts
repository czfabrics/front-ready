import { CliCommandContext } from '#contexts/cli_command'
import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { BucketNotFoundError } from '#errors/bucket'
import { FrontError } from '#errors/front'
import { FrontFileObjectService } from '#front/service'
import { genFn } from '#helpers/effect'
import { hasMinOneFile, pickIndexDocument } from '#helpers/file'
import { genCommandUi } from '#ui/command'
import { genConfirmUi } from '#ui/confirm'
import { genLoaderUi } from '#ui/loader'
import { genTaskLogsUi } from '#ui/tasks'
import { log } from '@clack/prompts'
import { Duration, Effect } from 'effect'

export class DeployOnBucketUseCase extends Effect.Service<DeployOnBucketUseCase>()(
  'DeployOnBucketUseCase',
  {
    effect: Effect.gen(function* () {
      const frontService = yield* FrontFileObjectService
      const deploymentContext = yield* FrontDeploymentContext

      return {
        run: genFn(function* () {
          const { assumeYes } = yield* CliCommandContext

          // Without the prompt, still say what is about to happen: the CI log is
          // the only place left that shows which bucket a deploy went to.
          if (assumeYes) {
            log.info(
              `Building and uploading '${deploymentContext.buildOutputPath}' to bucket '${deploymentContext.bucketName}' (confirmation skipped)`
            )
          } else {
            const shouldContinue = yield* genConfirmUi({
              question: `Do you want to build and upload '${deploymentContext.buildOutputPath}' to bucket '${deploymentContext.bucketName}'?`,
              initialValue: false,
            })

            if (!shouldContinue) {
              return yield* Effect.interrupt
            }
          }

          const doesBucketExist = yield* frontService.doesFrontBucketExist()
          if (!doesBucketExist) {
            return yield* new BucketNotFoundError({
              message: `Bucket '${deploymentContext.bucketName}' should exist — run \`create\` first`,
              bucketName: deploymentContext.bucketName,
            })
          }

          if (deploymentContext.prebuildCommand) {
            yield* genCommandUi({
              command: deploymentContext.prebuildCommand,
              message: {
                resolveStart: () => 'Running prebuild',
                resolveError: (error) => `Prebuild failed: ${error.message}`,
                resolveCancel: () => 'Prebuild canceled',
                resolveEnd: (duration) =>
                  `Prebuild finished in ${Duration.toMillis(duration)}ms`,
              },
            })
          }

          yield* genCommandUi({
            command: deploymentContext.command,
            message: {
              resolveStart: () => 'Building front',
              resolveError: (error) => `Build failed: ${error.message}`,
              resolveCancel: () => 'Build canceled',
              resolveEnd: (duration) =>
                `Build finished in ${Duration.toMillis(duration)}ms`,
            },
          })

          const configContext = yield* InternalConfigContext
          const frontBuildFileComponents =
            yield* frontService.listFrontBuildFileByRootComponents()

          const hasOneFile = hasMinOneFile(frontBuildFileComponents)
          if (!hasOneFile) {
            return yield* new FrontError({
              message: `The front build folder '${deploymentContext.buildOutputPath}' contains no file`,
              config: configContext.front,
            })
          }

          const { components: frontBuildFileComponentRests, indexDocument } =
            yield* pickIndexDocument(frontBuildFileComponents).pipe(
              Effect.catchTag(
                'FileNotFoundError',
                () =>
                  new FrontError({
                    message: `'${configContext.bucket.front.indexDocumentSuffix}' file should exist in the front build folder`,
                    config: configContext.front,
                  })
              )
            )

          yield* genTaskLogsUi({
            title: 'Uploading common files',
            itemGroups: Array.from(frontBuildFileComponentRests),
            processItem: frontService.uploadFrontFileToBucket,
            message: {
              resolveGroupTitle: (fileComponent) => `Uploading ${fileComponent.name}`,
              resolveGroupSuccess: (fileComponent, duration) =>
                `${fileComponent.name}: ${fileComponent.length} files uploaded in ${Duration.toMillis(duration)}ms`,
              resolveGroupError: (fileComponent, error) =>
                `Upload ${fileComponent.name} failed: ${error.message}`,
              resolveItem: (fileItem) => `File ${fileItem.relativePath} uploaded`,
              resolveSuccess: (duration) =>
                `Common files uploaded in ${Duration.toMillis(duration)}ms`,
            },
            subTaskConcurrency: configContext.bucket.upload.concurrency,
          })

          yield* genLoaderUi({
            process: () => frontService.uploadFrontFileToBucket(indexDocument),
            message: {
              resolveStart: () => `Uploading index document '${indexDocument.name}'`,
              resolveError: (error) =>
                `Upload index document '${indexDocument.name}' failed: ${error.message}`,
              resolveCancel: () =>
                `Upload index document '${indexDocument.name}' canceled`,
              resolveEnd: (duration) =>
                `Upload index document '${indexDocument.name}' finished in ${Duration.toMillis(duration)}ms`,
            },
          })
        }),
      }
    }),
    dependencies: [FrontFileObjectService.Default],
  }
) {}
