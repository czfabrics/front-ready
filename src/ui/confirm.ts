import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { toEffect } from '#helpers/effect'
import { interruptOnPromptCancel } from '#ui/prompt'
import { confirm } from '@clack/prompts'

export const genConfirmUi = function ({
  question,
  initialValue,
}: {
  question: string
  initialValue: boolean
}) {
  return interruptOnPromptCancel(
    toEffect(
      confirm({
        message: question,
        initialValue,
      }),
      TUiWrapperError,
      {
        uiFunction: 'confirm',
      }
    )
  )
}
