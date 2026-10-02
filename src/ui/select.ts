import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { toEffect } from '#helpers/effect'
import { interruptOnPromptCancel } from '#ui/prompt'
import { Option, select } from '@clack/prompts'

export const genSelectUi = function <TValue>({
  message,
  options,
}: {
  message: string
  options: Option<TValue>[]
}) {
  return interruptOnPromptCancel(
    toEffect(
      () =>
        select({
          message,
          options,
        }),
      TUiWrapperError,
      {
        uiFunction: 'select',
      }
    )
  )
}
