import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true,
        // The frontend is served at http://project.buff:3000.
        // Without this entry Vite blocks the Host header.
        allowedHosts: ['project.buff', 'localhost', '127.0.0.1'],
        // The backend is passed through so that everything runs under one
        // origin in the browser: no CORS special cases, no cross-site cookies,
        // and relative paths like /api/upload/<id> work the same in dev and in
        // production.
        proxy: {
            '/api': { target: 'http://127.0.0.1:3030' },
            '/socket.io': { target: 'http://127.0.0.1:3030', ws: true },
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                // TODO(debt): a muzzle, not a fix.
                // The real fix: npx sass-migrator module --migrate-deps src/assets/styles/main.scss
                silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
            },
        },
    },
    build: {
        outDir: 'build',
        sourcemap: true,
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/setupTests.js',
        css: true,
    },
})
