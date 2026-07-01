import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { FrontFileObjectService } from '#file_object/front_service'
import { toEffect } from '#helpers/promise'
import { genCommandUi } from '#ui/command'
import { genTaskLogsUi } from '#ui/tasks'
import { confirm } from '@clack/prompts'
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

            yield* genCommandUi({
              command: deploymentContext.command,
              message: {
                resolveStartMessage: () => 'Building front',
                resolveErrorMessage: () => 'Build failed',
                resolveEndMessage: (duration) =>
                  `Build finished in ${Duration.toMillis(duration)}ms`,
              },
            })

            const configContext = yield* InternalConfigContext
            const frontBuildFileTrees = yield* frontService.listFrontBuildFileTrees()

            // TODO: error when no files

            yield* genTaskLogsUi({
              title: 'Uploading files',
              itemGroups: Array.from(frontBuildFileTrees),
              processItem: frontService.uploadFrontFileToBucket,
              message: {
                resolveGroupTitle: (fileTree) => `Uploading '${fileTree.name}' folder`,
                resolveGroupSuccessMessage: (fileTree, duration) =>
                  `${fileTree.name}: ${fileTree.items.length} files uploaded in ${Duration.toMillis(duration)}ms`,
                resolveItemMessage: (fileItem) =>
                  `File '${fileItem.relativePath}' uploaded`,
                resolveSuccessMessage: () => 'Files uploaded',
              },
              subTaskConcurrency: configContext.bucket.upload.concurrency,
            })

            // TODO: be able to ctrl c...

            return {
              isAborted: false,
            }
          }),
      }
    }),
    dependencies: [FrontFileObjectService.Default],
  }
) {}
