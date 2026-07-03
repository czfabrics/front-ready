<!-- ⚠️ This README has been generated from the file(s) ".blueprint.md" ⚠️--><h1 align="center">@czfabrics/front-ready</h1>
<p align="center">
		<a href="https://npmcharts.com/compare/@czfabrics/front-ready?minimal=true"><img alt="Downloads per month" src="https://img.shields.io/npm/dm/@czfabrics/front-ready.svg" height="20"/></a>
<a href="https://www.npmjs.com/package/@czfabrics/front-ready"><img alt="NPM Version" src="https://img.shields.io/npm/v/@czfabrics/front-ready.svg" height="20"/></a>
<a href="https://github.com/czfabrics/front-ready/graphs/commit-activity"><img alt="Maintained" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" height="20"/></a>
	</p>

<p align="center">
  <b>A framework-aware deployment tool for static frontends. It reads your project's build configuration (e.g. angular.json), runs the build with the configuration you choose, and pushes the compiled output to an S3 bucket — with correct content types and cache headers — so a single command takes you from source to a live, hosted site.</b></br>
  <sub><sub>
</p>

<br />


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#table-of-contents)

## Table of Contents

* [Overview](#overview)
	* [Key Features](#key-features)
* [Installation](#installation)
	* [Bun](#bun)
	* [Yarn](#yarn)
	* [NPM](#npm)
* [Quick Start](#quick-start)
	* [Configuration](#configuration)
	* [Commands](#commands)
* [Configuration](#configuration-1)
	* [Custom front](#custom-front)
	* [Angular front](#angular-front)
	* [Cache control](#cache-control)
* [Commands](#commands-1)
	* [Create](#create)
	* [Check](#check)
	* [Deploy](#deploy)
* [License](#license)

[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#overview)

## Overview

A framework-aware deployment tool for static frontends. It reads your project's build configuration (e.g. angular.json), runs the build with the configuration you choose, and pushes the compiled output to an S3 bucket — with correct content types and cache headers — so a single command takes you from source to a live, hosted site.

### Key Features

- **S3 Bucket support**: Upload your frontend files to an S3 bucket.
- **S3 Bucket host agnostic**: Choose the host you want (Amazon, OVH, etc.).
- **Angular support**: It reads your `angular.json` to know how to build and which folder is the output build folder.
- **Any Front support**: Adaptable to any frontend by using the `custom` config.


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#installation)

## Installation

### Bun

```sh
bun add @czfabrics/front-ready@0.1.0-beta.1
```

### Yarn

```sh
yarn add @czfabrics/front-ready@0.1.0-beta.1
```

### NPM

```sh
npm install @czfabrics/front-ready@0.1.0-beta.1
```


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#quick-start)

## Quick Start

### Configuration

Create a `frontready.config.ts` file at the root of your project:

```ts
import { Config } from '@czfabrics/front-ready'

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

> **Tip:** Don't commit real credentials. Load `accessKeyId` and `secretAccessKey` from environment variables instead.

### Commands

**1. Create the bucket**

```sh
npx @czfabrics/front-ready <create-command>
```

**2. Build and deploy your frontend**

```sh
npx @czfabrics/front-ready deploy
```


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#configuration)

## Configuration

Create a `frontready.config.ts` file at the root of your project. The shape of the `front` key depends on how your frontend is built.

### Custom front

Use `type: 'custom'` when you want to define the build command yourself.

```ts
import { Config } from '@czfabrics/front-ready'

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
import { Config } from '@czfabrics/front-ready'

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
import { Config } from '@czfabrics/front-ready'

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


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#commands)

## Commands

Run the CLI with your package manager's runner — `bunx`, `yarn dlx`, or `npx`.

### Create

Creates the bucket and prepares it for static hosting: sets `BucketOwnerEnforced` object ownership, makes the bucket publicly readable, and adds the static website configuration.

```sh
bunx @czfabrics/front-ready create      # Bun
yarn dlx @czfabrics/front-ready create  # Yarn
npx @czfabrics/front-ready create       # npm
```

### Check

Verifies that your build produces randomly named (content-hashed) chunk files, which the default cache configuration relies on. Also checks that the configured bucket exists and that it contains at least one object.

```sh
bunx @czfabrics/front-ready check      # Bun
yarn dlx @czfabrics/front-ready check  # Yarn
npx @czfabrics/front-ready check       # npm
```

### Deploy

Builds your frontend using the configuration above, then uploads the output to the bucket. The file matching `indexDocumentSuffix` (default: `index.html`) is uploaded **last** — so the new entry point only becomes available once all the hashed chunks it references are already in place, avoiding a window where clients load an `index.html` pointing at chunks that haven't been uploaded yet.

```sh
bunx @czfabrics/front-ready deploy      # Bun
yarn dlx @czfabrics/front-ready deploy  # Yarn
npx @czfabrics/front-ready deploy       # npm
```


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#license)

## License
	
Licensed under [MIT](https://opensource.org/licenses/MIT).
