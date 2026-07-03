import { Command } from '@effect/platform'
import { Context } from 'effect'
import z from 'zod'

// none    → nothing hashed
// media   → only assets (images, fonts…) hashed, NOT chunks
// bundles → JS/CSS chunks hashed
// all     → chunks + media hashed
export const OutputHashingSchema = z.enum(['none', 'media', 'bundles', 'all'])
export type OutputHashingSchema = typeof OutputHashingSchema
export type OutputHashing = z.infer<typeof OutputHashingSchema>

export class FrontDeploymentContext extends Context.Tag('FrontDeploymentContext')<
  FrontDeploymentContext,
  {
    readonly command: Command.Command
    readonly bucketName: string
    readonly buildOutputPath: string
    readonly buildOutputHashing: OutputHashing | undefined
  }
>() {}
