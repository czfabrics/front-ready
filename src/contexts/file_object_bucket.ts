import { Context } from 'effect'

export class FileObjectBucketContext extends Context.Tag('FileObjectBucketContext')<
  FileObjectBucketContext,
  {
    readonly bucketName: string
    readonly region: string
    readonly accessMode: 'acl' | 'policy'
  }
>() {}
