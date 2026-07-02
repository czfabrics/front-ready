import { FileItem } from '#file/types'
import { Data } from 'effect'

export class FileError extends Data.TaggedError('FileError')<{
  readonly message: string
  readonly file: FileItem | undefined
}> {}

export class FileNotFoundError extends Data.TaggedError('FileNotFoundError')<{
  readonly message: string
  readonly file: Partial<FileItem>
}> {}
