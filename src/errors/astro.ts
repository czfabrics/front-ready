import { Data } from 'effect'
import z, { ZodError as TrueZodError } from 'zod'

export class AstroConfigFormatError extends Data.TaggedError('AstroConfigFormatError')<{
  readonly cause: TrueZodError
}> {
  public override get message(): string {
    return z.prettifyError(this.cause)
  }
}
