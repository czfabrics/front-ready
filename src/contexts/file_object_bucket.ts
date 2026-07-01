import { BucketLocationConstraint } from '@aws-sdk/client-s3'
import { Context } from 'effect'

export class FileObjectBucketContext extends Context.Tag('FileObjectBucketContext')<
  FileObjectBucketContext,
  { readonly bucketName: string; readonly region: BucketLocationConstraint }
>() {}
