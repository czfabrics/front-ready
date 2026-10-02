import { Data } from 'effect'
import { UnknownException } from 'effect/Cause'
import z, { ZodError as TrueZodError } from 'zod'

export class AngularJsonFormatError extends Data.TaggedError('AngularJsonFormatError')<{
  readonly cause: TrueZodError
}> {
  public override get message(): string {
    return z.prettifyError(this.cause)
  }
}

export class AngularJsonMissingDataError extends Data.TaggedError(
  'AngularJsonMissingDataError'
)<{
  readonly subject: string
  readonly projectName: string
}> {
  public override get message(): string {
    return `Unable to resolve '${this.subject}' for '${this.projectName}'`
  }
}

export class AngularJsonSyntaxError extends Data.TaggedError('AngularJsonSyntaxError')<{
  readonly message: string
  readonly angularJsonPath: string
  readonly cause: UnknownException
}> {}
