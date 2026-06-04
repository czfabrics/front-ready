import { cli } from '#cli/cli'
import { InternalError } from '#errors/internal'
import { promiseIntoEffect } from '#helpers/promise_into_effect'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { run } from 'cmd-ts'
import { Effect } from 'effect'

const runCli = promiseIntoEffect(run(cli, process.argv.slice(2)), {
    errorConstructor: InternalError,
    default: {
        message: 'Unable to run the CLI',
    },
}).pipe(Effect.flatMap(({ value }) => value))

NodeRuntime.runMain(runCli.pipe(Effect.provide(NodeContext.layer)))
