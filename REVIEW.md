# Code review — `@czfabrics/front-ready`

Review of the full library, with extra depth on the bucket upload path and cache-control
handling. Branch `feat/astro-handling` @ `869fd81`.

**Baseline health:** `bun run typecheck` clean · `bunx vitest run` → 41 passed (3 files) ·
coverage limited to `src/helpers/{angular,astro,effect}.test.ts`.

Every finding below was traced in the source. Items marked **(reproduced)** were additionally
confirmed by executing the code; `F-1` is the only item resting on documented AWS semantics
rather than an observed run.

Items marked **✅ FIXED** are resolved, each with regression tests that fail against the previous
code, and each names the commit that fixed it. Where a fix deviates from what this review first
suggested, its note says so. Test count went **41 → 159** across **3 → 16** files; `bun run typecheck`,
`bunx vitest run`, `prettier --list-different .` and `bun run build` all pass, and the bundled
`.dist/main.mjs` was smoke-tested both piped and under a pty.

---

## Severity summary

| Severity  | Count  | Status                                              |
| --------- | ------ | --------------------------------------------------- |
| Critical  | 4      | all fixed                                           |
| High      | 12     | all fixed                                           |
| Medium    | 20     | all fixed                                           |
| Low       | 16     | all fixed (including `K-4`)                         |
| Gaps      | 3      | `K-1`–`K-3`: out of scope (feature work), not fixed |
| **Fixed** | **52** | every finding except the three `K` feature gaps     |

**Fix these four first** — each is a few lines, and each is independent:

1. ~~`B-1` — pressing Escape at the deploy confirmation **starts the deploy**.~~ **✅ FIXED**
2. ~~`A-1` — every post-config failure exits `0`.~~ **✅ FIXED**
3. ~~`C-1` — `check` hangs forever on a real terminal.~~ **✅ FIXED**
4. ~~`D-1` — the wrong `index.html` is deferred.~~ **✅ FIXED**

---

## A. Failure reporting & exit codes

### A-1 · Critical · ✅ FIXED · Every post-config failure exits `0` (reproduced)

> **✅ Resolved in `31b8b29`.** One `runCliCommand` now owns the lifecycle of all three commands: failure exits `1`, cancellation `130`, success `0`. Verified end to end through `main.ts`; pinned by `src/cli/command_runner.test.ts`.

`src/cli/deploy_on_bucket_command.ts:38-44` — identical in `check_command.ts:38-44` and
`create_front_bucket_command.ts:38-44`.

`Effect.catchAll` logs the error and returns `void`, producing an `Effect<void, never>`.
`NodeRuntime.runMain`'s teardown only calls `process.exit(code)` when `code !== 0`, so the
process ends successfully.

```
logged: upload failed
EXIT CODE (catchAll pattern) = 0
```

This covers _every_ failure after config load: a non-zero build exit, an S3 `PutObject` 403, a
missing `index.html`, a malformed `angular.json`. A CI pipeline running `front-ready deploy` goes
green on a build that never built and an upload that never uploaded.

**Fix:** re-fail after formatting, or set `process.exitCode = 1` in the handler. Keep `0` only for
a genuine user cancel.

### A-2 · Medium · ✅ FIXED · Hard errors are modelled as user cancellation (reproduced)

> **✅ Resolved in `31b8b29`.** `deploy` fails with a `BucketNotFoundError` / `FrontError` instead of `Effect.interrupt`. `create` on an existing bucket is an idempotent **success** (exit `0`) rather than a cancellation, so re-running it in CI stays green.

`src/use_cases/deploy_on_bucket.ts:32-37` and `:54-59` use `Effect.interrupt` for "bucket should
exist" and "no files to upload". The command wrapper renders that as `cancel(...)`, and the
interrupt path also exits `0`:

```
EXIT CODE (interrupt pattern) = 0
```

So a genuine misconfiguration is presented to the user, and to CI, as though they pressed Ctrl-C.

**Fix:** reserve `Effect.interrupt` for actual cancellation; make these typed failures.

### A-3 · High · ✅ FIXED · One failed upload dumps the whole file to the terminal (reproduced)

> **✅ Resolved in `3b005e2`.** `FileObjectError` holds a `FileObjectDescription` (the object minus its bytes) and a `commandName` instead of the `$Command`. Measured: **4,395,197 → 272 characters**. `runCliCommand` renders tag + message + one line per context field instead of `toStringUnknown`.

`src/cli/deploy_on_bucket_command.ts:41` calls `Inspectable.toStringUnknown(error)` on a
`FileObjectError`, which carries `file: Partial<FileObject>` (the full `content: Uint8Array`) _and_
`command` (whose `input.Body` is the same buffer) — see `src/errors/file_object.ts:7-13`.

Measured with a 200 KB bundle:

```
error.message      -> Access Denied
dumped chars       -> 4,395,197
```

A 1 MB chunk would print roughly 22 MB. In CI that lands in the build log.

**Fix:** drop `content` / `Body` from the error context — keep `key`, `contentType`,
`cacheControlValue` — and render a curated summary instead of `toStringUnknown`.

### A-4 · Medium · ✅ FIXED · Config-load failure bypasses the error UI entirely (reproduced)

> **✅ Resolved in `31b8b29`.** Config loading sits inside the shared error handling. A missing config now renders as `ConfigWrapperError: …` + outro, exit `1`.

`src/cli/*_command.ts:21-26` — `startCli()` runs in the _outer_ `Effect.gen`, while the
`onInterrupt` / `catchAll` pipe wraps only the _inner_ one.

