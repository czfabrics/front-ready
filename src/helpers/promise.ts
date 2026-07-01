import { Effect } from 'effect'
import { UnknownException } from 'effect/Cause'
import { YieldWrap } from 'effect/Utils'

type PromiseIntoEffectErrorConstructor<TError extends Error> = new (data: {
  message: string
  cause: UnknownException
}) => TError

export const toEffect = function <TData, TError extends Error>(
  promise: Promise<TData>,
  errorClass: PromiseIntoEffectErrorConstructor<TError>
): Effect.Effect<TData, TError> {
  return Effect.mapError(
    Effect.tryPromise(() => promise),
    (error) =>
      new errorClass({
        message: error.message,
        cause: error,
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
