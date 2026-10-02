import { runCliCommand } from '#cli/command_runner'
import { DeployOnBucketUseCase } from '#use_cases/deploy_on_bucket'
import { command } from 'cmd-ts'
import { Effect } from 'effect'

export const deployOnBucketCommand = command({
  name: 'deploy',
  description:
    "Builds your frontend using the configuration above, then uploads the output to the bucket. The file matching `indexDocumentSuffix` (default: `index.html`) is uploaded **last** — so the new entry point only becomes available once all the hashed chunks it references are already in place, avoiding a window where clients load an `index.html` pointing at chunks that haven't been uploaded yet.",
  args: {},
  handler: function () {
    return runCliCommand({
      commandName: this.name,
      program: Effect.flatMap(DeployOnBucketUseCase, (useCase) => useCase.run()).pipe(
        Effect.provide(DeployOnBucketUseCase.Default)
      ),
      messages: {
        finished: 'Deployment finished',
        canceled: 'Deployment canceled',
        aborted: 'Deployment aborted',
      },
    })
  },
})