```
┌  @czfabrics/front-ready@0.1.0-beta.4 - check
[ERROR] ConfigWrapperError: Required config (frontready.config) cannot be resolved.
    at <anonymous> (.../src/helpers/effect.ts:49:7)
    … 10 frames of effect internals …
EXIT=1
```

No `log.error`, no `outro`, a raw fiber stack — and ironically this is the only failure that
reports a correct exit code. An invalid config is the same: the nicely-rendered `z.prettifyError`
message is buried in the dump.

**Fix:** move the pipe so it wraps the outer gen, and fix `A-1` so the codes agree.

### A-5 · Medium · ✅ FIXED · `check` cannot be used as a CI gate

> **✅ Resolved in `31b8b29`.** `check` still reports every check, then fails with `BucketNotFoundError` when the bucket is missing. Exit codes are documented in `.docs/4-usage.md`.

`src/use_cases/check.ts:18` logs a warning when the bucket is missing and still exits `0`
(`A-1`). There is no way to use `check` to fail a pipeline.

**Fix:** exit non-zero when a hard precondition fails, or add a `--strict` flag.

---

## B. Prompt cancellation

### B-1 · Critical · ✅ FIXED · Pressing Escape at the deploy confirmation starts the deploy

> **✅ Resolved in `a551fc5`.** New `interruptOnPromptCancel` maps clack's `isCancel` to `Effect.interrupt`; `genConfirmUi` returns `Effect<boolean, …>` with no `symbol`. Pinned by `src/ui/prompt.test.ts`.

`src/ui/confirm.ts:12-21` → `src/use_cases/deploy_on_bucket.ts:23-30`; same shape at
`src/use_cases/create_front_bucket.ts:25-32`.

`@clack/prompts`' `confirm` is declared `(opts) => Promise<boolean | symbol>`
(`node_modules/@clack/prompts/dist/index.d.mts:323`): cancellation **resolves** with
`CANCEL_SYMBOL`, it does not reject. `@clack/core` maps Escape to cancel. `genConfirmUi` passes the
value straight through, and `isCancel` appears nowhere in `src/`:

```ts
const shouldContinue = yield* genConfirmUi({ ... })   // boolean | symbol
if (!shouldContinue) { return yield* Effect.interrupt }
```

`!Symbol(clack:cancel)` is `false`, so the guard is skipped and the build + upload to the
production bucket proceeds. `initialValue: false` makes it worse: the user who deliberately backed
out is the one who gets the deploy. TypeScript does not catch it — `!symbol` is legal.

Ctrl-C survives only by accident, because `runAndInterruptOnCtrlC`'s own keypress listener races
it. Escape has no such backstop.

**Fix:** handle cancellation inside the UI wrapper so the symbol can never reach a use case —
`Effect.flatMap(v => isCancel(v) ? Effect.interrupt : Effect.succeed(v))`. The return type then
becomes `Effect<boolean, …>`.

### B-2 · High · ✅ FIXED · Cancelling the Angular picker yields the literal string `"Symbol(clack:cancel)"`

> **✅ Resolved in `a551fc5`.** Same wrapper for `genSelectUi`; the `.toString()` is gone.

`src/ui/select.ts:12` + `src/factories/front_deployment_context.ts:31-36`:

```ts
const configurationName = yield* genSelectUi({ ... })   // string | symbol
config.angular.configurationName = configurationName.toString()
```

`.toString()` launders the cancel symbol into a string, producing
`ng build <proj> --configuration Symbol(clack:cancel)` and a bucket named
`prefix-Symbol(clack:cancel)`. Note this prompt runs during **layer construction**, outside
`runAndInterruptOnCtrlC`, so the Ctrl-C race does not cover it either.

**Fix:** same as `B-1`.

### B-3 · Low · ✅ FIXED · The picker mutates the validated config in place

> **✅ Resolved in `a551fc5`.** The picked name is resolved into a local and used for the build command and the bucket name; the parsed config is never written to.

Same line. `InternalConfigContext` and the deployment context then disagree about what was
validated.

**Fix:** return the resolved name rather than assigning back into the parsed config.

---

## C. Process lifecycle & resource safety

### C-1 · Critical · ✅ FIXED · `check` hangs forever on a real terminal (reproduced)

> **✅ Resolved in `7d734fb`.** The finalizer pauses stdin and restores the previous raw-mode value. Under a pty, `check` went from exit `124` (killed) to returning immediately — also verified on the bundled `.dist/main.mjs`.

`src/helpers/runtime.ts:4-21`. `readline.emitKeypressEvents(process.stdin)` installs a permanent
internal `'data'` listener that resumes stdin. The finalizer removes the `'keypress'` listener and
clears raw mode, but never pauses or unrefs the stream, so the event loop never drains — and since
`runMain` skips `process.exit` on code `0` (`A-1`), nothing else ends the process.

Under a pty:

```
└  Check finished
EXIT=124 (124 = hung/timed out)
```

`deploy` and `create` are saved only by accident — clack's `readline.Interface.close()` pauses
stdin — but `check` runs no prompt and no spinner. Piped/non-TTY runs exit fine because stdin is
`/dev/null` and ends, which is why CI would not surface this, but every human invocation hangs.

**Fix:** `process.stdin.pause()` (and/or `.unref()`) in the `Effect.async` finalizer, and restore
the _previous_ raw-mode value rather than unconditionally `false`.

### C-2 · High · ✅ FIXED · `toEffect` captures an already-started promise

> **✅ Resolved in `9faa14d`.** `toEffect` takes `(signal) => PromiseLike`; every S3 `send` gets `{ abortSignal: signal }`. Tests pin laziness, a retry re-running the work, and interruption aborting the signal.

