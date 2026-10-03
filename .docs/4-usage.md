## Configuration

Create a `frontready.config.ts` file at the root of your project. The shape of the `front` key depends on how your frontend is built.

### Custom front

Use `type: 'custom'` when you want to define the build command yourself.

```ts
import { Config } from '{{ pkg.name }}'

export default {
  bucket: {
    namePrefix: 'my-front-hosting',
    params: {
      region: 'eu-west-3',
      apiVersion: '2006-03-01',
      endpoint: 'https://s3.eu-west-3.amazonaws.com',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
    },
  },
  front: {
    type: 'custom',
    custom: {
      build: {
        command: 'npx ng build',
        args: ['--configuration', 'production'],
      },
      environmentName: 'production',
      buildOutputPath: './example',
    },
  },
} satisfies Config
```

### Angular front

Use `type: 'angular'` to let `frontready` read your build settings straight from `angular.json`.

```ts
import { Config } from '{{ pkg.name }}'

export default {
  bucket: {
    namePrefix: 'my-front-hosting',
    params: {
      region: 'eu-west-3',
      apiVersion: '2006-03-01',
      endpoint: 'https://s3.eu-west-3.amazonaws.com',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
    },
  },
  front: {
    type: 'angular',
    angular: {
      angularJsonPath: './angular.json',
      projectName: 'MyFront',
      configurationName: 'production',
    },
  },
} satisfies Config
```

#### Supported versions

**Angular 6 and later.** Angular 6 is the release that replaced `.angular-cli.json` with the
`angular.json` this reads; earlier workspaces are not understood.

| Workspace feature                                              | Angular        |
| -------------------------------------------------------------- | -------------- |
| `outputPath` as a string                                       | 6 and later    |
| `outputHashing` (`none` / `media` / `bundles` / `all`)         | 6 and later    |
| `:application` builder, with its implicit `browser/` subfolder | 17 and later   |
| `outputPath` as an object (`{ base, browser }`)                | 17.1 and later |

