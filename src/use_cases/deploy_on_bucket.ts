import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { runFrontBuildCommand } from '#core/front_build_command_runner'
import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { FrontFileObjectService } from '#file_object/front_service'
import { toEffect } from '#helpers/promise'
import { genTaskUi } from '#ui/tasks'
import { confirm, tasks } from '@clack/prompts'
import { Duration, Effect } from 'effect'

export class DeployOnBucketUseCase extends Effect.Service<DeployOnBucketUseCase>()(
  'DeployOnBucketUseCase',
  {
    effect: Effect.gen(function* () {
      const frontService = yield* FrontFileObjectService
      const deploymentContext = yield* FrontDeploymentContext

      return {
        run: () =>
          Effect.gen(function* () {
            const shouldContinue = yield* toEffect(
              confirm({
                message: `Do you want to build and upload '${deploymentContext.buildOutputPath}' to bucket '${deploymentContext.bucketName}'?`,
              }),
              TUiWrapperError,
              {
                uiFunction: 'confirm',
              }
            )

            if (!shouldContinue) {
              return {
                isAborted: true,
              }
            }

            // TODO: check if bucket exists

            yield* runFrontBuildCommand
            const frontBuildFileTree = yield* frontService.listFrontBuildFileTree()

            const configContext = yield* InternalConfigContext
            const frontFileUploadTasks = Array.from(frontBuildFileTree).map(
              (fileTree) => {
                return genTaskUi({
                  title: 'Uploading front files',
                  items: fileTree,
                  functions: {
                    processItem: frontService.uploadFrontFileToBucket,
                    resolveItemMessage: (item) => `File '${item.relativePath}' uploaded`,
                    resolveFinalMessage: (fileTree, duration) =>
                      `Uploaded ${fileTree.items.length} files in ${Duration.toMillis(duration)}ms`,
                  },
                  subTaskConcurrency: configContext.bucket.upload.concurrency,
                })
              }
            )

            // TODO: issue, propagate error through tui functions
            yield* toEffect(tasks(frontFileUploadTasks), TUiWrapperError)

            return {
              isAborted: false,
            }
          }),
      }
    }),
    dependencies: [FrontFileObjectService.Default],
  }
) {}
