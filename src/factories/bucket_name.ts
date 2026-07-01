import { InternalConfig } from '#core/config_loader'

export const makeDeploymentBucketName = function (
  config: InternalConfig,
  bucketIdentifier: string
) {
  return `${config.bucket.namePrefix}-${bucketIdentifier}`
}
