import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class FileObjectWrapperError extends Data.TaggedError('FileObjectWrapperError')<{
    readonly message: string
    readonly cause: UnknownException
}> {}
