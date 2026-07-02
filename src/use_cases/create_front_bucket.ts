import { FrontDeploymentContext } from '#contexts/front_deployment'
import { FrontFileObjectService } from '#front/service'
import { genFn } from '#helpers/effect'
import { genConfirmUi } from '#ui/confirm'
import { genLoaderUi } from '#ui/loader'
import { log } from '@clack/prompts'
import { Duration, Effect } from 'effect'

export class CreateFrontBucketUseCase extends Effect.Service<CreateFrontBucketUseCase>()(
  'CreateFrontBucketUseCase',
  {
    effect: Effect.gen(function* () {
      const deploymentContext = yield* FrontDeploymentContext
      const frontService = yield* FrontFileObjectService

      return {
        run: genFn(function* () {
          const doesBucketExist = yield* frontService.doesFrontBucketExist()
          if (doesBucketExist) {
            log.info(`The bucket '${deploymentContext.bucketName}' already exist`)

            return yield* Effect.interrupt
          }

          const shouldContinue = yield* genConfirmUi({
            question: `Do you want to create the bucket '${deploymentContext.bucketName}'?`,
            initialValue: true,
          })

          if (!shouldContinue) {
            return yield* Effect.interrupt
          }

          yield* genLoaderUi({
            process: frontService.createFrontBucket,
            message: {
              resolveStart: () => 'Creating front bucket',
              resolveError: (error) => `Creation failed: ${error.message}`,
              resolveCancel: () => 'Creation canceled',
              resolveEnd: (duration) =>
                `Creation finished in ${Duration.toMillis(duration)}ms`,
            },
          })
        }),
      }
    }),
    dependencies: [FrontFileObjectService.Default],
  }
) {}
