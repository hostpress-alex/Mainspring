import {describe, it, expect} from 'vitest'
import {localErrorText} from '../services/error-text'
import {messageFor} from '../services/http.service'

/**
 * Die Regel, die die doppelten Fehlermeldungen abgeschafft hat.
 *
 * `http.service` meldet jeden fehlgeschlagenen Request global; die Panels
 * melden zusaetzlich inline. Ergebnis war derselbe Satz zweimal. Die Trennung
 * laeuft darueber, ob der Fehler ueberhaupt ueber das Netz gegangen ist.
 */
describe('localErrorText — was inline noch gesagt werden muss', () => {
    it('schweigt, wenn der Server geantwortet hat', () => {
        const err = new Error('Request failed with status code 500')
        err.response = {status: 500, data: {err: 'Board nicht gefunden'}}
        expect(localErrorText(err)).toBe(null)
    })

    it('schweigt auch ohne Antwort, wenn ein Request rausging', () => {
        // Server aus, Kabel ab: axios setzt `request`, aber keine `response`.
        // messageFor beantwortet das mit errors.offline — also schon gesagt.
        const err = new Error('Network Error')
        err.request = {}
        err.code = 'ERR_NETWORK'
        expect(localErrorText(err)).toBe(null)
    })

    it('schweigt bei abgebrochenen Requests', () => {
        const canceled = new Error('canceled')
        canceled.code = 'ERR_CANCELED'
        expect(localErrorText(canceled)).toBe(null)

        const byName = new Error('canceled')
        byName.name = 'CanceledError'
        expect(localErrorText(byName)).toBe(null)
    })

    it('zeigt eine Validierung aus dem Panel selbst', () => {
        // board-admin: onError(new Error(t('admin.ownerRequired')))
        expect(localErrorText(new Error('Ein Board braucht einen Besitzer')))
            .toBe('Ein Board braucht einen Besitzer')
    })

    it('nimmt auch einen nackten String', () => {
        expect(localErrorText('so nicht')).toBe('so nicht')
    })

    it('macht aus nichts nichts', () => {
        expect(localErrorText(null)).toBe(null)
        expect(localErrorText(undefined)).toBe(null)
    })
})

/**
 * Der eigentliche Punkt: nie beide. Das ist die Eigenschaft, die kaputt war,
 * und die einzige, die dauerhaft geprueft werden muss — wer von beiden redet,
 * ist eine Optik-Entscheidung, dass nur einer redet, ist die Anforderung.
 */
describe('global oder inline, aber nie beides', () => {
    function withResponse(status, serverErr){
        const err = new Error(`Request failed with status code ${status}`)
        err.request = {}
        err.response = {status, data: serverErr?{err: serverErr}:{}}
        return err
    }

    const cases = [
        ['500 mit Serversatz', 'board/1', 'GET', withResponse(500, 'Board nicht gefunden')],
        ['500 ohne Serversatz', 'board/1', 'PUT', withResponse(500)],
        ['403', 'user/1', 'PUT', withResponse(403)],
        ['404 beim Lesen', 'board/nope', 'GET', withResponse(404, 'Nicht gefunden')]
    ]

    for(const [name, endpoint, method, err] of cases){
        it(`${name}: nur die Box`, () => {
            expect(messageFor(endpoint, method, err)).toBeTruthy()
            expect(localErrorText(err)).toBe(null)
        })
    }

    it('Validierung: nur inline', () => {
        // Ein selbst geworfener Fehler erreicht `ajax` nie, also gibt es dazu
        // auch keine Box — er hat genau einen Kanal, und der ist inline.
        const err = new Error('Ende liegt vor dem Anfang')
        expect(err.response).toBe(undefined)
        expect(err.request).toBe(undefined)
        expect(localErrorText(err)).toBe('Ende liegt vor dem Anfang')
    })

    it('401: beide schweigen, die Seite wird ersetzt', () => {
        const err = withResponse(401)
        expect(messageFor('board/1', 'GET', err)).toBe(null)
        expect(localErrorText(err)).toBe(null)
    })

    it('auth/* schweigt global — deshalb wertet login-signup selbst aus', () => {
        const err = withResponse(401, 'Falsches Passwort')
        expect(messageFor('auth/login', 'POST', err)).toBe(null)
        // Und weil localErrorText hier auch schweigen wuerde, ist
        // pages/login-signup absichtlich NICHT umgestellt.
        expect(localErrorText(err)).toBe(null)
    })
})
