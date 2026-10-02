import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileObject } from '#file_object/repository'
import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

/**
 * Everything a failed bucket operation needs to say *which* object it was about,
 * minus the bytes. `content` is deliberately absent: this payload is rendered into
 * the terminal (and into CI logs) when an upload fails, and carrying the file —
 * either directly or through the `$Command` whose `input.Body` is the same buffer —
 * turned a single 200 KB chunk into a 4.4M character dump. Only the command *name*
 * is kept for the same reason.
 */
export type FileObjectDescription = Omit<FileObject, 'content'>

export class FileObjectError extends Data.TaggedError('FileObjectError')<{
  readonly message: string
  readonly commandName: string
  readonly context: FileObjectBucketContext['Type']
  readonly file: Partial<FileObjectDescription>
  readonly cause?: UnknownException
}> {}
