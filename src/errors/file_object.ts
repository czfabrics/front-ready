import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileObject } from '#file_object/repository'
import { $Command } from '@aws-sdk/client-s3'
import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'

export class FileObjectError extends Data.TaggedError('FileObjectError')<{
  readonly message: string
  readonly command: $Command<any, any, any>
  readonly context: FileObjectBucketContext['Type']
  readonly file: Partial<FileObject>
  readonly cause?: UnknownException
}> {}
