import { IterableElement, IteratorImpl } from '#core/types'
import { taskLog } from '@clack/prompts'
import { Duration, Effect, Stream } from 'effect'

export const genTaskLogsUi = <
  TItemGroup extends IteratorImpl<any>,
  TItem extends IterableElement<TItemGroup>,
  TProcessError,
>({
  title,
  itemGroups,
  processItem,
  message,
  subTaskConcurrency,
}: {
  title: string
  itemGroups: Iterable<TItemGroup>
  processItem: (item: TItem) => Effect.Effect<void, TProcessError, never>
  message: {
    resolveItem: (item: TItem) => string
    resolveGroupTitle: (group: TItemGroup) => string
    resolveGroupSuccess: (group: TItemGroup, duration: Duration.Duration) => string
    resolveGroupError: (group: TItemGroup, error: TProcessError) => string
    resolveSuccess: (duration: Duration.Duration) => string
  }
  subTaskConcurrency: number
}) => {
  return Effect.gen(function* () {
    const log = taskLog({
      title,
      retainLog: false,
    })

    const processGroup = (group: TItemGroup) =>
      Effect.gen(function* () {
        const groupLog = log.group(message.resolveGroupTitle(group))

        const [duration] = yield* Effect.timed(
          Stream.fromIterable(group as Iterable<TItem>).pipe(
            Stream.mapEffect(
              (item) =>
                Effect.gen(function* () {
                  yield* processItem(item)
                  groupLog.message(message.resolveItem(item))
                }),
              { concurrency: subTaskConcurrency }
            ),
            Stream.runDrain,
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                groupLog.error(message.resolveGroupError(group, error))
                return yield* Effect.fail(error)
              })
            )
          )
        )

        groupLog.success(message.resolveGroupSuccess(group, duration))
      })

    const [duration] = yield* Effect.timed(
      Stream.fromIterable(itemGroups).pipe(
        Stream.mapEffect(processGroup, { concurrency: 'unbounded' }),
        Stream.runDrain
      )
    )

    log.success(message.resolveSuccess(duration))
  })
}
