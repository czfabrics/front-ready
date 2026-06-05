import { BucketLocationConstraint } from '@aws-sdk/client-s3'
import { Context } from 'effect'

export const FileObjectBucketContext = Context.GenericTag<{
    readonly bucketName: string
    readonly region: BucketLocationConstraint
}>('FileObjectBucketContext')
