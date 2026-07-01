import { FrontDeploymentContext } from '#contexts/front_deployment'
import { FrontFileObjectService } from '#front/service'
import { genConfirmUi } from '#ui/confirm'
import { genLoaderUi } from '#ui/loader'
import { log } from '@clack/prompts'
import { Effect } from 'effect'

export class CreateFrontBucketUseCase extends Effect.Service<CreateFrontBucketUseCase>()(
  'CreateFrontBucketUseCase',
  {
    effect: Effect.gen(function* () {
      const deploymentContext = yield* FrontDeploymentContext
      const frontService = yield* FrontFileObjectService

      return {
        run: () =>
          Effect.gen(function* () {
            const doesBucketExist = yield* frontService.doesFrontBucketExist()
            if (doesBucketExist) {
              log.info(`The bucket '${deploymentContext.bucketName}' already exist`)

              return {
                isAborted: true,
              }
            }

            const shouldContinue = yield* genConfirmUi({
              question: `Do you want to create the bucket '${deploymentContext.bucketName}'?`,
              initialValue: true,
            })

            if (!shouldContinue) {
              return {
                isAborted: true,
              }
            }

            yield* genLoaderUi({
              process: frontService.createFrontBucket,
              message: {
                resolveStart: () => 'Creating front bucket',
                resolveError: (error) => error.message,
                resolveEnd: () => 'Front bucket created',
              },
            })

            return {
              isAborted: false,
            }
          }),
      }
    }),
    dependencies: [FrontFileObjectService.Default],
  }
) {}