Both spellings of the targets key are accepted: `architect` (the Angular CLI's own) and its
`targets` alias, so Nx-style workspaces are read too. Keys `frontready` doesn't need are ignored, so
a target carrying extra builder options is fine.

### Astro front

Use `type: 'astro'` to let `frontready` read your build settings straight from `astro.config.*`. It
resolves the output directory from `outDir` (default `./dist`), resolved against `root` the way
Astro itself does, falling back to `build.client` inside it when `output` isn't `'static'` — so you
don't repeat the path in two places.

`mode` is the Astro ([Vite](https://vite.dev/guide/env-and-mode)) mode: it is passed to the build as
`astro build --mode <mode>` and names the bucket, the way `configurationName` does for Angular.

```ts
import { Config } from '{{ pkg.name }}'

export default {
  bucket: {
    namePrefix: 'my-front-hosting',
    params: {
      region: 'eu-west-3',
      apiVersion: '2006-03-01',
      endpoint: 'https://s3.eu-west-3.amazonaws.com',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
    },
  },
  front: {
    type: 'astro',
    astro: {
      mode: 'production',
    },
  },
} satisfies Config
```

`astroConfigPath` is optional — `astro.config.{mjs,js,ts,mts,cjs}` is discovered automatically at the
root of your project. Set it when your config lives elsewhere, and it is forwarded to the build as
`--config`:

```ts
  front: {
    type: 'astro',
    astro: {
      astroConfigPath: './config/astro.config.ts',
      mode: 'staging',
    },
  },
```

#### Supported versions

**Astro 5 and later.** The build is run as `astro build --mode <mode>`, and the `--mode` flag was
added in Astro 5.0 — on Astro 4 and earlier the build fails on the unknown flag.

| Config option                   | Astro                                             |
| ------------------------------- | ------------------------------------------------- |
| `outDir`                        | all supported versions                            |
| `root`                          | all supported versions                            |
| `output: 'static'` / `'server'` | all supported versions                            |
| `build.client`                  | all supported versions                            |
| `output: 'hybrid'`              | removed in Astro 5; still read as a server output |

Options `frontready` doesn't need — `site`, `integrations`, `vite`, and the rest — are ignored, so
the config doesn't have to be trimmed down.

### Bucket name

Each environment gets its own bucket, named `<namePrefix>-<identifier>` where the identifier is
the Angular `configurationName`, the Astro `mode` or the custom `environmentName`. It is normalized into a valid S3 bucket name:

- lowercased, with accents stripped (`é` → `e`);
- every run of characters other than letters, digits and hyphens (`_`, `.`, spaces, …) replaced by
  a single `-`, and hyphens trimmed from both ends;
- kept within S3's 63 characters by cutting the **name prefix**, never the identifier, so each
  environment keeps its own bucket — with a warning when it happens. An identifier too long to
  leave room for any prefix is rejected.

With `namePrefix: 'my-front-hosting'`, the Angular configuration `Prod_EU` deploys to
`my-front-hosting-prod-eu`. Only the bucket name is affected: the build still receives the
identifier as you wrote it. An identifier with no letter or digit at all (`___`) is rejected before
any S3 call.

When normalization changes the name, the CLI says so, and every command shows the bucket it works
on (`check` and `create` in their result, `deploy` in its confirmation prompt).

### Prebuild

Set `front.prebuild` to run a command before the build — code generation, writing an env file,
installing dependencies… It is available to every front type:

```ts
  front: {
    type: 'astro',
    prebuild: {
      command: 'npm',
      args: ['run', 'codegen'], // optional, defaults to []
    },
    astro: {
      mode: 'production',
    },
  },
```

Only `deploy` runs it, after checking the bucket exists and right before the build, in the current
working directory. A non-zero exit aborts the deploy before anything is built or uploaded.

> **Tip:** Don't commit real credentials. Either read them from the environment — a `.env` file next to the config is loaded into `process.env` first — or leave `credentials` out entirely, and the AWS SDK's default credential chain (environment variables, shared config files, an instance or IRSA role) supplies them. `endpoint` and `apiVersion` are optional too: omit `endpoint` for AWS S3.

### Cache control

The default cache configuration assumes your build emits **content-hashed (randomly named) chunk files** — the standard cache-busting pattern where a file's name changes whenever its contents change. This lets hashed assets be cached aggressively while the entry point stays fresh.

Each object key is tested against the `cacheControlMapping` patterns in order, and the first match wins; nothing matching falls back to `defaultCacheControlValue`. The defaults are:

| Pattern          | `Cache-Control`                                                                 |
| ---------------- | ------------------------------------------------------------------------------- |
| `^index\.html$`  | `max-age=60, stale-while-revalidate=600, stale-if-error=86400`                  |
| `^assets/.+$`    | `max-age=86400, stale-while-revalidate=600, stale-if-error=86400`               |
| `^translate/.+$` | `max-age=14400, stale-while-revalidate=600, stale-if-error=86400`               |
| `^.+\.html$`     | `max-age=60, stale-while-revalidate=600, stale-if-error=86400`                  |
| `^.+$`           | `max-age=31536000, immutable, stale-while-revalidate=600, stale-if-error=86400` |

The `^.+\.html$` rule keeps **every** page on the short cache — not only the root `index.html` — since a multi-page build (any Astro static site, or Angular with prerendering) emits `about/index.html` and the like, which must never be pinned for a year. Everything else falls to the `^.+$` catch-all: a hashed chunk, cached for a year and marked `immutable`.

Your `cacheControlMapping` is **merged** with the defaults rather than replacing them:

- a new pattern is tried **before** the defaults, in the order you write them;
- a default's pattern overrides its value **in place**, so overriding `^.+$` keeps it last;
- `null` removes a default.

Patterns are regular expressions tested against the object key — anchor them with `^` and `$` when you mean the whole key. A pattern that does not compile, or a value with an unknown, repeated or contradictory directive (`no-store` with `max-age`, `public` with `private`, …), is rejected when the config loads, before anything is uploaded.

To opt out of the defaults entirely, set `useDefaultCacheControl: false`. Both the built-in rules
above and the built-in `defaultCacheControlValue` are dropped: only your `cacheControlMapping`
rules apply, in your order, and a file none of them matches is uploaded **without** a
`Cache-Control` header — unless you set `defaultCacheControlValue` yourself.

```ts
  bucket: {
    front: {
      useDefaultCacheControl: false,
      cacheControlMapping: {
        '^_astro/.+$': 'max-age=31536000, immutable',
      },
      // defaultCacheControlValue: 'no-cache', // optional fallback
    },
  },
```

If your build tool doesn't hash filenames this way, shorten the catch-all so you don't serve stale assets:

```ts
import { Config } from '{{ pkg.name }}'

export default {
  bucket: {
    front: {
      cacheControlMapping: {
        '^fonts/.+$': 'max-age=604800', // added: tried before the defaults
        '^.+$': 'max-age=3600', // overridden in place: still the last rule
        '^translate/.+$': null, // removed
      },
      indexDocumentSuffix: 'index.html',
      errorDocumentKey: 'index.html',
    },
    accessMode: 'acl', // or 'policy' for AWS S3 — see "Create" below
    upload: {
      concurrency: 50, // the cap on files in flight, across every folder at once
      exclude: ['\\.map$'], // keys not to upload — here, source maps
    },
  },
} satisfies Config
```

## Commands

Run the CLI with your package manager's runner — `bunx`, `yarn dlx`, or `npx`.

### Create

Creates the bucket and prepares it for static hosting: makes it publicly readable — through ACLs, or through a bucket policy with `accessMode: 'policy'` — and adds the static website configuration. Running it against a bucket that already exists is a no-op.

How the bucket is made publicly readable depends on `bucket.accessMode`:

| `accessMode`      | Bucket                                                            | Objects                | Use with                               |
| ----------------- | ----------------------------------------------------------------- | ---------------------- | -------------------------------------- |
| `'acl'` (default) | `public-read` bucket ACL                                          | `public-read` ACL each | Most S3-compatible providers           |
| `'policy'`        | `BucketOwnerEnforced`, Block Public Access lifted, read by policy | No ACL                 | AWS S3, which disables ACLs by default |

AWS rejects ACLs on a bucket whose ACLs are disabled — the default for new AWS buckets — so use `'policy'` there.

```sh
bunx {{ pkg.name }} create      # Bun
yarn dlx {{ pkg.name }} create  # Yarn
npx {{ pkg.name }} create       # npm
```

### Check

Verifies that your build produces randomly named (content-hashed) chunk files, which the default cache configuration relies on. Also checks that the configured bucket exists and that it contains at least one object.

Every check reports, then `check` exits non-zero if the bucket does not exist — so it can gate a CI pipeline ahead of `deploy`.

```sh
bunx {{ pkg.name }} check      # Bun
yarn dlx {{ pkg.name }} check  # Yarn
npx {{ pkg.name }} check       # npm
```

### Deploy

Runs the `prebuild` command if one is configured, builds your frontend using the configuration above, then uploads the output to the bucket. The file matching `indexDocumentSuffix` (default: `index.html`) is uploaded **last** — so the new entry point only becomes available once all the hashed chunks it references are already in place, avoiding a window where clients load an `index.html` pointing at chunks that haven't been uploaded yet.

```sh
bunx {{ pkg.name }} deploy      # Bun
yarn dlx {{ pkg.name }} deploy  # Yarn
npx {{ pkg.name }} deploy       # npm
```

### Exit codes

Every command ends on an outro and reports its outcome through the exit code, so CI can trust it:

| Code  | Meaning                                                                  |
| ----- | ------------------------------------------------------------------------ |
| `0`   | Success — including `create` on a bucket that already exists             |
| `1`   | Failure — invalid config, build failure, upload error, missing bucket, … |
| `130` | Cancelled — a prompt was declined (or escaped), or Ctrl-C was pressed    |
