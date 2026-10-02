import { FileObjectBucketContext } from '#contexts/file_object_bucket'
import { FileObjectApiInstance } from '#file_object/api_instance'
import { FileObjectRepository } from '#file_object/repository'
import { S3Client, S3ServiceException } from '@aws-sdk/client-s3'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

type SentCommand = { name: string; input: Record<string, unknown> }

const s3Failure = function (name: string, httpStatusCode: number) {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode },
    message: name,
  })
}

/**
 * Records every command it is sent, and answers with `respond` — so a test can
 * assert both what went over the wire and how a given S3 answer is interpreted.
 */
const makeFakeClient = function (
  respond: (name: string) => Promise<unknown> = () => Promise.resolve({})
) {
  const sent: SentCommand[] = []
  const client = {
    send: (command: {
      constructor: { name: string }
      input: Record<string, unknown>
    }) => {
      const name = command.constructor.name.replace(/Command$/, '')
      sent.push({ name, input: command.input })

      return respond(name)
    },
  } as unknown as S3Client

  return { client, sent }
}

const runWith = function <TValue, TError>(
  options: { region?: string; accessMode: 'acl' | 'policy' },
  client: S3Client,
  use: (repository: FileObjectRepository) => Effect.Effect<TValue, TError>
) {
  return Effect.runPromiseExit(
    Effect.flatMap(FileObjectRepository, use).pipe(
      Effect.provide(FileObjectRepository.DefaultWithoutDependencies),
      Effect.provide(Layer.succeed(FileObjectApiInstance, client)),
      Effect.provide(
        Layer.succeed(FileObjectBucketContext, {
          bucketName: 'front-ready-production',
          region: options.region ?? 'eu-west-3',
          accessMode: options.accessMode,
        })
      )
    )
  )
}

const OBJECT = {
  key: 'index.html',
  content: new Uint8Array([1, 2, 3]),
  contentType: 'text/html',
  cacheControlValue: 'max-age=60',
}

describe('doesBucketExist', () => {
  it('is true when HeadBucket succeeds', async () => {
    const { client } = makeFakeClient()

    const exit = await runWith({ accessMode: 'acl' }, client, (r) => r.doesBucketExist())

    expect(exit).toStrictEqual(Exit.succeed(true))
  })

  it('is false only when S3 answers 404', async () => {
    const { client } = makeFakeClient(() => Promise.reject(s3Failure('NotFound', 404)))

    const exit = await runWith({ accessMode: 'acl' }, client, (r) => r.doesBucketExist())

    expect(exit).toStrictEqual(Exit.succeed(false))
  })

  // Every failure used to read as "the bucket does not exist" — so a 403, bad
  // credentials or an unreachable endpoint were all misreported.
  it('fails on a 403 instead of reporting the bucket as missing', async () => {
    const { client } = makeFakeClient(() => Promise.reject(s3Failure('Forbidden', 403)))

    const exit = await runWith({ accessMode: 'acl' }, client, (r) => r.doesBucketExist())

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('fails when the endpoint cannot be reached', async () => {
    const { client } = makeFakeClient(() =>
      Promise.reject(
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      )
    )

    const exit = await runWith({ accessMode: 'acl' }, client, (r) => r.doesBucketExist())

    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe('createBucket', () => {
  // `BucketOwnerEnforced` disables ACLs, and the `'acl'` mode then relies on them.
  it("leaves object ownership alone in 'acl' mode", async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'acl' }, client, (r) => r.createBucket())

    expect(sent[0]?.input).not.toHaveProperty('ObjectOwnership')
  })

  it("disables ACLs in 'policy' mode", async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'policy' }, client, (r) => r.createBucket())

    expect(sent[0]?.input).toHaveProperty('ObjectOwnership', 'BucketOwnerEnforced')
  })

  it('sends the region as the location constraint', async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'acl', region: 'eu-west-3' }, client, (r) =>
      r.createBucket()
    )

    expect(sent[0]?.input).toHaveProperty(
      'CreateBucketConfiguration.LocationConstraint',
      'eu-west-3'
    )
  })

  // AWS answers `InvalidLocationConstraint` to an explicit 'us-east-1'.
  it('omits the location constraint for us-east-1', async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'acl', region: 'us-east-1' }, client, (r) =>
      r.createBucket()
    )

    expect(sent[0]?.input).not.toHaveProperty('CreateBucketConfiguration')
  })
})

describe('grantPublicRead', () => {
  it("grants a public-read bucket ACL in 'acl' mode", async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'acl' }, client, (r) => r.grantPublicRead())

    expect(sent.map(({ name }) => name)).toStrictEqual(['PutBucketAcl'])
  })

  it("lifts Block Public Access, then grants read by policy, in 'policy' mode", async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'policy' }, client, (r) => r.grantPublicRead())

    expect(sent.map(({ name }) => name)).toStrictEqual([
      'PutPublicAccessBlock',
      'PutBucketPolicy',
    ])
    expect(JSON.parse(sent[1]?.input['Policy'] as string)).toMatchObject({
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::front-ready-production/*',
        },
      ],
    })
  })
})

describe('putObject', () => {
  it("sets a public-read ACL in 'acl' mode", async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'acl' }, client, (r) => r.putObject(OBJECT))

    expect(sent[0]?.input).toHaveProperty('ACL', 'public-read')
  })

  // A `BucketOwnerEnforced` bucket rejects any other ACL.
  it("sends no ACL in 'policy' mode", async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'policy' }, client, (r) => r.putObject(OBJECT))

    expect(sent[0]?.input).not.toHaveProperty('ACL')
  })

  it('sends no Content-Encoding', async () => {
    const { client, sent } = makeFakeClient()

    await runWith({ accessMode: 'acl' }, client, (r) => r.putObject(OBJECT))

    expect(sent[0]?.input).not.toHaveProperty('ContentEncoding')
  })
})
