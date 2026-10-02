import { startCli } from '#cli/cli_starter'
import { CliCommandContext } from '#contexts/cli_command'
import { CANCEL_EXIT_CODE, FAILURE_EXIT_CODE } from '#core/exit_codes'
import { InternalConfigContext } from '#contexts/internal_config'
import { makeFrontDeploymentContextLayer } from '#factories/front_deployment_context'
import { runAndInterruptOnCtrlC } from '#helpers/runtime'
import { cancel, log, outro } from '@clack/prompts'
import { Effect, Layer } from 'effect'

const IGNORED_ERROR_FIELDS = new Set(['_tag', 'message', 'cause', 'stack', 'name'])

/**
 * One line per piece of structured context the error carries, rather than a dump
 * of the whole object: an error's fields can hold arbitrarily large values, and
 * this ends up in a terminal or a CI log.
 */
export const renderErrorDetails = function (error: object): string[] {
  return Object.entries(error)
    .filter(([key]) => !IGNORED_ERROR_FIELDS.has(key))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
}

const renderErrorMessage = function (error: unknown): string {
  if (error instanceof Error) {
    const tag =
      '_tag' in error && typeof error._tag === 'string' ? error._tag : error.name

    return `${tag}: ${error.message}`
  }

  return String(error)
}

/**
 * The lifecycle every command shares: intro, config, the deployment context, the
 * Ctrl-C race, and an outro that tells the truth — through the exit code too, so
 * that CI fails a deploy that did not happen. Config loading sits inside the same
 * error handling as the work, so a missing or invalid config gets the same
 * rendering as any other failure instead of a raw fiber trace.
 */
export const runCliCommand = function <TError, TDeps>({
  commandName,
  program,
  messages,
}: {
  commandName: string
  program: Effect.Effect<void, TError, TDeps>
  messages: { finished: string; canceled: string; aborted: string }
}) {
  return Effect.gen(function* () {
    const { config } = yield* startCli()

    yield* runAndInterruptOnCtrlC(
      program.pipe(
        Effect.provide(makeFrontDeploymentContextLayer(config)),
        Effect.provide(Layer.succeed(InternalConfigContext, config))
      )
    )

    outro(messages.finished)
  }).pipe(
    Effect.provide(Layer.succeed(CliCommandContext, { commandName })),
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        cancel(messages.canceled)
        process.exitCode = CANCEL_EXIT_CODE
      })
    ),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        log.error(renderErrorMessage(error))

        const details =
          typeof error === 'object' && error !== null ? renderErrorDetails(error) : []
        if (details.length > 0) {
          log.message(details.join('\n'))
        }

        outro(messages.aborted)
        process.exitCode = FAILURE_EXIT_CODE
      })
    )
  )
}
