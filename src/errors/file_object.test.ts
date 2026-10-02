import { FileObjectError } from '#errors/file_object'
import { Inspectable } from 'effect'
import { describe, expect, it } from 'vitest'

describe('FileObjectError', () => {
  // A failed upload used to carry the whole file twice — on `file.content` and on
  // the S3 command's `input.Body` — so one 200 KB chunk rendered as 4.4M characters.
  it('renders compactly whatever the size of the object it is about', () => {
    const error = new FileObjectError({
      message: 'Access Denied',
      commandName: 'PutObject',
      context: { bucketName: 'front-ready-production', region: 'eu-west-3' },
      file: {
        key: '_astro/main.abc123.js',
        contentType: 'text/javascript',
        cacheControlValue: 'max-age=31536000',
      },
    })

    expect(Inspectable.toStringUnknown(error).length).toBeLessThan(1024)
  })
})
