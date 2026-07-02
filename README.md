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
* [Usage](#usage)
	* [Custom](#custom)
	* [Angular](#angular)
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

**Config `frontready.config.ts`:**

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

**Command:**

```sh
npx @czfabrics/front-ready create
npx @czfabrics/front-ready deploy
```


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#usage)

## Usage

### Custom

**Config `frontready.config.ts`:**

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

**Command:**

```sh
npx @czfabrics/front-ready create
npx @czfabrics/front-ready deploy
```

### Angular

**Config `frontready.config.ts`:**

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
      configurationName: 'production',
      projectName: 'MyFront',
    },
  },
} satisfies Config
```

**Command:**

```sh
npx @czfabrics/front-ready create
npx @czfabrics/front-ready deploy
```


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/dark.png)](#license)

## License
	
Licensed under [MIT](https://opensource.org/licenses/MIT).
