import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'

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

const icons = resolveIcons()
console.log(`[icons] Font Awesome ${icons.label}`)

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            'app-icons': icons.path
        }
    },
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
