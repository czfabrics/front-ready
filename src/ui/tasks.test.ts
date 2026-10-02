import { IteratorImpl } from '#core/types'
import { genTaskLogsUi } from '#ui/tasks'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@clack/prompts', () => {
  const group = { message: () => {}, error: () => {}, success: () => {} }

  return {
    taskLog: () => ({ group: () => group, error: () => {}, success: () => {} }),
  }
})

class Group implements IteratorImpl<number> {
  constructor(readonly items: number[]) {}

  get length() {
    return this.items.length
  }

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]()
  }
}

const MESSAGE = {
  resolveItem: () => '',
  resolveGroupTitle: () => '',
  resolveGroupSuccess: () => '',
  resolveGroupError: () => '',
  resolveSuccess: () => '',
}

describe('genTaskLogsUi', () => {
  // The bound used to apply per group while every group started at once, so six
  // folders at a concurrency of 50 meant 300 uploads — and 300 files in memory.
  it('caps items in flight across all groups, not per group', async () => {
    let inFlight = 0
    let peak = 0

    const groups = Array.from(
      { length: 6 },
      (_, g) => new Group(Array.from({ length: 10 }, (_, i) => g * 10 + i))
    )

    await Effect.runPromise(
      genTaskLogsUi({
        title: 'Uploading',
        itemGroups: groups,
        processItem: () =>
          Effect.gen(function* () {
            inFlight++
            peak = Math.max(peak, inFlight)
            yield* Effect.sleep('5 millis')
            inFlight--
          }),
        message: MESSAGE,
        subTaskConcurrency: 4,
      })
    )

    expect(peak).toBe(4)
  })

  it('still processes every item of every group', async () => {
    const processed: number[] = []

    await Effect.runPromise(
      genTaskLogsUi({
        title: 'Uploading',
        itemGroups: [new Group([1, 2, 3]), new Group([4]), new Group([5, 6])],
        processItem: (item: number) => Effect.sync(() => processed.push(item)),
        message: MESSAGE,
        subTaskConcurrency: 2,
      })
    )

    expect(processed.sort()).toStrictEqual([1, 2, 3, 4, 5, 6])
  })
})
