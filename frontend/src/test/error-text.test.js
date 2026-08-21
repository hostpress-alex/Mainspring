import {describe, it, expect} from 'vitest'
import {localErrorText} from '../services/error-text'
import {messageFor} from '../services/http.service'

/**
 * The rule that got rid of the duplicated error messages.
 *
 * `http.service` reports every failed request globally; the panels reported
 * inline on top of that. The result was the same sentence twice. The split runs
 * along whether the error went over the wire at all.
 */
describe('localErrorText — what is left to say inline', () => {
    it('stays silent when the server answered', () => {
        const err = new Error('Request failed with status code 500')
        err.response = {status: 500, data: {err: 'Board nicht gefunden'}}
        expect(localErrorText(err)).toBe(null)
    })

    it('stays silent without an answer as long as a request went out', () => {
        // Server down, cable out: axios sets `request` but no `response`.
        // messageFor answers that with errors.offline — so it is already said.
        const err = new Error('Network Error')
        err.request = {}
        err.code = 'ERR_NETWORK'
        expect(localErrorText(err)).toBe(null)
    })

    it('stays silent for cancelled requests', () => {
        const canceled = new Error('canceled')
        canceled.code = 'ERR_CANCELED'
        expect(localErrorText(canceled)).toBe(null)

        const byName = new Error('canceled')
        byName.name = 'CanceledError'
        expect(localErrorText(byName)).toBe(null)
    })

    it('shows a validation raised by the panel itself', () => {
        // board-admin: onError(new Error(t('admin.ownerRequired')))
        expect(localErrorText(new Error('A board needs an owner')))
            .toBe('A board needs an owner')
    })

    it('takes a bare string as well', () => {
        expect(localErrorText('no good')).toBe('no good')
    })

    it('makes nothing out of nothing', () => {
        expect(localErrorText(null)).toBe(null)
        expect(localErrorText(undefined)).toBe(null)
    })
})

/**
 * The actual point: never both. That is the property that was broken, and the
 * only one that has to stay checked — WHICH of the two speaks is a matter of
 * looks, that only one speaks is the requirement.
 */
describe('global or inline, but never both', () => {
    function withResponse(status, serverErr){
        const err = new Error(`Request failed with status code ${status}`)
        err.request = {}
        err.response = {status, data: serverErr?{err: serverErr}:{}}
        return err
    }

    const cases = [
        ['500 with a server sentence', 'board/1', 'GET', withResponse(500, 'Board nicht gefunden')],
        ['500 without one', 'board/1', 'PUT', withResponse(500)],
        ['403', 'user/1', 'PUT', withResponse(403)],
        ['404 while reading', 'board/nope', 'GET', withResponse(404, 'Nicht gefunden')]
    ]

    for(const [name, endpoint, method, err] of cases){
        it(`${name}: the box only`, () => {
            expect(messageFor(endpoint, method, err)).toBeTruthy()
            expect(localErrorText(err)).toBe(null)
        })
    }

    it('validation: inline only', () => {
        // An error thrown here never reaches `ajax`, so there is no box for it
        // either — it has exactly one channel, and that channel is inline.
        const err = new Error('The end is before the start')
        expect(err.response).toBe(undefined)
        expect(err.request).toBe(undefined)
        expect(localErrorText(err)).toBe('The end is before the start')
    })

    it('401: both stay silent, the page is being replaced', () => {
        const err = withResponse(401)
        expect(messageFor('board/1', 'GET', err)).toBe(null)
        expect(localErrorText(err)).toBe(null)
    })

    it('auth/* is silent globally — which is why login-signup evaluates itself', () => {
        const err = withResponse(401, 'Falsches Passwort')
        expect(messageFor('auth/login', 'POST', err)).toBe(null)
        // And because localErrorText would be silent here too,
        // pages/login-signup is deliberately NOT converted.
        expect(localErrorText(err)).toBe(null)
    })
})
