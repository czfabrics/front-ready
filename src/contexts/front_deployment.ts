import { Command } from '@effect/platform'
import { Context } from 'effect'

export class FrontDeploymentContext extends Context.Tag('FrontDeploymentContext')<
  FrontDeploymentContext,
  {
    readonly command: Command.Command
    readonly bucketName: string
    readonly buildOutputPath: string
  }
>() {}
