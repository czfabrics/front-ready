import { Data } from 'effect'
import z, { ZodError as TrueZodError } from 'zod'

export class AstroConfigFormatError extends Data.TaggedError('AstroConfigFormatError')<{
  readonly cause: TrueZodError
}> {
  public override get message(): string {
    return z.prettifyError(this.cause)
  }
}

export class AstroConfigNotFoundError extends Data.TaggedError(
  'AstroConfigNotFoundError'
)<{
  readonly searchedPaths: ReadonlyArray<string>
}> {
  public override get message(): string {
    return `No Astro config file found, looked for: ${this.searchedPaths.join(', ')}`
  }
}
