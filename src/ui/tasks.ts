import { IterableElement, IteratorImpl } from '#core/common'
import { FileObjectWrapperError } from '#errors/interop/file_object_wrapper'
import { FileTypeWrapperError } from '#errors/interop/file_type_wrapper'
import { genPromise } from '#helpers/promise'
import { Task } from '@clack/prompts'
import { PlatformError } from '@effect/platform/Error'
import { Duration, Effect } from 'effect'

export const genTaskUi = <
  TItems extends IteratorImpl<any>,
  TItem extends IterableElement<TItems>,
>({
  title,
  items,
  functions,
  subTaskConcurrency,
}: {
  title: string
  items: TItems
  functions: {
    processItem: (
      item: TItem
    ) => Effect.Effect<
      void,
      PlatformError | FileTypeWrapperError | FileObjectWrapperError,
      never
    >
    resolveItemMessage: (item: TItem) => string
    resolveFinalMessage: (items: TItems, duration: Duration.Duration) => string
  }
  subTaskConcurrency: number
}): Task => {
  return {
    title,
    task: genPromise(function* (logMessage) {
      const [duration] = yield* Effect.timed(
        Effect.gen(function* () {
          const itemProcesses = Array.from(items).map((item) =>
            Effect.gen(function* () {
              yield* functions.processItem(item)
              logMessage(functions.resolveItemMessage(item))
            })
          )

          yield* Effect.all(itemProcesses, {
            concurrency: subTaskConcurrency,
          })
        })
      )

      return functions.resolveFinalMessage(items, duration)
    }),
  }
}
