## Quick Start

### Configuration

Create a `frontready.config.ts` file at the root of your project:

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

> **Tip:** Don't commit real credentials. Either read them from the environment — a `.env` file next to the config is loaded into `process.env` first — or leave `credentials` out entirely, and the AWS SDK's default credential chain (environment variables, shared config files, an instance or IRSA role) supplies them. `endpoint` and `apiVersion` are optional too: omit `endpoint` for AWS S3.

### Commands

**1. Create the bucket**

```sh
npx {{ pkg.name }} create
```

**2. Build and deploy your frontend**

```sh
npx {{ pkg.name }} deploy
```
