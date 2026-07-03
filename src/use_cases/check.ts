import { FrontDeploymentContext } from '#contexts/front_deployment'
import { FrontFileObjectService } from '#front/service'
import { genFn } from '#helpers/effect'
import { log } from '@clack/prompts'
import { Effect } from 'effect'

export class CheckUseCase extends Effect.Service<CheckUseCase>()('CheckUseCase', {
  effect: Effect.gen(function* () {
    const deploymentContext = yield* FrontDeploymentContext
    const frontService = yield* FrontFileObjectService

    return {
      run: genFn(function* () {
        const doesBucketExist = yield* frontService.doesFrontBucketExist()
        if (doesBucketExist) {
          log.success(`The bucket '${deploymentContext.bucketName}' exists`)
        } else {
          log.warn(`The bucket '${deploymentContext.bucketName}' does not exist`)
        }

        if (doesBucketExist) {
          const isDeployed = yield* frontService.isAlreadyDeployed()

          if (isDeployed) {
            log.info(
              'The front has been deployed at least once (Bucket contains objects)'
            )
          }
        }

        if (!deploymentContext.buildOutputHashing) {
          log.warn(
            'Unable to determine if your front build outputs content-hashed (randomly named) chunk files'
          )
        } else {
          const isScriptHasHashingMecanism = ['bundles', 'all'].includes(
            deploymentContext.buildOutputHashing
          )

          if (!isScriptHasHashingMecanism) {
            log.success(
              'Your front build outputs content-hashed (randomly named) chunk files'
            )
          } else {
            log.warn(
              'Your front build does not output content-hashed (randomly named) chunk files'
            )
          }
        }
      }),
    }
  }),
  dependencies: [FrontFileObjectService.Default],
}) {}
