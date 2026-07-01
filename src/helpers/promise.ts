import { Effect } from 'effect'
import { UnknownException } from 'effect/Cause'
import { YieldWrap } from 'effect/Utils'

type PromiseIntoEffectErrorConstructor<TError extends Error, TAdditionalData> = new (
  data: {
    message: string
    cause: UnknownException
  } & TAdditionalData
) => TError

export const toEffectSync = function <TData, TError extends Error, TAdditionalData>(
  fn: () => TData,
  errorClass: PromiseIntoEffectErrorConstructor<TError, TAdditionalData>,
  additionalData: TAdditionalData
): Effect.Effect<TData, TError> {
  return toEffect(
    new Promise<TData>((resolve) => {
      resolve(fn())
    }),
    errorClass,
    additionalData
  )
}

export const toEffect = function <TData, TError extends Error, TAdditionalData>(
  promise: Promise<TData>,
  errorClass: PromiseIntoEffectErrorConstructor<TError, TAdditionalData>,
  additionalData: TAdditionalData
): Effect.Effect<TData, TError> {
  return Effect.mapError(
    Effect.tryPromise(() => promise),
    (error) =>
      new errorClass({
        message: error.message,
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
