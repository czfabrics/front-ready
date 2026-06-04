import { Effect } from 'effect'

type PromiseIntoEffectErrorConstructor<
    TError extends Error,
    TErrorData extends { message: string },
> = new (data: TErrorData) => TError

export const promiseIntoEffect = function <
    TData,
    TError extends Error,
    TDefaultErrorData extends { message: string } = never,
>(
    promise: Promise<TData>,
    errorContext: {
        errorConstructor: PromiseIntoEffectErrorConstructor<TError, TDefaultErrorData>
        default: TDefaultErrorData
    }
): Effect.Effect<TData, TError> {
    return Effect.catchAllDefect<TData, never, never, TData, Error, never>(
        Effect.promise(() => promise),
        (defect) => {
            const isError = function (error: unknown): error is Error {
                return !!(error as Error)?.message
            }

            if (isError(defect)) {
                return Effect.fail(
                    new errorContext.errorConstructor({
                        ...errorContext.default,
                        message: defect.message,
                        cause: defect,
                    })
                )
            }

            return Effect.fail(new errorContext.errorConstructor(errorContext.default))
        }
    ) as Effect.Effect<TData, TError>
}
