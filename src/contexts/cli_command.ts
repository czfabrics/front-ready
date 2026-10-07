import { Context } from 'effect'

export class CliCommandContext extends Context.Tag('CliCommandContext')<
  CliCommandContext,
  {
    readonly commandName: string
    /**
     * Answer yes to every confirmation and never prompt: set by `deploy --yes`, or
     * in CI. Anything that would need an answer fails instead of hanging.
     */
    readonly assumeYes: boolean
  }
>() {}
