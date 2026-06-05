import { FrontDeploymentContext } from '#contexts/front_deployment'
import { runFrontBuildCommand } from '#core/front_build_command_runner'
import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { FrontFileObjectService } from '#file_object/front_service'
import { toEffect } from '#helpers/promise'
import { confirm, log, outro, tasks } from '@clack/prompts'
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
                            TUiWrapperError
                        )

                        if (!shouldContinue) {
                            log.message(`User answered no`)
                            outro(`Deployment aborted`)
                            return
                        }

                        yield* runFrontBuildCommand
                        const frontBuildFiles = yield* frontService.listFrontBuildFiles()

                        // TODO: issue, propagate error through tui functions
                        yield* toEffect(
                            tasks([
                                {
                                    title: 'Uploading front files',
                                    task: (logMessage) => {
                                        return Effect.runPromise(
                                            Effect.gen(function* () {
                                                const [duration] = yield* Effect.timed(
                                                    frontService.uploadFrontFilesToBucket(
                                                        frontBuildFiles,
                                                        (object) =>
                                                            logMessage(
                                                                `File '${object.key}' uploaded`
                                                            )
                                                    )
                                                )

                                                return `Uploaded ${frontBuildFiles.length} files in ${Duration.toMillis(duration)}ms`
                                            })
                                        )
                                    },
                                },
                            ]),
                            TUiWrapperError
                        )
                    }),
            }
        }),
        dependencies: [FrontFileObjectService.Default],
    }
) {}
