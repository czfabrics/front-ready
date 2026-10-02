import { Effect } from 'effect'
import { UnknownException } from 'effect/Cause'
import { YieldWrap } from 'effect/Utils'

type PromiseIntoEffectErrorConstructor<TError extends Error, TAdditionalData> = new (
  data: {
    message: string
    cause: UnknownException
  } & TAdditionalData
) => TError

/**
 * `Effect.tryPromise` wraps the rejection in an `UnknownException` whose own
 * `message` is the generic "An unknown error occurred in Effect.tryPromise". The
 * reason the third party actually gave us lives on `.error`, so read it from
 * there — otherwise every interop error renders as that same useless sentence.
 */
const resolveThrownMessage = function (error: UnknownException): string {
  const thrown = error.error

  if (thrown instanceof Error && thrown.message) return thrown.message
  if (typeof thrown === 'string' && thrown) return thrown

  return error.message
}

export const toEffectSync = function <TData, TError extends Error, TAdditionalData>(
  fn: () => TData,
  errorClass: PromiseIntoEffectErrorConstructor<TError, TAdditionalData>,
  additionalData: TAdditionalData
): Effect.Effect<TData, TError> {
  return Effect.try({
    try: fn,
    catch: (thrown) => {
      const error = new UnknownException(thrown)

      return new errorClass({
        message: resolveThrownMessage(error),
        cause: error,
        ...additionalData,
      })
    },
  })
}

/**
 * Takes a function rather than a promise, so the work starts when the effect
 * runs — not when it is built. A promise passed in directly is already in
 * flight: retrying the effect would only replay its settled result, building it
 * on a branch that never runs would leave an unhandled rejection, and nothing
 * could stop it. The `signal` aborts on interruption; hand it to any API that
 * takes one.
 */
export const toEffect = function <TData, TError extends Error, TAdditionalData>(
  evaluate: (signal: AbortSignal) => PromiseLike<TData>,
  errorClass: PromiseIntoEffectErrorConstructor<TError, TAdditionalData>,
  additionalData: TAdditionalData
): Effect.Effect<TData, TError> {
  return Effect.mapError(
    Effect.tryPromise((signal) => Promise.resolve(evaluate(signal))),
    (error) =>
      new errorClass({
        message: resolveThrownMessage(error),
        cause: error,
        ...additionalData,
      })
  )
}

export const genPromise = function <TData, TResult, TError>(
  callback: (
    data: TData
  ) => Generator<YieldWrap<Effect.Effect<any, TError, never>>, TResult>
): (data: TData) => Promise<TResult> {
  return (data: TData) => {
    return Effect.runPromise<TResult, TError>(
      Effect.gen(function* () {
        return yield* callback(data)
      })
    )
  }
}

export const genFn = function <
  TArgs extends readonly unknown[],
  Eff extends YieldWrap<Effect.Effect<any, any, any>>,
  AEff,
>(
  callback: (...args: TArgs) => Generator<Eff, AEff, never>
): (
  ...args: TArgs
) => Effect.Effect<
  AEff,
  [Eff] extends [never]
    ? never
    : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>]
      ? E
      : never,
  [Eff] extends [never]
    ? never
    : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>]
      ? R
      : never
> {
  return (...args: TArgs) => {
    return Effect.gen(() => callback(...args))
  }
}
