import { IterableElement, IteratorImpl } from '#core/types'
import { taskLog } from '@clack/prompts'
import { Duration, Effect, Exit, Stream } from 'effect'

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
  /**
   * The cap on items in flight across *every* group at once. Groups themselves
   * all start together, so a per-group bound would multiply by the number of
   * groups — and each in-flight item may hold a whole file in memory.
   */
  subTaskConcurrency: number
}) => {
  return Effect.gen(function* () {
    const log = taskLog({
      title,
      retainLog: false,
    })

    const permits = yield* Effect.makeSemaphore(subTaskConcurrency)

    const processGroup = (group: TItemGroup) =>
      Effect.gen(function* () {
        const groupLog = log.group(message.resolveGroupTitle(group))

        const [duration] = yield* Effect.timed(
          Stream.fromIterable(group as Iterable<TItem>).pipe(
            Stream.mapEffect(
              (item) =>
                permits
                  .withPermits(1)(processItem(item))
                  .pipe(
                    Effect.tap(() =>
                      Effect.sync(() => groupLog.message(message.resolveItem(item)))
                    )
                  ),
              { concurrency: subTaskConcurrency }
            ),
            Stream.runDrain,
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                groupLog.error(message.resolveGroupError(group, error))
                return yield* Effect.fail(error)
              })
            ),
            // A sibling group failing interrupts this one: close it rather than
            // leave it rendering as still in progress.
            Effect.onInterrupt(() =>
              Effect.sync(() =>
                groupLog.error(`${message.resolveGroupTitle(group)}: interrupted`)
              )
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
    ).pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : Effect.sync(() => log.error(`${title}: failed`))
      )
    )

    log.success(message.resolveSuccess(duration))
  })
}
