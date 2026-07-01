import { FileItem } from '#file/types'
import { Data } from 'effect'

export class FileError extends Data.TaggedError('FileError')<{
  readonly message: string
  readonly cause: FileItem
}> {}
