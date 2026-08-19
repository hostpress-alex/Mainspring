/**
 * Reading a Google calendar with a Workspace service account.
 *
 * No library. The whole conversation with Google is three things — sign a
 * JWT, exchange it for an access token, fetch a page of events — and the
 * official client brings a dependency tree bigger than this application to do
 * them. `crypto` signs RS256 out of the box and `fetch` is in Node.
 *
 * **Domain-wide delegation, not OAuth.** There is no redirect, no consent
 * screen and no per-person click: a Workspace admin allows this service
 * account to act as members of the domain, restricted to one scope, and the
 * `sub` claim below says whose calendar is being read. That is what makes
 * this work at all for an installation that only exists behind a VPN — Google
 * refuses to register a redirect URI that is not https, and an internal
 * hostname can never be one.
 *
 * The scope is deliberately the read-only one. The application has no reason
 * to write into anybody's calendar, and asking for less means a bug cannot.
 *
 * Setting it up is an admin's job, not this file's:
 *   1. A Google Cloud project with the Calendar API enabled.
 *   2. A service account in it, with a JSON key, and "domain-wide delegation"
 *      switched on.
 *   3. In the Workspace admin console, under API controls, the client id of
 *      that service account authorised for exactly this scope:
 *      https://www.googleapis.com/auth/calendar.readonly
 *   4. GOOGLE_SA_KEY_FILE in backend/.env pointing at the JSON key, kept
 *      outside the repository.
 */
const crypto = require('crypto')
const fs = require('fs')
const config = require('../config')
const logger = require('./logger.service')

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/** A token is good for an hour; asked again a minute before it is not. */
const TOKEN_SAFETY_MS = 60 * 1000
/** Google's own ceiling per page. Fewer pages, same data. */
const PAGE_SIZE = 250
/** A runaway loop guard, not a limit anybody should reach. */
const MAX_PAGES = 20

/** access tokens by impersonated address. */
const tokens = new Map()

let cachedKey = null

/**
 * The service account key, read once.
 *
 * A file rather than the key in an environment variable, because a PEM in an
 * .env file has to survive being written with literal \n and usually does
 * not. The variable is still accepted for anybody who prefers it.
 */
function serviceAccount(){
    if(cachedKey !== null) return cachedKey

    const {googleKeyFile, googleClientEmail, googlePrivateKey} = config
    if(googleKeyFile){
        const raw = fs.readFileSync(googleKeyFile, 'utf8')
        const json = JSON.parse(raw)
        cachedKey = {clientEmail: json.client_email, privateKey: json.private_key}
    } else if(googleClientEmail && googlePrivateKey){
        cachedKey = {clientEmail: googleClientEmail, privateKey: String(googlePrivateKey).replace(/\\n/g, '\n')}
    } else {
        cachedKey = false
    }
    return cachedKey
}

/** Is this installation set up to talk to Google at all? */
function isConfigured(){
    try {
        return Boolean(serviceAccount())
    } catch(err) {
        logger.error('the Google service account key cannot be read', err)
        return false
    }
}

const b64url = buf => Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * The assertion: "this service account, acting as that person, for one hour,
 * for this one scope".
 */
function signAssertion(subject){
    const key = serviceAccount()
    if(!key) throw fail(503, 'Google is not configured on this server')

    const now = Math.floor(Date.now() / 1000)
    const header = {alg: 'RS256', typ: 'JWT'}
    const claims = {
        iss: key.clientEmail,
        sub: subject,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600
    }
    const body = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims))
    const signature = crypto.createSign('RSA-SHA256').update(body).sign(key.privateKey)
    return body + '.' + b64url(signature)
}

function fail(status, message){
    const err = new Error(message)
    err.status = status
    return err
}

/**
 * Turn Google's error bodies into one sentence.
 *
 * The two that will actually happen are worth recognising: `unauthorized_client`
 * means the delegation was never authorised in the admin console, and
 * `invalid_grant` usually means the address does not exist in the domain.
 * Both look like "400 Bad Request" otherwise, which sends people to read the
 * wrong documentation for an afternoon.
 */
