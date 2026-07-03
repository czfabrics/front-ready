import { TUiWrapperError } from '#errors/interop/tui_wrapper'
import { toEffect } from '#helpers/effect'
import { Option, select } from '@clack/prompts'

export const genSelectUi = function <TValue>({
  message,
  options,
}: {
  message: string
  options: Option<TValue>[]
}) {
  return toEffect(
    select({
      message,
      options,
    }),
    TUiWrapperError,
    {
      uiFunction: 'select',
    }
  )
}
