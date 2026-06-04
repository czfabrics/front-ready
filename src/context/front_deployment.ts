import { Command } from '@effect/platform'
import { Context } from 'effect'

export const FrontDeploymentContext = Context.GenericTag<{
    readonly command: Command.Command
    readonly bucketName: string
    readonly buildOutputPath: string
}>('FrontDeploymentContext')
