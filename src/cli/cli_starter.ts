import { loadConfig } from '#config/loader'
import { CliCommandContext } from '#contexts/cli_command'
import { intro, log } from '@clack/prompts'
import { Effect } from 'effect'
import packageInfo from 'package.json'

export const startCli = function () {
  return Effect.gen(function* () {
    const context = yield* CliCommandContext

    intro(`${packageInfo.name}@${packageInfo.version} - ${context.commandName}`)

    const config = yield* loadConfig()

    log.info('Configuration loaded')

    return { config }
  })
}
