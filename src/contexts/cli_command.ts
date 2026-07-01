import { Context } from 'effect'

export class CliCommandContext extends Context.Tag('CliCommandContext')<
  CliCommandContext,
  { readonly commandName: string }
>() {}
