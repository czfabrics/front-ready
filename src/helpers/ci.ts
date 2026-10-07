const FALSY_CI_VALUES = new Set(['', '0', 'false'])

/**
 * Whether the process runs in a CI pipeline. Every major provider (GitHub
 * Actions, GitLab CI, CircleCI, Travis, Buildkite…) sets `CI`; an explicit
 * `CI=false` or `CI=0` opts back out, as most tooling allows.
 */
export const isCiEnvironment = function (env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env['CI']

  return value !== undefined && !FALSY_CI_VALUES.has(value.trim().toLowerCase())
}
