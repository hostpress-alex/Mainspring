import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'
import {reportIcons} from './scripts/check-icons.mjs'

/**
 * Icons: Pro if it is here, free otherwise.
 *
 * Font Awesome Pro is licensed per seat and must not go into the repository,
 * so it is dropped into vendor/ by hand (see vendor/README.md) and ignored by
 * git. Everyone else gets the free package from package.json. Both are
 * version 7 and use the same class names, so the code does not care which one
 * is loaded — `import 'app-icons'` resolves to whichever is present.
 */
const iconsPath = name => fileURLToPath(new URL(name, import.meta.url))

function resolveIcons(){
    const pro = iconsPath('./vendor/fontawesome-pro/css/all.min.css')
    if(existsSync(pro)) return {label: 'Pro', path: pro}
    const free = iconsPath('./node_modules/@fortawesome/fontawesome-free/css/all.min.css')
    if(existsSync(free)) return {label: 'Free', path: free}
    // Not installed yet: start anyway rather than break the whole build.
    return {label: 'none — run `npm install`', path: iconsPath('./src/assets/styles/icons-missing.css')}
}

// Which set was picked, and whether any icon in the code needs Pro. Pro and
// Free share the class names, so a Pro-only icon looks correct on the machine
// that has the licence and stays empty everywhere else. reportIcons() lives in
// scripts/check-icons.mjs and reads the free package's own metadata.
//
// NOTE: this used to be replaced here by `what => console.log(...)`, which
// printed the label but ran no check at all. If the start-up line does not end
// in "... icons also exist in the free set", the import above is gone again.

const icons = resolveIcons()

/**
 * Vite clears the screen and draws its banner after the config has been read,
 * which swallowed anything printed here. The report therefore waits until the
 * server is listening.
 */
const iconReport = {
    name: 'icon-report',
    configureServer (server) {
        server.httpServer?.once('listening', () => {
            setTimeout(() => reportIcons(`Font Awesome ${icons.label}`), 100)
        })
    },
    buildStart () {
        if (this.meta.watchMode) return
        reportIcons(`Font Awesome ${icons.label}`)
    },
}

export default defineConfig({
    plugins: [react(), iconReport],
    resolve: {
        alias: {
            'app-icons': icons.path
        }
    },
    server: {
        port: 3000,
        // Vite treats `port` as a wish and quietly moves to 3001 if 3000 is
        // taken. Everything works, which is the problem: the tab on 3000 then
        // shows a leftover process while the new server sits on 3001.
        strictPort: true,
        host: true,
        // The frontend is served at http://project.buff:3000.
        // Without this entry Vite blocks the Host header.
        allowedHosts: ['project.buff', 'localhost', '127.0.0.1'],
        // The backend is passed through so that everything runs under one
        // origin in the browser: no CORS special cases, no cross-site cookies,
        // and relative paths like /api/upload/<id> work the same in dev and in
        // production.
        proxy: {
            '/api': {target: 'http://127.0.0.1:3030'},
            '/socket.io': {target: 'http://127.0.0.1:3030', ws: true}
        }
    },
    css: {
        preprocessorOptions: {
            scss: {
                // TODO(debt): a muzzle, not a fix.
                // The real fix: npx sass-migrator module --migrate-deps src/assets/styles/main.scss
                silenceDeprecations: ['import', 'global-builtin', 'color-functions']
            }
        }
    },
    build: {
        outDir: 'build',
        sourcemap: true
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/setupTests.js',
        css: true
    }
})
