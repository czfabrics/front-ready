import z from 'zod'

const NUMERIC = new Set([
  'max-age',
  's-maxage',
  'stale-while-revalidate',
  'stale-if-error',
])

const FLAGS = new Set([
  'no-cache',
  'no-store',
  'no-transform',
  'must-revalidate',
  'proxy-revalidate',
  'must-understand',
  'private',
  'public',
  'immutable',
])

/** `no-store` forbids storing at all, so any lifetime alongside it is a mistake. */
const MEANINGLESS_WITH_NO_STORE = [
  'max-age',
  's-maxage',
  'stale-while-revalidate',
  'stale-if-error',
  'immutable',
]

type Directive = { name: string; value: string | undefined }

const parseDirectives = function (header: string): Directive[] {
  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const i = part.indexOf('=')

      return i === -1
        ? { name: part.toLowerCase(), value: undefined }
        : {
            name: part.slice(0, i).trim().toLowerCase(),
            value: part
              .slice(i + 1)
              .trim()
              .replace(/^"(.*)"$/, '$1'),
          }
    })
}

/**
 * A `Cache-Control` value, validated directive by directive and normalised to
 * `name=value, name` — the header is sent exactly as written, so stray spacing
 * like `max-age= 60` would otherwise reach every cache verbatim.
 */
export const CacheControlSchema = z
  .string()
  .superRefine((header, ctx) => {
    const directives = parseDirectives(header)
    const seen = new Set<string>()

    for (const { name, value } of directives) {
      if (seen.has(name)) {
        ctx.addIssue({ code: 'custom', message: `Directive "${name}" is repeated` })
      }
      seen.add(name)

      if (NUMERIC.has(name)) {
        if (value === undefined || !/^\d+$/.test(value)) {
          ctx.addIssue({
            code: 'custom',
            message: `Directive "${name}" requires a non-negative integer`,
          })
        }
      } else if (FLAGS.has(name)) {
        if (value !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `Directive "${name}" does not take a value`,
          })
        }
      } else {
        ctx.addIssue({ code: 'custom', message: `Unknown directive "${name}"` })
      }
    }

    if (seen.has('no-store')) {
      for (const name of MEANINGLESS_WITH_NO_STORE.filter((name) => seen.has(name))) {
        ctx.addIssue({
          code: 'custom',
          message: `Directive "${name}" contradicts "no-store"`,
        })
      }
    }

    if (seen.has('public') && seen.has('private')) {
      ctx.addIssue({
        code: 'custom',
        message: '"public" and "private" contradict each other',
      })
    }

    if (seen.has('no-cache') && seen.has('immutable')) {
      ctx.addIssue({
        code: 'custom',
        message: '"no-cache" and "immutable" contradict each other',
      })
    }
  })
  .transform((header) =>
    parseDirectives(header)
      .map(({ name, value }) => (value === undefined ? name : `${name}=${value}`))
      .join(', ')
  )

const SHORT_CACHE = 'max-age=60, stale-while-revalidate=600, stale-if-error=86400'
const FOUR_HOURS_CACHE = 'max-age=14400, stale-while-revalidate=600, stale-if-error=86400'
const DAY_CACHE = 'max-age=86400, stale-while-revalidate=600, stale-if-error=86400'
// Only for a key whose name changes with its content.
const ONE_YEAR_CACHE =
  'max-age=31536000, immutable, stale-while-revalidate=600, stale-if-error=86400'

/** Written out rather than imported: `#config/schema` imports this module. */
type FrontType = 'angular' | 'astro' | 'custom'

/**
 * The built-in rules, picked by `front.type`. Each set is tried in order, first
 * match wins — so its catch-all must stay last, and every HTML page sits above
 * it: a multi-page build emits `about/index.html` and the like, which must never
 * be pinned for a year.
 */
export const DEFAULT_CACHE_CONTROL_MAPPINGS: Readonly<
  Record<FrontType, Readonly<Record<string, string>>>
> = {
  angular: {
    '^index\\.html$': SHORT_CACHE,
    '^assets/.+$': DAY_CACHE,
    '^translate/.+$': FOUR_HOURS_CACHE,
    '^.+\\.html$': SHORT_CACHE,
    // Everything left is a content-hashed chunk: its name changes with its content.
    '^.+$': ONE_YEAR_CACHE,
  },
  astro: {
    // Vite's `_astro/[name].[hash].*`, which Astro offers no way to unhash.
    '^_astro/.+$': ONE_YEAR_CACHE,
    // Pagefind (e.g. Starlight's search) names its index chunks by content hash.
    '^pagefind/.+\\.(pf_meta|pf_index|pf_fragment)$': ONE_YEAR_CACHE,
    '^.+\\.html$': SHORT_CACHE,
    // What is left comes from `public/`, copied under its own, unhashed name.
    '^.+$': DAY_CACHE,
  },
  // Nothing says how a custom build names its files, so nothing is pinned for long.
  custom: {
    '^.+\\.html$': SHORT_CACHE,
    '^.+$': DAY_CACHE,
  },
}

export const DEFAULT_CACHE_CONTROL_VALUE = SHORT_CACHE

export type CacheControlRule = {
  readonly pattern: string
  readonly regExp: RegExp
  readonly value: string
}

export const isValidRegExp = function (pattern: string): boolean {
  try {
    new RegExp(pattern)

    return true
  } catch {
    return false
  }
}

/**
 * Your rules come first, in your order; then the defaults, in theirs. Overriding a
 * default's value keeps it where it was — overriding `^.+$` must not move the
 * catch-all ahead of everything — and `null` removes a default outright. A
 * mapping used to replace the defaults wholesale, so adding one rule silently
 * dropped the catch-all and every hashed chunk lost its year-long cache.
 */
export const mergeCacheControlMapping = function (
  overrides: Readonly<Record<string, string | null>>,
  defaultMapping: Readonly<Record<string, string>>
): Array<[string, string]> {
  const added = Object.entries(overrides).filter(
    ([pattern]) => !Object.hasOwn(defaultMapping, pattern)
  )
  const defaults = Object.entries(defaultMapping).map(
    ([pattern, value]): [string, string | null] => [
      pattern,
      Object.hasOwn(overrides, pattern) ? overrides[pattern]! : value,
    ]
  )

  return [...added, ...defaults].filter(
    (rule): rule is [string, string] => rule[1] !== null
  )
}

/**
 * Validated at config load: an uncompilable pattern used to pass validation and
 * then throw mid-deploy, after part of the bucket had already been overwritten.
 * Merged and compiled by `resolveCacheControlRules`, once the config says whether
 * the defaults apply.
 */
export const CacheControlMappingSchema = z
  .record(
    z.string().refine(isValidRegExp, { message: 'Not a valid regular expression' }),
    CacheControlSchema.nullable()
  )
  .default({})

/**
 * Your rules merged with the defaults (see `mergeCacheControlMapping`), or — with
 * no defaults (`useDefaultCacheControl: false`) — your rules alone, in your
 * order, a `null` one dropped.
 */
export const resolveCacheControlRules = function (
  overrides: Readonly<Record<string, string | null>>,
  defaultMapping: Readonly<Record<string, string>> | undefined
): CacheControlRule[] {
  const rules = defaultMapping
    ? mergeCacheControlMapping(overrides, defaultMapping)
    : Object.entries(overrides).filter(
        (rule): rule is [string, string] => rule[1] !== null
      )

  return rules.map(([pattern, value]) => ({
    pattern,
    regExp: new RegExp(pattern),
    value,
  }))
}
