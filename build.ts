import { build, BuildOptions, Plugin, PluginBuild } from 'esbuild'
import fs from 'fs'
import path from 'path'

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

const getOutputDirPath = function (buildOptions: BuildOptions) {
    const outBase = buildOptions.outbase
    const outDir = buildOptions.outdir
    const outFile = buildOptions.outfile

    let outputDirPath = outDir

    if (!outDir && outFile) {
        outputDirPath = path.dirname(outFile)
    }

    if (!outputDirPath) {
        throw new Error('Esbuild should be configured with a output path (file or dir)')
    }

    if (outBase) {
        outputDirPath = path.resolve(outBase, outputDirPath)
    }

    return outputDirPath
}

const esbuildScriptNodeEnv = function (fileInDist: string): Plugin {
    return {
        name: 'script-node-env',
        setup(build: PluginBuild) {
            build.onEnd(async () => {
                const outputPath = getOutputDirPath(build.initialOptions)
                const filePath = path.resolve(outputPath, fileInDist)

                const fileContent = await fs.promises.readFile(filePath, 'utf-8')
                const newFileContent = fileContent.replace(/^/, '#!/usr/bin/env node\n')

                await fs.promises.writeFile(filePath, newFileContent)
            })
        },
    } as const
}

const BIN_ESM_BUILD_CONFIGURATION: BuildOptions = {
    entryPoints: ['main.ts'],
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
    plugins: [esbuildScriptNodeEnv('main.mjs')],
} as const

Promise.all([
    build(ESM_BUILD_CONFIGURATION),
    build(CJS_BUILD_CONFIGURATION),
    build(BIN_ESM_BUILD_CONFIGURATION),
])
    .then(() => {
        console.log('Build succeeded')
    })
    .catch((error) => {
        console.error('Build failed:', error)

        process.exitCode = 1
    })
