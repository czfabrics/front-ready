import { CliCommandContext } from '#contexts/cli_command'
import { loadConfig } from '#core/config_loader'
import { intro, log } from '@clack/prompts'
import { Effect } from 'effect'
import packageInfo from 'package.json'

export const startCli = Effect.gen(function* () {
    const context = yield* CliCommandContext

    intro(`${packageInfo.name}@${packageInfo.version} - ${context.commandName}`)

    const config = yield* loadConfig

    log.success('Configuration loaded')

    return { config }
})
