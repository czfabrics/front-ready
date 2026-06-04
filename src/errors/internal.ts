import { Data } from 'effect'

export class InternalError extends Data.TaggedError('InternalError')<{
    readonly message?: string
}> {}
