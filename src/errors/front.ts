import { InternalConfig } from '#core/config_loader'
import { Data } from 'effect'

export class FrontError extends Data.TaggedError('FrontError')<{
  readonly message: string
  readonly config: InternalConfig['front']
}> {}
