import { Context } from 'effect'

export const FileRepositoryContext = Context.GenericTag<{
  readonly cwd: string
}>('FileRepositoryContext')
