import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true,
        // Frontend wird unter http://project.buff:3000 ausgeliefert.
        // Ohne diesen Eintrag blockt Vite den Host-Header.
        allowedHosts: ['project.buff', 'localhost', '127.0.0.1'],
        // Backend wird durchgereicht, damit im Browser alles unter einer
        // Origin laeuft: keine CORS-Sonderfaelle, keine Cross-Site-Cookies,
        // und relative Pfade wie /api/upload/<id> funktionieren in Dev und Prod
        // identisch.
        proxy: {
            '/api': { target: 'http://127.0.0.1:3030' },
            '/socket.io': { target: 'http://127.0.0.1:3030', ws: true },
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                // TODO(Schuld): Nur ein Maulkorb, kein Fix.
                // Echter Fix: npx sass-migrator module --migrate-deps src/assets/styles/main.scss
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
