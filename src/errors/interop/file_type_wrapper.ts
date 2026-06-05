import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class FileTypeWrapperError extends Data.TaggedError('FileTypeWrapperError')<{
    readonly message: string
    readonly cause: UnknownException
}> {}
