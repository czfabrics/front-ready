import { runCliCommand } from '#cli/command_runner'
import { CheckUseCase } from '#use_cases/check'
import { command } from 'cmd-ts'
import { Effect } from 'effect'

export const checkCommand = command({
  name: 'check',
  description:
    'Verifies that your build produces randomly named (content-hashed) chunk files, which the default cache configuration relies on. Also checks that the configured bucket exists and that it contains at least one object.',
  args: {},
  handler: function () {
    return runCliCommand({
      commandName: this.name,
      program: Effect.flatMap(CheckUseCase, (useCase) => useCase.run()).pipe(
        Effect.provide(CheckUseCase.Default)
      ),
      messages: {
        finished: 'Check finished',
        canceled: 'Check canceled',
        aborted: 'Check aborted',
      },
    })
  },
})