`src/helpers/effect.ts:41-55` takes `promise: Promise<T>`, so the side effect fires at
_construction_, not when the effect runs — `Effect.tryPromise(() => promise)` merely re-observes a
promise already in flight. Consequences:

- `Effect.retry` / `repeat` on anything built this way silently replays a settled promise.
- No `AbortSignal` reaches `apiInstance.send`, so Ctrl-C mid-upload leaves S3 requests running.
- A `toEffect` value constructed on a branch that never runs becomes an unhandled rejection rather
  than a typed failure.

`main.ts:8` has the same shape at module scope: `run(cli, …)` is invoked before `runMain` observes
it.

**Fix:** take a thunk and use the signal form —
`Effect.tryPromise({ try: (signal) => fn(signal), catch })` — threading `abortSignal` into the AWS
commands.

### C-3 · High · ✅ FIXED · The `S3Client` is never destroyed

> **✅ Resolved in `140e241`.** `FileObjectApiInstanceLive` is `Layer.scoped` with `acquireRelease(…, client.destroy())`.

`src/file_object/api_instance.ts:10-26` is a `Layer.effect`, so there is no finalizer and
`client.destroy()` is never called. Sockets and the SDK keep-alive agent survive until process
exit — which, per `C-1`, may be never.

**Fix:** `Layer.scoped(FileObjectApiInstance, Effect.acquireRelease(make, c => Effect.sync(() => c.destroy())))`.
The other `Layer.effect`s in `src/front/service.ts:18,26` hold no resources and are fine.

### C-4 · Medium · ✅ FIXED · Spinner and task log have no interrupt-safe cleanup

> **✅ Resolved in `b14f0e1`.** `genLoaderUi` cancels the spinner on interrupt (once — guarded against the `process.exit` path); `genTaskLogsUi` closes interrupted groups and the outer log on failure.

`src/ui/loader.ts:19-49` stops the spinner on success and on failure but has no
`Effect.ensuring` / `onInterrupt`; clack's spinner holds a non-`unref`'d `setInterval`, a hidden
cursor, raw-mode `block()`, and process-level signal listeners. `src/ui/tasks.ts:28-69` has the same
shape — when one group fails the siblings are interrupted and neither `groupLog.success/error` nor
`log.success` ever runs.

Papered over today by clack's own signal handlers plus `interceptProcessExit`. Any interruption
that is neither a signal nor a `process.exit` — a future `Effect.timeout`, a sibling failing in a
race — leaves a spinning terminal with a hidden cursor.

**Fix:** wrap both in `Effect.acquireRelease` / `Effect.ensuring`.

### C-5 · Low · ✅ FIXED · `interceptProcessExit` neutralises legitimate exits

> **✅ Resolved in `4c5ff7e`.** An intercepted `process.exit` now **interrupts** the wrapped work instead of being swallowed, so nothing runs on in a state its caller believed was over. A non-zero code asked for is kept as the exit code. The LIFO caveat is documented on the function.

`src/helpers/runtime.ts:29-40` replaces the global `process.exit` for the whole loader. Clack's
`block()` calls `process.exit(0)` on Ctrl-C; after interception the handler returns and never
re-registers its `once('keypress')` guard, so further keystrokes echo into the build output. The
save/restore is also only safe LIFO — not currently reachable, since all loaders are sequential.

The acquire/release itself **is** correct: `Effect.acquireRelease` under `Effect.scoped` restores
`process.exit` on failure _and_ on interrupt.

### C-6 · Low · ✅ FIXED · `toEffectSync` is not sync

> **✅ Resolved in `9faa14d`.** `toEffectSync` is `Effect.try`, runnable with `runSync`. _Deviation:_ a throw still maps to the tagged error rather than becoming a defect — that is the documented `toEffectSync` contract the callers' error types rely on.

`src/helpers/effect.ts:12-24` routes a synchronous function through `new Promise` purely to reuse
`toEffect`. That forces a fiber suspension per call — once per file for `FileItem.contentType` —
and converts what should be a **defect** (a throw from `mrmime`) into a typed failure.

**Fix:** `Effect.try({ try, catch })` is the direct equivalent.

### C-7 · Low · ✅ FIXED · `main.ts:8` runs the CLI eagerly at module scope

> **✅ Resolved in `9faa14d`.** Fixed with `C-2`: `main.ts` passes `() => run(cli, …)`.

Covered by `C-2`; listed separately because the fix is local.

---

## D. Deploy pipeline correctness

### D-1 · High · ✅ FIXED · The wrong `index.html` is deferred, defeating the ordering invariant (reproduced)

`src/helpers/file.ts:95-111` (`extractFile` matches with `relativePath.endsWith(pathSuffix)`), used
by `pickIndexDocument` at `:135-141`. `walkFiles` iterates `HashMap.values` — hash order, not path
order — so on any multi-page build the match is effectively arbitrary.

Against a realistic Astro tree:

```
picked index document -> docs/index.html
uploaded in first batch -> _astro/a.123.js, _astro/b.456.css, about/index.html,
                           blog/post-1/index.html, index.html
```

The root `index.html` goes up _concurrently with_ the `_astro` chunks it references — exactly the
race the design note in `deploy_on_bucket_command.ts:14` promises to avoid. Which document is
protected can change between runs.

**Fix:** match the root document exactly (`relativePath === suffix`), and consider deferring every
`*.html` to the second phase rather than just one.

