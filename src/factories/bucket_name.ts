import { InternalConfig } from '#config/schema'
import { InvalidBucketNameError } from '#errors/bucket'
import { log } from '@clack/prompts'
import { Effect } from 'effect'

const MAX_BUCKET_NAME_LENGTH = 63

/**
 * Lowercase, accents stripped (`é` → `e`), every run of anything but letters,
 * digits and hyphens made a single hyphen, no hyphen at either end. Dots go too:
 * a dotted bucket breaks virtual-hosted-style HTTPS.
 */
export const normalizeBucketName = function (value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * `${namePrefix}-${identifier}`, normalised. The identifier names the environment
 * and is never cut; past S3's 63 characters, the prefix is cut instead.
 */
export const makeDeploymentBucketName = function (
  config: InternalConfig,
  bucketIdentifier: string
) {
  return Effect.gen(function* () {
    const rawName = `${config.bucket.namePrefix}-${bucketIdentifier}`
    const prefix = normalizeBucketName(config.bucket.namePrefix)
    const identifier = normalizeBucketName(bucketIdentifier)

    if (identifier.length === 0) {
      return yield* new InvalidBucketNameError({
        message: `The bucket identifier '${bucketIdentifier}' has no letter or digit to build a bucket name from`,
        bucketName: rawName,
      })
    }

    // Normalised again once cut, so the cut never leaves a trailing hyphen.
    const prefixLength = MAX_BUCKET_NAME_LENGTH - identifier.length - 1
    const cutPrefix = normalizeBucketName(prefix.slice(0, Math.max(prefixLength, 0)))

    if (cutPrefix.length === 0) {
      return yield* new InvalidBucketNameError({
        message: `The bucket identifier '${identifier}' is too long: it leaves no room for the name prefix within ${MAX_BUCKET_NAME_LENGTH} characters`,
        bucketName: `${prefix}-${identifier}`,
      })
    }

    const bucketName = `${cutPrefix}-${identifier}`

    // A cut prefix may be shared with another project's: worth a warning.
    if (cutPrefix !== prefix) {
      yield* Effect.sync(() =>
        log.warn(
          `Bucket name '${prefix}-${identifier}' is longer than ${MAX_BUCKET_NAME_LENGTH} characters: the name prefix was cut to '${cutPrefix}', giving '${bucketName}'`
        )
      )
    } else if (bucketName !== rawName) {
      // Only the bucket name is normalised; the build still gets the raw identifier.
      yield* Effect.sync(() =>
        log.info(`Bucket name '${rawName}' normalized to '${bucketName}'`)
      )
    }

    return bucketName
  })
}
