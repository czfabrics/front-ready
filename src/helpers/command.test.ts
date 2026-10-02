import { quoteShellArgument, runCommand } from '#helpers/command'
import { Command } from '@effect/platform'
import { NodeContext } from '@effect/platform-node'
import { Effect } from 'effect'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import { describe, expect, it } from 'vitest'

const output = async function (command: Command.Command) {
  let text = ''

  await Effect.runPromise(
    runCommand(command, (chunk) => {
      text += chunk
    }).pipe(Effect.provide(NodeContext.layer))
  )

  return text
}

describe.skipIf(process.platform === 'win32')('runCommand', () => {
  // The shell received the arguments joined with spaces: one holding a space was
  // split in two, one holding `;` ran as a command of its own.
  it('passes every argument through as exactly one argument', async () => {
    const text = await output(
      Command.make('printf', '[%s]\\n', 'two words', 'x; echo INJECTED', "it's")
    )

    expect(text).toBe("[two words]\n[x; echo INJECTED]\n[it's]\n")
  })

  it('still runs a command written as one string, as the docs show', async () => {
    expect(await output(Command.make('echo hello', 'world'))).toBe('hello world\n')
  })

  it('keeps the working directory', async () => {
    const directory = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), 'fr-cmd-'))
    )

    try {
      const text = await output(
        Command.make('pwd').pipe(Command.workingDirectory(directory))
      )

      expect(text.trim()).toBe(directory)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('quoteShellArgument', () => {
  it.each(['production', '--configuration', 'dist/app', 'a=b'])(
    'leaves the safe argument %j untouched',
    (argument) => {
      expect(quoteShellArgument(argument, 'linux')).toBe(argument)
    }
  )

  it('single-quotes for a POSIX shell, escaping embedded quotes', () => {
    expect(quoteShellArgument("it's; rm", 'linux')).toBe("'it'\\''s; rm'")
  })

  it('double-quotes for cmd.exe, doubling embedded quotes', () => {
    expect(quoteShellArgument('say "hi" & exit', 'win32')).toBe('"say ""hi"" & exit"')
  })
})
