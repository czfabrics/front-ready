import { FrontDeploymentContext } from '#contexts/front_deployment'
import { InternalConfigContext } from '#contexts/internal_config'
import { FrontFileObjectService } from '#front/service'
import { genFn } from '#helpers/effect'
import { hasMinOneFile } from '#helpers/file'
import { genCommandUi } from '#ui/command'
import { genConfirmUi } from '#ui/confirm'
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
          const shouldContinue = yield* genConfirmUi({
            question: `Do you want to build and upload '${deploymentContext.buildOutputPath}' to bucket '${deploymentContext.bucketName}'?`,
            initialValue: false,
          })

          if (!shouldContinue) {
            return yield* Effect.interrupt
          }

          const doesBucketExist = yield* frontService.doesFrontBucketExist()
          if (!doesBucketExist) {
            log.error(`Bucket '${deploymentContext.bucketName}' should exist`)

            return yield* Effect.interrupt
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
          const frontBuildFileTrees = yield* frontService.listFrontBuildFileTrees()

          const hasOneFile = hasMinOneFile(frontBuildFileTrees)
          if (!hasOneFile) {
            log.error('Front files should contain minimum one file')

            return yield* Effect.interrupt
          }

          // TODO: keep file root to outside fileTree
          // to keep index.html to the end

          yield* genTaskLogsUi({
            title: 'Uploading files',
            itemGroups: Array.from(frontBuildFileTrees),
            processItem: frontService.uploadFrontFileToBucket,
            message: {
              resolveGroupTitle: (fileTree) => `Uploading '${fileTree.name}' folder`,
              resolveGroupSuccess: (fileTree, duration) =>
                `${fileTree.name}: ${fileTree.items.length} files uploaded in ${Duration.toMillis(duration)}ms`,
              resolveItem: (fileItem) => `File '${fileItem.relativePath}' uploaded`,
              resolveSuccess: () => 'Files uploaded',
            },
            subTaskConcurrency: configContext.bucket.upload.concurrency,
          })
        }),
      }
    }),
    dependencies: [FrontFileObjectService.Default],
  }
) {}