function explain(status, body){
    const text = typeof body === 'string'?body:JSON.stringify(body || {})
    if(text.includes('unauthorized_client')){
        return 'Google refused the service account: the delegation for this scope is not authorised in the Workspace admin console'
    }
    if(text.includes('invalid_grant')){
        return 'Google refused the impersonation: is that address a user of your Workspace domain?'
    }
    if(status === 404) return 'Google has no calendar for that address'
    if(status === 403) return 'Google refused access to that calendar'
    return `Google answered ${status}: ${text.slice(0, 200)}`
}

async function accessTokenFor(email){
    const cached = tokens.get(email)
    if(cached && cached.expiresAt - TOKEN_SAFETY_MS > Date.now()) return cached.token

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: signAssertion(email)
        })
    })
    const body = await res.json().catch(() => ({}))
    if(!res.ok || !body.access_token) throw fail(502, explain(res.status, body))

    const token = body.access_token
    tokens.set(email, {token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000})
    return token
}

/** Forget a token, so the next call fetches a fresh one. */
function forgetToken(email){
    tokens.delete(email)
}

/**
 * One person's events between two dates.
 *
 * `singleEvents=true` is the important parameter: Google expands recurring
 * events into their occurrences, so nothing here has to understand RRULE,
 * exceptions, or the fact that the third Tuesday was moved. Each occurrence
 * arrives with its own id and its own times.
 *
 * Cancelled occurrences still arrive (that is how a deleted one is
 * announced), and are handed on as they are — the caller deletes them.
 */
async function fetchEvents(email, from, to){
    const token = await accessTokenFor(email)
    const events = []
    let pageToken = null

    for(let page = 0; page < MAX_PAGES; page++){
        const params = new URLSearchParams({
            timeMin: new Date(from).toISOString(),
            timeMax: new Date(to).toISOString(),
            singleEvents: 'true',
            orderBy: 'startTime',
            showDeleted: 'true',
            maxResults: String(PAGE_SIZE)
        })
        if(pageToken) params.set('pageToken', pageToken)

        const res = await fetch(`${EVENTS_URL}?${params}`, {
            headers: {Authorization: 'Bearer ' + token}
        })
        if(res.status === 401){
            // The token went stale early — throw it away so a retry is clean.
            forgetToken(email)
        }
        if(!res.ok){
            const body = await res.text().catch(() => '')
            throw fail(502, explain(res.status, body))
        }
        const body = await res.json()
        events.push(...(body.items || []))
        pageToken = body.nextPageToken || null
        if(!pageToken) break
    }
    return events
}

/**
 * Google's shape -> ours.
 *
 * A timed event carries `dateTime`, an all-day one carries `date` — and an
 * all-day end is the day *after* the last one, which is why it is not touched
 * here: the grids draw a half-open range as well.
 */
function normalise(item){
    if(!item || !item.id) return null
    if(item.status === 'cancelled') return {externalId: item.id, isCancelled: true}

    const start = item.start || {}
    const end = item.end || {}
    const isAllDay = Boolean(start.date && !start.dateTime)
    const startAt = new Date(start.dateTime || start.date)
    const endAt = new Date(end.dateTime || end.date || start.dateTime || start.date)
    if(Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null

    return {
        externalId: item.id,
        calendarId: item.organizer && item.organizer.email?String(item.organizer.email).slice(0, 190):'',
        // A calendar entry without a name is not an error; Google shows
        // "(No title)" for it and so do we, in the reader's language.
        title: String(item.summary || '').slice(0, 300),
        startAt,
        endAt,
        isAllDay,
        status: item.status === 'tentative'?'tentative':'confirmed',
        isCancelled: false
    }
}

module.exports = {isConfigured, fetchEvents, normalise, forgetToken, SCOPE}