**✅ Resolved.** `extractFile` → `extractFileByRelativePath` in `src/helpers/file.ts:95-117`, matching
`file.relativePath === relativePath` instead of `.endsWith(pathSuffix)`; the misleading regex-ish
`` `${pathSuffix}$` `` in the `FileNotFoundError` payload is gone. The helper had exactly one caller.
Regression tests in the new `src/helpers/file.test.ts` assert the root document is the one deferred
against a realistic Astro tree, that the nested documents and chunks all stay in the first batch
(exact `toStrictEqual`), that the result is stable when the input order is reversed, and that a build
with no root index fails with `FileNotFoundError` naming `index.html`.

_Deliberate behaviour change:_ a build with no **root-level** index document now fails instead of
silently deferring a nested one. `deploy_on_bucket.ts:61-71` catches it and renders
`'index.html' file should exist in the front build folder` — accurate, though strictly it must exist
_at the root of_ the build folder. That string was left alone.

_Side benefit:_ an exact match also sidesteps `D-4` for the root document, since a root-level
`relativePath` carries no separator on any platform.

### D-2 · High · ✅ FIXED · Angular's `outputPath` is never resolved against the workspace root

> **✅ Resolved in `9b62ad1`.** Fixed in the factory rather than in `resolveAngularConfiguration`, which keeps returning the path as `angular.json` writes it (workspace-relative — what its 20 existing tests pin). The factory resolves it against `dirname(angularJsonPath)`; relative stays relative when the workspace is the cwd, absolute is kept. Pinned by `src/factories/front_deployment_context.test.ts`.

`src/helpers/angular.ts:190` returns `outputPath` verbatim; `front_deployment_context.ts:59` feeds
it to `buildOutputPath`, which becomes `FileRepositoryContext.cwd` (`src/front/service.ts:22`) and
is resolved against `process.cwd()`. Angular resolves `outputPath` against the directory containing
`angular.json`.

With `angularJsonPath: './apps/web/angular.json'` and `outputPath: "dist/app"`, the correct path is
`apps/web/dist/app/browser`, but the tool reads `./dist/app/browser` → ENOENT → and per `A-1`,
**exit 0 having uploaded nothing**.

This is the bug `869fd81` fixed for Astro via `resolveAgainstRoot`; the Angular path was left
asymmetric.

**Fix:** `path.resolve(path.dirname(angularJsonPath), outputPath)`.

### D-3 · Medium · ✅ FIXED · Astro's `path.join` corrupts an absolute `outDir` (reproduced)

`src/helpers/astro.ts:49` and `:83`. With `{ root: './apps/site', outDir: '/var/tmp/build-out' }`:

```
-> { "outputPath": "apps/site/var/tmp/build-out" }
```

Astro would use `/var/tmp/build-out`. `path.join` ignores absoluteness; `path.resolve` does not —
and `resolve` also handles the `root === undefined` branch cleanly, so the special case disappears.

**✅ Resolved** — but _not_ by switching to `path.resolve`. That would have made every result
absolute, changing behaviour far beyond this bug and breaking the relative-path assertions already in
`astro.test.ts`. Instead `resolveAgainstRoot` (`src/helpers/astro.ts:39-65`) now short-circuits on
`path.isAbsolute(outDir)`, and a sibling `resolveAgainstOutDir` applies the same escape hatch to
`build.client`, replacing the inline `path.join` at the old line 83. Both doc comments spell out why
the relative case must stay relative, so nobody "fixes" it to `resolve` later. Four tests added to
`src/helpers/astro.test.ts`: absolute `outDir` with an explicit `root`; absolute `build.client` with
`output: 'server'`; absolute `build.client` under an absolute `outDir`; and relative `build.client`
under an absolute `outDir`, guarding that normal nesting still happens.

### D-4 · Medium · ✅ FIXED · Windows produces broken object keys

