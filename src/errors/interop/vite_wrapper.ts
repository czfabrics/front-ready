import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class ViteWrapperError extends Data.TaggedError('ViteWrapperError')<{
  readonly configPath: string
  readonly message: string
  readonly cause: UnknownException
}> {}
