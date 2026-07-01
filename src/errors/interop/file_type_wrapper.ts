import { FileItem } from '#file/types'
import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class FileTypeWrapperError extends Data.TaggedError('FileTypeWrapperError')<{
  readonly message: string
  readonly file: FileItem
  readonly cause?: UnknownException
}> {}
