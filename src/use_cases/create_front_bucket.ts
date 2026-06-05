import { FrontDeploymentContext } from '#contexts/front_deployment'
import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { FrontFileObjectService } from '#file_object/front_service'
import { toEffect } from '#helpers/promise'
import { confirm, log, outro, spinner } from '@clack/prompts'
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
                            log.info(
                                `The bucket '${deploymentContext.bucketName}' already exist`
                            )
                            outro(`Creation aborted`)
                        }

                        const shouldContinue = yield* toEffect(
                            confirm({
                                message: `Do you want to create the bucket '${deploymentContext.bucketName}'?`,
                            }),
                            TUiWrapperError
                        )

                        if (!shouldContinue) {
                            log.message(`User answered no`)
                            outro(`Creation aborted`)
                            return
                        }

                        const s = spinner()
                        s.start('Creating front bucket')

                        yield* frontService.createFrontBucket()

                        s.stop('Front bucket created')
                    }),
            }
        }),
        dependencies: [FrontFileObjectService.Default],
    }
) {}
