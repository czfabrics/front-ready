import { InternalConfig } from '#config/schema'
import { InvalidBucketNameError } from '#errors/bucket'
import { Effect } from 'effect'

const MAX_BUCKET_NAME_LENGTH = 63

/**
 * S3's bucket naming rules, checked on the composed name: that is where they
 * apply — a valid prefix still yields an invalid name with an identifier such as
 * the Angular configuration `Production` — and S3's own answer is an opaque
 * `InvalidBucketName` that names no rule.
 */
const findBucketNameViolation = function (bucketName: string): string | undefined {
  if (bucketName.length < 3 || bucketName.length > MAX_BUCKET_NAME_LENGTH) {
    return `must be between 3 and ${MAX_BUCKET_NAME_LENGTH} characters long (it is ${bucketName.length})`
  }
  if (!/^[a-z0-9.-]+$/.test(bucketName)) {
    return 'may only contain lowercase letters, digits, hyphens and dots'
  }
  if (!/^[a-z0-9].*[a-z0-9]$/.test(bucketName)) {
    return 'must start and end with a letter or a digit'
  }
  if (bucketName.includes('..')) {
    return 'must not contain two adjacent dots'
  }

  return undefined
}

export const makeDeploymentBucketName = function (
  config: InternalConfig,
  bucketIdentifier: string
) {
  const bucketName = `${config.bucket.namePrefix}-${bucketIdentifier}`
  const violation = findBucketNameViolation(bucketName)

  return violation === undefined
    ? Effect.succeed(bucketName)
    : Effect.fail(
        new InvalidBucketNameError({
          message: `The bucket name '${bucketName}' ${violation}`,
          bucketName,
        })
      )
}
