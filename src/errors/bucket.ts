import { Data } from 'effect'

export class BucketNotFoundError extends Data.TaggedError('BucketNotFoundError')<{
  readonly message: string
  readonly bucketName: string
}> {}

export class InvalidBucketNameError extends Data.TaggedError('InvalidBucketNameError')<{
  readonly message: string
  readonly bucketName: string
}> {}
