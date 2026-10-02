import { runCliCommand } from '#cli/command_runner'
import { CreateFrontBucketUseCase } from '#use_cases/create_front_bucket'
import { command } from 'cmd-ts'
import { Effect } from 'effect'

export const createFrontBucketCommand = command({
  name: 'create',
  description:
    'Creates the bucket and prepares it for static hosting: sets `BucketOwnerEnforced` object ownership, makes the bucket publicly readable, and adds the static website configuration.',
  args: {},
  handler: function () {
    return runCliCommand({
      commandName: this.name,
      program: Effect.flatMap(CreateFrontBucketUseCase, (useCase) => useCase.run()).pipe(
        Effect.provide(CreateFrontBucketUseCase.Default)
      ),
      messages: {
        finished: 'Creation finished',
        canceled: 'Creation canceled',
        aborted: 'Creation aborted',
      },
    })
  },
})
