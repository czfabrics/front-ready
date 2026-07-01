import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class InternalError extends Data.TaggedError('InternalError')<{
  readonly message: string
  readonly cause: UnknownException
}> {}
