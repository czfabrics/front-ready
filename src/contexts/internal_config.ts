import { InternalConfig } from '#core/config_loader'
import { Context } from 'effect'

export class InternalConfigContext extends Context.Tag('InternalConfigContext')<
  InternalConfigContext,
  InternalConfig
>() {}
