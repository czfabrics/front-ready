import {
  CANCEL_EXIT_CODE,
  FAILURE_EXIT_CODE,
  renderErrorDetails,
  runCliCommand,
} from '#cli/command_runner'
import { BucketNotFoundError } from '#errors/bucket'
import { Effect } from 'effect'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep clack quiet: only the exit code is under test here.
vi.mock('@clack/prompts', () => ({
  intro: () => {},
  outro: () => {},
  cancel: () => {},
  log: { info: () => {}, error: () => {}, message: () => {} },
}))

const CONFIG = `export default {
  bucket: {
    namePrefix: 'front-ready',
    params: {
      region: 'eu-west-3',
      apiVersion: '2006-03-01',
      endpoint: 'https://example.invalid',
      credentials: { accessKeyId: 'id', secretAccessKey: 'secret' },
    },
  },
  front: {
    type: 'custom',
    custom: {
      build: { command: 'true', args: [] },
      environmentName: 'production',
      buildOutputPath: './dist',
    },
  },
}
`

const MESSAGES = { finished: 'finished', canceled: 'canceled', aborted: 'aborted' }

let originalCwd: string
let tempDir: string

beforeEach(() => {
  originalCwd = process.cwd()
  tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'front-ready-runner-'))
  process.chdir(tempDir)
  process.exitCode = undefined
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(tempDir, { recursive: true, force: true })
  // Never leak a non-zero code into the test process itself.
  process.exitCode = undefined
})

const run = async function (program: Effect.Effect<void, unknown>) {
  // `runPromiseExit`: a cancellation still ends interrupted once the outro is out,
  // which is what `runMain` sees — the exit code set on the way is what matters.
  await Effect.runPromiseExit(
    runCliCommand({ commandName: 'test', program, messages: MESSAGES })
  )

  return process.exitCode
}

describe('runCliCommand', () => {
  // Every failure used to be caught, logged and turned into a success, so the
  // process exited 0 and CI reported a deploy that never happened.
  it('exits non-zero when the command fails', async () => {
    fs.writeFileSync('frontready.config.ts', CONFIG)

    const exitCode = await run(
      Effect.fail(new BucketNotFoundError({ message: 'missing', bucketName: 'b' }))
    )

    expect(exitCode).toBe(FAILURE_EXIT_CODE)
  })

  it('exits with the cancellation code when the user backs out', async () => {
    fs.writeFileSync('frontready.config.ts', CONFIG)

    const exitCode = await run(Effect.interrupt)

    expect(exitCode).toBe(CANCEL_EXIT_CODE)
  })

  it('leaves the exit code alone on success', async () => {
    fs.writeFileSync('frontready.config.ts', CONFIG)

    const exitCode = await run(Effect.void)

    expect(exitCode).toBeUndefined()
  })

  // Config loading used to run outside the error handling: a missing config
  // escaped as a raw fiber trace.
  it('handles a missing config like any other failure', async () => {
    const exitCode = await run(Effect.void)

    expect(exitCode).toBe(FAILURE_EXIT_CODE)
  })
})

describe('renderErrorDetails', () => {
  it('renders structured context and leaves out message, tag and cause', () => {
    const error = new BucketNotFoundError({
      message: 'missing',
      bucketName: 'front-ready-production',
    })

    expect(renderErrorDetails(error)).toStrictEqual([
      'bucketName: "front-ready-production"',
    ])
  })
})
