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

> **Tip:** Don't hardcode real credentials. Load `accessKeyId` and `secretAccessKey` from environment variables instead.

### Cache control

The default cache configuration assumes your build emits **content-hashed (randomly named) chunk files** — the standard cache-busting pattern where a file's name changes whenever its contents change. This lets hashed assets be cached aggressively while the entry point stays fresh.

If your build tool doesn't hash filenames this way, override `defaultCacheControlValue` (and `cacheControlMapping`) so you don't serve stale assets:

```ts
import { Config } from '{{ pkg.name }}'

export default {
  bucket: {
    front: {
      defaultCacheControlValue:
        'max-age=60, stale-while-revalidate=600, stale-if-error=86400',
      cacheControlMapping: {
        '^index.html$': 'max-age=60, stale-while-revalidate=600, stale-if-error=86400',
        '^assets/.+$': 'max-age=86400, stale-while-revalidate=600, stale-if-error=86400',
        '^translate/.+$':
          'max-age=14400, stale-while-revalidate=600, stale-if-error=86400',
        '^.+$': 'max-age=31536000, stale-while-revalidate=600, stale-if-error=86400',
      },
      indexDocumentSuffix: 'index.html',
      errorDocumentKey: 'index.html',
    },
    upload: {
      concurrency: 50,
    },
  },
} satisfies Config
```

## Commands

Run the CLI with your package manager's runner — `bunx`, `yarn dlx`, or `npx`.

### Create

Creates the bucket and prepares it for static hosting: sets `BucketOwnerEnforced` object ownership, makes the bucket publicly readable, and adds the static website configuration.

```sh
bunx {{ pkg.name }} create      # Bun
yarn dlx {{ pkg.name }} create  # Yarn
npx {{ pkg.name }} create       # npm
```

### Check

Verifies that your build produces randomly named (content-hashed) chunk files, which the default cache configuration relies on. Also checks that the configured bucket exists and that it contains at least one object.

```sh
bunx {{ pkg.name }} check      # Bun
yarn dlx {{ pkg.name }} check  # Yarn
npx {{ pkg.name }} check       # npm
```

### Deploy

Builds your frontend using the configuration above, then uploads the output to the bucket. The file matching `indexDocumentSuffix` (default: `index.html`) is uploaded **last** — so the new entry point only becomes available once all the hashed chunks it references are already in place, avoiding a window where clients load an `index.html` pointing at chunks that haven't been uploaded yet.

```sh
bunx {{ pkg.name }} deploy      # Bun
yarn dlx {{ pkg.name }} deploy  # Yarn
npx {{ pkg.name }} deploy       # npm
```
