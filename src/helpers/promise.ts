import { Effect } from 'effect'
import { UnknownException } from 'effect/Cause'

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
