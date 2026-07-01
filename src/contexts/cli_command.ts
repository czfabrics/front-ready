import { Context } from 'effect'

export const CliCommandContext = Context.GenericTag<{
  readonly commandName: string
}>('CliCommandContext')
