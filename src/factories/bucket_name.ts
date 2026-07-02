import { InternalConfig } from '#config/schema'

export const makeDeploymentBucketName = function (
  config: InternalConfig,
  bucketIdentifier: string
) {
  return `${config.bucket.namePrefix}-${bucketIdentifier}`
}
