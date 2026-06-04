import { InternalConfig } from '#core/config_loader'
import { PromptError } from '#errors/prompt'
import { resolveAngularConfigurations } from '#helpers/angular'
import { promiseIntoEffect } from '#helpers/promise_into_effect'
import { log, select } from '@clack/prompts'
import { Command } from '@effect/platform'
import { Effect } from 'effect'
import { match } from 'ts-pattern'

export const makeFrontBuildCommand = function (config: InternalConfig) {
    return match(config.front)
        .with({ type: 'angular' }, (config) => {
            if (config.angular.configurationName) {
                return Effect.succeed(
                    Command.make('ng', 'build', config.angular.configurationName)
                )
            }

            log.warning('Angular configuration name not found in configuration')
            log.message(
                `Reading '${config.angular.angularJsonPath}' file to get available configurations`
            )

            return resolveAngularConfigurations(config.angular.angularJsonPath).pipe(
                Effect.flatMap((configurationNames) => {
                    const options = configurationNames.map((name) => ({
                        value: name,
                        label: name,
                    }))

                    return promiseIntoEffect(
                        select({
                            message: 'Pick an Angular configuration.',
                            options: options,
                        }),
                        {
                            errorConstructor: PromptError,
                            default: {
                                message: 'Unable to parse user input',
                            },
                        }
                    )
                }),
                Effect.map((configurationName) =>
                    Command.make('ng', 'build', configurationName.toString())
                )
            )
        })
        .exhaustive()
        .pipe(Effect.map((command) => command.pipe(Command.runInShell(true))))
}
