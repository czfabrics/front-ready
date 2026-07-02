import { Config, ConfigSchema } from '#config/schema'
import { ConfigFormatError } from '#errors/config_format'
import { ConfigWrapperError } from '#errors/interop/config_wrapper'
import { genFn, toEffect } from '#helpers/effect'
import { loadConfig as c12LoadConfig } from 'c12'
import { Effect } from 'effect'

export const loadConfig = genFn(function* () {
  const { config } = yield* toEffect(
    c12LoadConfig<Config>({
      name: 'frontready',
      configFileRequired: true,
    }),
    ConfigWrapperError,
    {}
  )

  const parsedConfig = ConfigSchema.safeParse(config)

  if (parsedConfig.success) {
    return parsedConfig.data
  }

  return yield* Effect.fail(
    new ConfigFormatError({
      cause: parsedConfig.error,
    })
  )
})
