import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class TUiWrapperError extends Data.TaggedError('TUiWrapperError')<{
  readonly uiFunction: string
  readonly message: string
  readonly cause: UnknownException
}> {}
