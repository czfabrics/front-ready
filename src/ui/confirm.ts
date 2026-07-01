import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { toEffect } from '#helpers/promise'
import { confirm } from '@clack/prompts'
import { Effect } from 'effect'

export const genConfirmUi = function ({
  question,
  initialValue,
}: {
  question: string
  initialValue: boolean
}) {
  return Effect.gen(function* () {
    return yield* toEffect(
      confirm({
        message: question,
        initialValue,
      }),
      TUiWrapperError,
      {
        uiFunction: 'confirm',
      }
    )
  })
}
