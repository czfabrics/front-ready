import { Data } from 'effect'

export class PromptError extends Data.TaggedError('PromptError')<{
  readonly message: string
}> {}
