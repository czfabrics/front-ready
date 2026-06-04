import { Data } from 'effect'
import z, { ZodError as TrueZodError } from 'zod'

export class ZodError extends Data.TaggedError('ZodError')<{
    readonly cause: TrueZodError
}> {
    public override get message(): string {
        return z.prettifyError(this.cause)
    }
}
