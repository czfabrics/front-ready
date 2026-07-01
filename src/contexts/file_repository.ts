import { Context } from 'effect'

export class FileRepositoryContext extends Context.Tag('FileRepositoryContext')<
  FileRepositoryContext,
  { readonly cwd: string }
>() {}
