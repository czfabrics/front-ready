import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig, defineProject, mergeConfig } from 'vitest/config'
import packageInfo from './package.json'

export const vitestDefaultConfig = defineConfig({
    test: {
        exclude: [
            '**/node_modules/**',
            '**/.dist/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
        ],
        watch: true,
        coverage: {
            enabled: false,
            provider: 'v8',
            clean: true,
            cleanOnRerun: true,
            reporter: ['text'],
            reportOnFailure: true,
            thresholds: {
                autoUpdate: false,
                lines: 0,
                functions: 0,
                branches: 0,
                statements: 0,
            },
            skipFull: true,
        },
        //// https://vitest.dev/config/#clearmocks
        clearMocks: true,
        expect: {
            requireAssertions: true,
        },
        //// https://vitest.dev/config/#resolvesnapshotpath
    },
})

export default mergeConfig(
    vitestDefaultConfig,
    defineProject({
        plugins: [
            tsconfigPaths({
                projects: ['tsconfig.alias.json'],
            }),
        ],
        test: {
            name: packageInfo.name,
        },
    })
)
