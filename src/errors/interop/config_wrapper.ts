import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class ConfigWrapperError extends Data.TaggedError('ConfigWrapperError')<{
  readonly message: string
  readonly cause?: UnknownException
}> {}
