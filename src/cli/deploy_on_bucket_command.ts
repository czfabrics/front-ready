import { runCliCommand } from '#cli/command_runner'
import { isCiEnvironment } from '#helpers/ci'
import { DeployOnBucketUseCase } from '#use_cases/deploy_on_bucket'
import { boolean, command, flag } from 'cmd-ts'
import { Effect } from 'effect'

export const deployOnBucketCommand = command({
  name: 'deploy',
  description:
    "Builds your frontend using the configuration above, then uploads the output to the bucket. The file matching `indexDocumentSuffix` (default: `index.html`) is uploaded **last** — so the new entry point only becomes available once all the hashed chunks it references are already in place, avoiding a window where clients load an `index.html` pointing at chunks that haven't been uploaded yet.",
  args: {
    yes: flag({
      type: boolean,
      long: 'yes',
      short: 'y',
      description:
        'Skip the confirmation prompt, for CI. Implied when the `CI` environment variable is set.',
    }),
  },
  handler: function ({ yes }) {
    return runCliCommand({
      commandName: this.name,
      assumeYes: yes || isCiEnvironment(),
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
