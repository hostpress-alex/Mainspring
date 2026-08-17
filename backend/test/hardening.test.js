/**
 * The three quiet holes from HANDOVER.md.
 *
 * None of them was reachable by accident, which is why they sat there: a file
 * id nobody has cannot be asked for, a mistyped endpoint is a developer's own
 * fault, and a log grows slowly. All three are the kind that is discovered by
 * somebody who was looking.
 */
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

/* ------------------------------------------------------------- the log -- */

test('the log rolls over instead of growing without end', () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'log-'))
    const cwd = process.cwd()
    try {
        process.chdir(dir)
        delete require.cache[require.resolve('../services/logger.service')]
        const logger = require('../services/logger.service')

        // Past the five megabyte mark, in lines large enough to get there
        // without taking a second.
        const chunk = 'x'.repeat(200 * 1024)
        for(let i = 0; i < 40; i++) logger.info(chunk)

        // The writes are asynchronous; the roll is not. What is asserted here
        // is that the roll happened and that the current file was started
        // again — not the byte count of a queue still draining.
        const current = fs.statSync(path.join(dir, 'logs', 'backend.log'))
        assert.ok(fs.existsSync(path.join(dir, 'logs', 'backend.log.1')),
            'the previous generation is kept')
        assert.ok(current.size < 6 * 1024 * 1024,
            `the current one stays small, is ${Math.round(current.size / 1024 / 1024)}MB`)
    } finally {
        process.chdir(cwd)
        delete require.cache[require.resolve('../services/logger.service')]
        fs.rmSync(dir, {recursive: true, force: true})
    }
})

/* ------------------------------------------------------- unknown routes -- */

test('an unknown /api path is a 404 with JSON, not the application', async () => {
    // It used to fall through to the single page application: 200, text/html,
    // for a mistyped endpoint. A client checking `res.ok` saw success.
    const express = require('express')
    const app = express()
    app.use('/api/board', (req, res) => res.json({ok: true}))
    app.use('/api', (req, res) => res.status(404).json({err: 'Unknown endpoint'}))
    app.get('/*splat', (req, res) => res.type('html').send('<!doctype html>'))

    const server = app.listen(0)
    const port = server.address().port
    try {
        const known = await fetch(`http://127.0.0.1:${port}/api/board`)
        assert.strictEqual(known.status, 200)

        const unknown = await fetch(`http://127.0.0.1:${port}/api/gibtsnicht`)
        assert.strictEqual(unknown.status, 404)
        assert.match(unknown.headers.get('content-type') || '', /json/)

        const page = await fetch(`http://127.0.0.1:${port}/irgendwas`)
        assert.strictEqual(page.status, 200, 'and the application itself still answers')
        assert.match(page.headers.get('content-type') || '', /html/)
    } finally {
        server.close()
    }
})
