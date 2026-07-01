import { IterableElement, IteratorImpl } from '#core/common'
import { FileObjectWrapperError } from '#errors/interop/file_object_wrapper'
import { FileTypeWrapperError } from '#errors/interop/file_type_wrapper'
import { taskLog } from '@clack/prompts'
import { PlatformError } from '@effect/platform/Error'
import { Duration, Effect } from 'effect'

export const genTaskLogsUi = <
  TItemGroup extends IteratorImpl<any>,
  TItem extends IterableElement<TItemGroup>,
>({
  title,
  itemGroups,
  processItem,
  message,
  subTaskConcurrency,
}: {
  title: string
  itemGroups: TItemGroup[]
  processItem: (
    item: TItem
  ) => Effect.Effect<
    void,
    PlatformError | FileTypeWrapperError | FileObjectWrapperError,
    never
  >
  message: {
    resolveItem: (item: TItem) => string
    resolveGroupTitle: (group: TItemGroup) => string
    resolveGroupSuccess: (group: TItemGroup, duration: Duration.Duration) => string
    resolveSuccess: () => string
  }
  subTaskConcurrency: number
}) => {
  return Effect.gen(function* () {
    const log = taskLog({
      title,
      retainLog: false,
    })

    const tasks = Array.from(itemGroups).map((group) => {
      return Effect.gen(function* () {
        const groupLog = log.group(message.resolveGroupTitle(group))

        const [duration] = yield* Effect.timed(
          Effect.gen(function* () {
            const itemProcesses = Array.from(group).map((item) =>
              Effect.gen(function* () {
                yield* processItem(item)
                groupLog.message(message.resolveItem(item))
              })
            )

            yield* Effect.all(itemProcesses, {
              concurrency: subTaskConcurrency,
            })
          })
        )

        groupLog.success(message.resolveGroupSuccess(group, duration))
      })
    })

    yield* Effect.all(tasks, {
      concurrency: 'unbounded',
    })

    log.success(message.resolveSuccess())
  })
}
