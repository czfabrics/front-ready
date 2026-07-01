import { InternalConfig } from '#core/config_loader'
import { Context } from 'effect'

export const InternalConfigContext = Context.GenericTag<InternalConfig>(
  'FrontDeploymentContext'
)
