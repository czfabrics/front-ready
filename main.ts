import { cli } from '#cli/cli'
import { InternalError } from '#errors/internal'
import { toEffect } from '#helpers/effect'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { run } from 'cmd-ts'
import { Effect } from 'effect'

const runCli = toEffect(run(cli, process.argv.slice(2)), InternalError, {}).pipe(
  Effect.flatMap(({ value }) => value)
)

NodeRuntime.runMain(runCli.pipe(Effect.provide(NodeContext.layer)))