> **✅ Resolved in `eb22049`.** `toObjectKey` normalises `\` to `/` for the uploaded key, and `upload.exclude` matches the same normalised key.

`@effect/platform-node-shared`'s `readDirectory` is a direct
`fs.promises.readdir(path, { recursive: true })`, which returns `assets\logo.svg` on Windows.
`fileIntoObject` (`src/helpers/file.ts:9-21`) uses `relativePath` verbatim as the S3 key, so keys
contain backslashes and `^assets/.+$` never matches. `extractFirstFolderFromPath` already
normalises separators — `fileIntoObject` does not.

**Fix:** normalise to `/` when building the key.

### D-5 · Medium · ✅ FIXED · The build command is spawned in `process.cwd()`

> **✅ Resolved in `9b62ad1`.** `ng build` runs with `Command.workingDirectory(dirname(angularJsonPath))`.

`src/factories/front_deployment_context.ts:46-54` builds `Command.make('ng', 'build', …)` with no
`Command.workingDirectory`. A non-root `angularJsonPath` (see `D-2`) therefore also runs `ng build`
in the wrong directory.

---

## E. Cache control & object metadata

> This is the area flagged for extra attention. `E-1`, `E-2` and `E-3` are the ones that will bite
> real users.

### E-1 · High · ✅ FIXED · A custom `cacheControlMapping` discards every default (reproduced)

> **✅ Resolved in `eb22049`.** The mapping **merges**: new patterns are tried before the defaults in the order written, overriding a default keeps it in place (so overriding `^.+$` keeps it last), `null` removes a default. A mapping copied from the docs still behaves exactly as before.

Zod `.default()` replaces, it does not merge:

```
3) resulting mapping keys: [ '^index.html$' ]
```

A user who tunes only `^index.html$` loses the `^.+$` catch-all, so every hashed chunk silently
drops from a 1-year cache to the 60 s `defaultCacheControlValue`. `.docs/4-usage.md:157` tells
users to "override `cacheControlMapping`" without warning that it is all-or-nothing.

**Fix:** merge over the defaults, or document the replacement semantics prominently.

### E-2 · High · ✅ FIXED · Nested HTML pages get a one-year cache by default (reproduced)

```
index.html               -> max-age=60, ...
about/index.html         -> max-age=31536000, ...
blog/post/index.html     -> max-age=31536000, ...
_astro/x.abc123.js       -> max-age=31536000, ...
assets/logo.svg          -> max-age=86400, ...
favicon.ico              -> max-age=31536000, ...
```

Only the root index escapes the `^.+$` catch-all. Now that Astro is supported — where multi-page
output is the norm — the shipped defaults pin every non-root page for a year.

**Fix:** insert `'^.+\\.html$'` ahead of the catch-all.

**✅ Resolved.** `'^.+\\.html$': 'max-age=60, stale-while-revalidate=600, stale-if-error=86400'`
inserted immediately before the `'^.+$'` catch-all in `src/config/schema.ts:96`, mirrored into the
example in `.docs/4-usage.md` with a new paragraph explaining first-match-wins ordering, and
`README.md` regenerated via `bun run generate:readme`. Tests in `src/helpers/file.test.ts` drive
`detectAndFillCacheControl` with `ConfigSchema`'s parsed defaults and assert the new key is accepted
by the `templateLiteral` record schema (rather than taking that on trust), that `index.html`,
`about/index.html` and `blog/post/index.html` all get the short cache, and that `_astro/x.abc123.js`
keeps its one-year value.

_Open judgement call:_ `'^assets/.+$'` still precedes the new rule, so `assets/foo.html` gets
`max-age=86400` rather than 60. Existing first-match-wins precedence was preserved deliberately. If
no HTML page should ever outlive 60 s, the rule needs hoisting above `^assets/.+$` and
`^translate/.+$`.

### E-3 · High · ✅ FIXED · An invalid regex key passes validation and crashes mid-deploy (reproduced)

> **✅ Resolved in `eb22049`.** Keys are validated as compilable regexes and compiled once at config load (`src/config/cache_control.ts`).

The key schema only enforces the `^…$` _shape_, never that the pattern compiles:

```
1) invalid-regex key accepted by zod: true
   -> THROWS at upload time: SyntaxError: Invalid regular expression: /^[a$/
```

That is a raw defect — not a tagged error — thrown from `detectAndFillCacheControl`
(`src/helpers/file.ts:29`), _after_ part of the bucket has already been overwritten.

**Fix:** `superRefine` with `new RegExp` in a try/catch at config load, and have `check` validate
the patterns before anything is uploaded.

### E-4 · High · ✅ FIXED · `ContentEncoding: 'binary'` on every object

> **✅ Resolved in `3b005e2`.** Removed. Pinned by `src/file_object/repository.test.ts`.

`src/file_object/repository.ts:108`. Not a valid HTTP content coding, and nothing in the repo
compresses anything — `grep` for `gzip|brotli|zlib` returns only this line. It is echoed back on
GET and can disrupt CDN compression negotiation.

**Fix:** omit it; set it only if and when the body is actually encoded.

### E-5 · Medium · ✅ FIXED · Patterns are recompiled for every file

> **✅ Resolved in `eb22049`.** Patterns are compiled once, into `CacheControlRule`s, when the config is parsed.

`src/helpers/file.ts:28-29` builds a fresh `RegExp` per pattern per file — for a 5,000-file build
with 4 patterns, up to 20,000 compilations.

**Fix:** compile once at config load (which also gives `E-3` its natural home).

### E-6 · Medium · ✅ FIXED · Key schema is over-strict and under-strict at once (reproduced)

> **✅ Resolved in `eb22049`.** _Deviation:_ the forced `^…$` is dropped rather than documented — any valid regex is accepted, matched against the object key, and the docs say to anchor when you mean the whole key.

`src/config/schema.ts:84-97`. `z.templateLiteral([literal('^'), string(), literal('$')])` rejects
`'index.html'`, `'^assets/.+'` and `'.*'` with the opaque `✖ Invalid key in record` — a constraint
documented nowhere in `.docs/` — while accepting `'^([$'`, which cannot compile (`E-3`).

**Fix:** `z.string().refine(compiles)`, and document the anchoring expectation.

### E-7 · Medium · ✅ FIXED · Cache-control value validation gaps (reproduced)

> **✅ Resolved in `eb22049`.** Repeated and contradictory directives (`no-store` + a lifetime, `public` + `private`, `no-cache` + `immutable`) are rejected, and accepted values are normalised (`MAX-AGE= 60` → `max-age=60`).

```
"max-age=60, max-age=120"    ACCEPTED   (duplicate directive)
"immutable, no-store"        ACCEPTED   (contradictory)
"max-age= 60"                ACCEPTED   (stray space, sent verbatim)
```

Rejections work correctly for `no-cache=1` and `max-age=-5`.

### E-8 · Low · ✅ FIXED · The shipped default `'^index.html$'` leaves `.` unescaped

> **✅ Resolved in `eb22049`.** Default is `'^index\\.html$'`.

Matches `indexXhtml`. Cosmetic, but it is the default users copy from the README.

### E-9 · Low · ✅ FIXED · No `immutable` on the hashed-asset rule

> **✅ Resolved in `eb22049`.** The default catch-all is `max-age=31536000, immutable, …`.

`max-age=31536000` without `immutable` still triggers revalidation on reload.

### E-10 · Low · ✅ FIXED · Extensionless files fall back to `application/octet-stream`

`src/file/types.ts:50`. Astro emits `_headers` / `_redirects`; `path.extname` returns `''` and
`mrmime` has no answer.

**✅ Resolved.** A top-level `resolveContentType(name, extension)` in `src/file/types.ts:10-29` tries
`lookup(extension)`, then `lookup(name)`, then falls back on `text/plain` only when there is no
extension at all — `application/octet-stream` is preserved for an unrecognised _extension_, which
carries no such hint. Six tests in the new `src/file/types.test.ts` cover `index.html`,
`_astro/a.123.js`, `_headers`, `_redirects`, `LICENSE` and `bundle.weirdext`.

_Open judgement call:_ the `lookup(name)` fallback means a file whose entire name is an extension
keyword — one literally called `json` — now resolves to `application/json` rather than `text/plain`.
Vanishingly rare, but it is a real widening.

---

## F. Bucket provisioning & S3 semantics

### F-1 · Critical · ✅ FIXED · `BucketOwnerEnforced` and `public-read` ACLs are mutually exclusive

> **✅ Resolved in `140e241`.** New `bucket.accessMode`: `'acl'` (default — no `BucketOwnerEnforced`, ACLs as before) or `'policy'` (`BucketOwnerEnforced`, Block Public Access lifted, `s3:GetObject` bucket policy, no object ACLs). Pinned against a recording fake client. **Still not exercised against real AWS** — worth one live `create` + `deploy` in `'policy'` mode before relying on it.

`src/file_object/repository.ts:34-48` sets `ObjectOwnership: 'BucketOwnerEnforced'`, which
**disables ACLs** on the bucket. The immediately following `PutBucketAcl { ACL: 'public-read' }`
(`:68-79`) and every `PutObject { ACL: 'public-read' }` (`:102-111`) then fail with
`AccessControlListNotSupported`. On real AWS, `create` dies and `deploy` fails on every object.

It presumably works today only because the config mandates a custom `endpoint` / `forcePathStyle`,
i.e. a laxer S3-compatible provider that ignores `ObjectOwnership`. `.docs/4-usage.md` documents
the contradiction as a feature: "sets `BucketOwnerEnforced` object ownership, makes the bucket
publicly readable".

**Fix:** drop the object ACL and grant read via `PutBucketPolicy`, or drop `BucketOwnerEnforced`.

_Confidence: documented AWS semantics; not executed against real AWS. Worth a live test before
acting._

### F-2 · Medium · ✅ FIXED · No `PutPublicAccessBlock`, no bucket policy

> **✅ Resolved in `140e241`.** `'policy'` mode sends `PutPublicAccessBlock` then `PutBucketPolicy`.

New AWS buckets have Block Public Access on by default, so even a working public-read ACL would be
refused. A bucket policy is the only way to make a `BucketOwnerEnforced` website bucket readable.

### F-3 · Medium · ✅ FIXED · `LocationConstraint` and the unchecked region cast

> **✅ Resolved in `140e241`.** `LocationConstraint` is omitted for `us-east-1`. The context carries the region as a `string`; the SDK's `BucketLocationConstraint` excludes `'us-east-1'` by design, so the narrowing happens only where the constraint is built.

`CreateBucketConfiguration.LocationConstraint: 'us-east-1'` is rejected by AWS — the field must be
omitted for that region. `region` reaches the SDK through an unchecked
`as BucketLocationConstraint` cast at `src/front/service.ts:33`.

### F-4 · High · ✅ FIXED · `doesBucketExist` reports every error as "does not exist" (reproduced)

> **✅ Resolved in `140e241`.** Only a 404 / `NotFound` / `NoSuchBucket` means missing; everything else fails with its cause. Against an unreachable endpoint, `check` now reports `connect ECONNREFUSED` and exits `1`, instead of "does not exist" and `0`.

`src/file_object/repository.ts:49-67` collapses _all_ `HeadBucket` failures to `false`. Against an
unreachable endpoint:

```
▲  The bucket 'probe-prod' does not exist
EXIT CODE = 0
```

A 403 (bucket exists, no `s3:ListBucket`), a typo'd `endpoint`, expired keys, a DNS failure — all
render as a missing bucket, in the command whose entire job is diagnosis. `deploy` then logs
"Bucket should exist" and cancels; `create` attempts a `CreateBucket` that fails with a second,
unrelated message.

**Fix:** treat only 404 / `NotFound` as `false`; propagate everything else.

---

## G. Concurrency & performance

### G-1 · High · ✅ FIXED · Upload concurrency is not actually bounded

> **✅ Resolved in `b14f0e1`.** One semaphore across every group, with the file read inside the permit. Pinned by `src/ui/tasks.test.ts` (peak 4 at a concurrency of 4 across six groups; the old code peaked at 24).

`src/ui/tasks.ts:63` runs groups with `concurrency: 'unbounded'` while `subTaskConcurrency` (`:46`)
bounds only _within_ a group. With the default `bucket.upload.concurrency = 50` and a typical build
(`_astro/`, `assets/`, `fonts/`, plus root files — each root-level file is its own group), real
peak concurrency is `groups × 50`.

Each in-flight item reads the whole file into memory (`src/helpers/file.ts:9-21` →
`src/file/types.ts:38`) and hands the buffer to `PutObjectCommand`, so peak RSS is
`groups × 50 × avg file size` and peak sockets/fds is the same number — 250+ on macOS, where the
default `ulimit -n` is 256, i.e. `EMFILE` during deploy.

**Fix:** one shared `Effect.makeSemaphore(concurrency)` taken inside `processItem`, with a small
constant for group concurrency.

### G-2 · Medium · ✅ FIXED · `O(n²)` regrouping of build files

> **✅ Resolved in `b14f0e1`.** Single pass into a `Map<string, FileItem[]>`, each tree built once; group order is deterministic. `extractRootFileTree` became dead code and was removed.

`src/front/service.ts:89` calls `FileTree.append` per file, and `src/file/types.ts:129-136` rebuilds
the entire array plus a fresh `Effect.gen` / `path.resolve` each time. For a 5,000-file `_astro/`
that is roughly 12.5M element copies and 5,000 throwaway trees.

**Fix:** accumulate into a `Map<string, FileItem[]>` and build each `FileTree` once.

### G-3 · Low · ✅ FIXED · Unbounded `stat` fan-out

> **✅ Resolved in `b14f0e1`.** `stat` concurrency bounded at 64.

`src/file/repository.ts:20-27` spawns one `fs.stat` fiber per entry of a recursive listing. `stat`
holds no fd, so this is fiber churn rather than `EMFILE` — still worth a bound.

---

## H. Configuration & validation

### H-1 · Medium · ✅ FIXED · `namePrefix` validation is a no-op (reproduced)

> **✅ Resolved in `89c8230`.** Anchored kebab-case: `/^[a-z0-9][a-z0-9-]*$/`.

`src/config/schema.ts:65-68` — `/[a-z-]*/` is unanchored and `*`-quantified, so it matches
everything:

```
4) bad namePrefix accepted: true     // 'MyApp_Prod!!'
```

The result is an opaque `InvalidBucketName` from S3 at `CreateBucket`.

**Fix:** `/^[a-z0-9][a-z0-9-]*$/`. Also "kekab" → "kebab" in the message (`H-7`).

### H-2 · Medium · ✅ FIXED · No `.strict()` anywhere

> **✅ Resolved in `89c8230`.** Every config object is a `z.strictObject` — including the two written across lines, which a first pass missed and a test caught.

An unknown top-level key parses fine; `indexDocumentSufix: 'main.html'` is silently dropped and the
default used.

### H-3 · Medium · ✅ FIXED · `concurrency` accepts non-integers

> **✅ Resolved in `89c8230`.** `.int().positive()`.

`src/config/schema.ts:104` — `z.number().positive()` accepts `2.7` and `0.5`, which flow straight
into `Stream.mapEffect({ concurrency })`. Needs `.int()`.

### H-4 · Medium · ✅ FIXED · Credentials are mandatory with no AWS default chain

> **✅ Resolved in `89c8230`.** `credentials`, `endpoint` and `apiVersion` are optional; omitted credentials fall back to the SDK's default chain. c12 loads `.env` (`dotenv: true`).

`src/config/schema.ts:69-78` makes `apiVersion` and `endpoint` required and `credentials` required
with no fallback to the SDK's default credential provider (env vars, instance/IRSA roles). A CI job
must therefore inline secrets in `frontready.config.ts` — which `.docs/3-quick-start.md` itself
warns against.

**Fix:** make them optional and let the SDK resolve, and/or enable c12's `dotenv: true` in
`src/config/loader.ts:10-13`.

### H-5 · Low · ✅ FIXED · A stray `.frontreadyrc` silently merges in

> **✅ Resolved in `89c8230`.** `rcFile: false`, `packageJson: false`.

c12 defaults `rcFile` to `.frontreadyrc`. Pass `rcFile: false` and `packageJson: false` if that is
not intended. (`globalRc` defaults off, so no home-directory read.)

### H-6 · Low · ✅ FIXED · Composed bucket name length is never checked

> **✅ Resolved in `89c8230`.** `makeDeploymentBucketName` checks the _composed_ name against S3's rules and fails with an `InvalidBucketNameError` naming the rule broken.

`src/factories/bucket_name.ts:7` builds `${namePrefix}-${identifier}`; S3 caps bucket names at 63
characters. Validate the composed name, which is where the real constraint lives.

### H-7 · Low · ✅ FIXED · "kekab-case" typo in the validation message

> **✅ Resolved in `89c8230`.** Fixed with `H-1`.

---

## I. Framework adapters

### I-1 · Medium · ✅ FIXED · A JSONC `angular.json` fails with an opaque error (reproduced)

> **✅ Resolved in `9b62ad1`.** Parsed with `confbox`'s `parseJSONC` (now a direct dependency). That parser is fault-tolerant — a truncated file came back as `{}` — so its error list is checked and a broken file fails as `AngularJsonSyntaxError` naming the file and line.

`src/helpers/angular.ts:121` and `:145` call `Effect.try(JSON.parse)` directly — against the
`toEffect` / `toEffectSync` convention in `CLAUDE.md` — so the result is not a `Data.TaggedError`.
The Angular CLI parses `angular.json` as **JSONC**, and comments are common:

```
■  An unknown error occurred in Effect.try
│  { "_tag": "UnknownException", "error": {}, … }
└  Check aborted            EXIT=0
```

No filename, no line number, no hint that it is a JSON problem.

**Fix:** route through `toEffectSync` with a dedicated error carrying `angularJsonPath`, and
consider a JSONC-tolerant parse.

### I-2 · Medium · ✅ FIXED · The configuration picker offers other projects' configurations (reproduced)

> **✅ Resolved in `9b62ad1`.** `getAngularConfigurations(path, projectName)` lists that project's build configurations only. The existing test asserting the cross-project behaviour was rewritten deliberately.

`src/helpers/angular.ts:57-68` collects names from _every_ project; the comment at `:54-56` claims
otherwise, but it filters by _target_, not by project. With `app` (production, development) and
`admin-lib` (staging), the prompt for `app` offers `staging`, and picking it hard-fails.
`angular.test.ts:341` asserts the current behaviour, so this may be deliberate — the prompt should
still filter to `projectName`.

### I-3 · Low · ✅ FIXED · `angular.json` is read and parsed twice per run

> **✅ Resolved in `9b62ad1`.** Read, parse and validation are shared in one `readAngularJson`. _Partial:_ the file is still read twice when the configuration picker runs (once to list, once to resolve) — one small read, kept to leave both public helpers path-based.

`getAngularConfigurations` and `resolveAngularConfiguration` each read the file.

---

## J. Security & hardening

### J-1 · Medium · ✅ FIXED · `runInShell(true)` with no quoting

> **✅ Resolved in `02e3e84`.** _Deviation:_ the shell is **kept** — the docs' own `command: 'npx ng build'` and Windows `.cmd` shims depend on it — and each argument is quoted for it instead (single quotes for POSIX, double for `cmd.exe`, which still expands `%VAR%`). Verified against a real shell, including a `;` injection attempt.

`src/helpers/command.ts:10` → `spawn(cmd, args, { shell: true })` joins argv with spaces and no
quoting. A `configurationName` or a `custom.build.args` entry containing a space is mis-split; one
containing `;` executes as a separate shell command. Both are user-controlled config values.

**Fix:** drop `runInShell` unless a shell is genuinely required, or quote the arguments.

### J-2 · Low · ✅ FIXED · Source maps are published with a one-year cache

> **✅ Resolved in `eb22049`.** New `upload.exclude` regex list, empty by default; the docs show `'\\.map$'`. Source maps still upload unless excluded.

`.map` files are uploaded publicly like anything else and fall into the `^.+$` catch-all (`E-2`).

### J-3 · (see `A-3`) · ✅ FIXED · Error dumps can carry file contents into CI logs

> **✅ Resolved in `3b005e2`.** Fixed with `A-3`.

---

## K. Gaps — missing capability, not defects

- **K-1** _(out of scope — feature work, not fixed)_ No ETag / content-hash comparison, so every deploy re-uploads the entire build.
- **K-2** _(out of scope — feature work, not fixed)_ No pruning of stale objects; old hashed chunks accumulate forever, and with
  `errorDocumentKey: index.html` deleted routes keep resolving.
- **K-3** _(out of scope — feature work, not fixed)_ No CDN invalidation hook after upload.
- **K-4** **✅ FIXED in `bf1cf95`** — `src/errors/prompt.ts` declares `PromptError`, which is never used anywhere.

---

## L. Build & tooling

Both surfaced while fixing the above; both are pre-existing and unrelated to the deploy path.

### L-1 · Low · ✅ FIXED · `format:all` fights `generate:readme` over the generated README

> **✅ Resolved in `bf1cf95`.** `README.md` is in `.prettierignore`.

`bun run format:all` rewrites roughly 53 lines of `README.md` (`*` → `-` bullets, tabs → spaces,
blank-line collapsing) that `bun run generate:readme` then puts straight back. `.prettierignore`
lists only `bun.lock`, so whichever script ran last wins and the file churns between two formats.

**Fix:** add `README.md` to `.prettierignore` — it is generated output and should not be
hand-formatted.

### L-2 · Low · ✅ FIXED · `format:all` strips committed trailing commas from the tsconfig files

> **✅ Resolved in `bf1cf95`.** The two tsconfigs are committed in prettier's form, matching the others. `prettier --list-different .` is empty and `format:all` is a no-op on a clean tree.

It reformats `tsconfig.alias.json` and `tsconfig.declaration.json`, removing trailing commas the repo
has committed, so anyone running `format:all` picks up unrelated diffs.

**Fix:** settle on one form — commit the prettier-formatted versions, or add them to
`.prettierignore`.

---

## Verified — not bugs

Checked explicitly and found correct; recorded so they are not re-reviewed:

- **`Equal` / `Hash` consistency.** `FileItem` (`types.ts:75-80`) and `FileTree` (`:162-167`) both
  key on `absolutePath`, which is what `Equal.equals` requires — it compares `Hash.hash` _before_
  calling `[Equal.symbol]`. A `FileItem` and a `FileTree` at the same path collide in hash but
  correctly compare unequal via the brand check.
- **Both `Symbol.iterator` implementations.** Each returns a fresh iterator per call and is
  re-iterable; the `this` captured by the arrow `next` is correct. `HashMap.values()` is likewise
  re-iterable, so the double traversal in `deploy_on_bucket.ts:54` and `:62` is safe.
- **`genFn` laziness.** `Effect.gen` is `fromIterator(() => f(pipe))`, so a fresh generator is built
  on every run — the effects are properly lazy and re-runnable. It is now redundant with
  `Effect.fn` / `Effect.fnUntraced`, which would also fix the hand-rolled, union-lossy `E` / `R`
  inference.
- **Interrupt propagation through the race.** `raceFirst` is `exit(self) |> race(exit(that)) |> flatten`,
  so the `Effect.interrupt` resumed from the keypress handler wins, the work fiber is interrupted,
  and its finalizers run before `cancel(...)` prints. Double Ctrl-C is safe — `initiateAsync` guards
  resume with `alreadyCalled`.
- **Child-process release.** `runCommand` (`src/helpers/command.ts:8`) is `Effect.scoped`, and
  `Command.start`'s `acquireRelease` kills the process group with `SIGTERM` on scope close.
- **`interceptProcessExit`'s acquire/release.** Restores `process.exit` on failure _and_ on
  interrupt. (The separate concern about neutralised exits is `C-5`.)
- **Astro `--config` in a subdirectory.** `outputPath` stays relative to `process.cwd()`, which
  matches Astro — its `root` defaults to the cwd regardless of where `--config` points.
