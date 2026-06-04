// @ts-nocheck

import { build, BuildOptions } from 'esbuild'

const ESM_BUILD_CONFIGURATION: BuildOptions = {
    entryPoints: ['index.ts'],
    entryNames: '[name]',
    outdir: '.dist',
    outExtension: {
        '.js': '.mjs',
    },
    packages: 'external',
    platform: 'neutral',
    target: 'esnext',
    format: 'esm',
    bundle: true,
    minify: false,
    sourcemap: false,
    tsconfig: './tsconfig.json',
} as const

const CJS_BUILD_CONFIGURATION: BuildOptions = {
    entryPoints: ['index.ts'],
    entryNames: '[name]',
    outdir: '.dist',
    outExtension: {
        '.js': '.cjs',
    },
    packages: 'external',
    platform: 'neutral',
    target: 'esnext',
    format: 'cjs',
    bundle: true,
    minify: false,
    sourcemap: false,
    tsconfig: './tsconfig.json',
} as const

Promise.all([build(ESM_BUILD_CONFIGURATION), build(CJS_BUILD_CONFIGURATION)])
    .then(() => {
        console.log('Build succeeded')
    })
    .catch((error) => {
        console.error('Build failed:', error)

        process.exitCode = 1
    })
