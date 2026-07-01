import { Data } from 'effect'
import z, { ZodError as TrueZodError } from 'zod'

export class ConfigFormatError extends Data.TaggedError('ConfigFormatError')<{
  readonly cause: TrueZodError
}> {
  public override get message(): string {
    return z.prettifyError(this.cause)
  }
}
