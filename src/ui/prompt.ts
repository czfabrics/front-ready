import { isCancel } from '@clack/prompts'
import { Effect } from 'effect'

/**
 * Clack does not reject a cancelled prompt — Escape and Ctrl-C *resolve* it with a
 * cancel symbol. Left in the value, that symbol is truthy (so `if (!confirmed)`
 * lets a cancelled confirmation through) and stringifies to `Symbol(clack:cancel)`.
 * Mapping it to `Effect.interrupt` here keeps it out of every caller and follows
 * the "the user said no" convention the command wrappers already render.
 */
export const interruptOnPromptCancel = function <TValue, TError, TDeps>(
  prompt: Effect.Effect<TValue | symbol, TError, TDeps>
): Effect.Effect<Exclude<TValue, symbol>, TError, TDeps> {
  return Effect.flatMap(prompt, (value) =>
    isCancel(value) ? Effect.interrupt : Effect.succeed(value as Exclude<TValue, symbol>)
  )
}
