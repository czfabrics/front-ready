import { Data } from 'effect'

export class ConfigWrapperError extends Data.TaggedError('ConfigWrapperError')<{
  readonly message: string
}> {}
