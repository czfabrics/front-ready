import { InternalConfig } from '#config/schema'
import { Context } from 'effect'

export class InternalConfigContext extends Context.Tag('InternalConfigContext')<
  InternalConfigContext,
  InternalConfig
>() {}
