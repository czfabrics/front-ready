import { Data } from 'effect'

export class CommandError extends Data.TaggedError('CommandError')<{
  readonly message: string
  readonly code: number
}> {}
