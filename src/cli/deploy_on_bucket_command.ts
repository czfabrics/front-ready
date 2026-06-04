import { startCli } from '#cli/cli_starter'
import { runFrontBuildCommand } from '#core/front_build_command_runner'
import { makeFrontBuildCommand } from '#factories/front_build_command'
import { command } from 'cmd-ts'
import { Effect, Layer } from 'effect'
import { CliCommandContext } from 'src/context/cli_command'

export const deployOnBucketCommand = command({
    name: 'deploy',
    description: 'TODO',
    args: {},
    handler: function () {
        const commandContext = Layer.succeed(CliCommandContext, {
            commandName: this.name,
        })

        // intro(packageInfo.name)

        // log.message('Hello, World')

        // await tasks([
        //   {
        //     title: 'Installing via npm',
        //     task: async (message) => {
        //       // Do installation here
        //       return 'Installed via npm';
        //     },
        //   },
        // ]);

        // const name = await text({
        //     message: 'What is your name?',
        //     placeholder: 'John Doe',
        //     validate: (value) => {
        //         if (!value || value.length < 2)
        //             return 'Name must be at least 2 characters'
        //         return undefined
        //     },
        // })

        return Effect.gen(function* () {
            const { config } = yield* startCli

            const frontBuildCommand = yield* makeFrontBuildCommand(config)
            yield* runFrontBuildCommand(frontBuildCommand)

            // const shouldContinue = yield* Effect.tryPromise(() =>
            //     confirm({
            //         message: `Do you want to deploy 'outputPath' to bucket 'ubikap-hosting-integration'?`,
            //     })
            // )
        }).pipe(Effect.provide(commandContext))
    },
})

// import { intro, outro } from '@clack/prompts';

// intro(`create-my-app`);
// // Do stuff
// outro(`You're all set!`);

// TODO: workflow
// if front angular and no configName
// -> demands config Name to the user
// end
//
// Recap: bucket name, command to build front, output path
//
// demands confirmation
//
// execute
//
// result: number of file, size etc...
