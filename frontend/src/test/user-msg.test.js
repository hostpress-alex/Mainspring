import {describe, it, expect, beforeEach} from 'vitest'
import {showErrorMsg, showSuccessMsg, subscribeMsgs, _resetMsgs} from '../services/user-msg.service'
import {messageFor} from '../services/http.service'
import {t} from '../i18n'

beforeEach(() => _resetMsgs())

describe('user-msg service — who hears about a failure', () => {
    it('hands a message to the host', () => {
        const seen = []
        subscribeMsgs(m => seen.push(m))
        showErrorMsg('kaputt')
        expect(seen).toHaveLength(1)
        expect(seen[0]).toMatchObject({type: 'error', txt: 'kaputt'})
    })

    it('keeps what was raised before the host existed', () => {
        // A failure during start-up is the one most worth seeing, and it
        // happens before anything is mounted.
        showErrorMsg('zu frueh')
        const seen = []
        subscribeMsgs(m => seen.push(m))
        expect(seen.map(m => m.txt)).toEqual(['zu frueh'])
    })

    it('does not replay the same message to the next host', () => {
        showErrorMsg('einmal')
        subscribeMsgs(() => {})
        const second = []
        subscribeMsgs(m => second.push(m))
        expect(second).toHaveLength(0)
    })

    it('drops the oldest when nobody is listening for a long time', () => {
        for(let i = 0; i < 9; i++) showErrorMsg(`nr ${i}`)
        const seen = []
        subscribeMsgs(m => seen.push(m))
        expect(seen).toHaveLength(5)
        expect(seen[0].txt).toBe('nr 4')
    })

    it('ignores an empty message rather than showing an empty box', () => {
        const seen = []
        subscribeMsgs(m => seen.push(m))
        showErrorMsg('')
        showErrorMsg(null)
        showSuccessMsg(undefined)
        expect(seen).toHaveLength(0)
    })

    it('stops after unsubscribing', () => {
        const seen = []
        const off = subscribeMsgs(m => seen.push(m))
        off()
        showErrorMsg('nach dem abmelden')
        expect(seen).toHaveLength(0)
    })

    it('gives every message its own id', () => {
        const seen = []
        subscribeMsgs(m => seen.push(m))
        showErrorMsg('a')
        showErrorMsg('a')
        expect(seen[0].id).not.toBe(seen[1].id)
    })
})

describe('messageFor — what is worth saying', () => {
    const withStatus = (status, body) => ({response: {status, data: body}})

    it('prefers the sentence the server sent', () => {
        expect(messageFor('board/b1/task/t1', 'PATCH', withStatus(500, {err: 'Task konnte nicht geloescht werden'})))
            .toBe('Task konnte nicht geloescht werden')
    })

    it('says nothing when the request was called off', () => {
        expect(messageFor('board/b1', 'GET', {code: 'ERR_CANCELED'})).toBe(null)
    })

    it('says nothing on 401 — the login page is already loading', () => {
        expect(messageFor('board/b1', 'GET', withStatus(401, {}))).toBe(null)
    })

    it('leaves the login form to say its own piece', () => {
        expect(messageFor('auth/login', 'POST', withStatus(400, {err: 'nope'}))).toBe(null)
        expect(messageFor('auth/me', 'GET', withStatus(401, {}))).toBe(null)
    })

    it('names the missing permission', () => {
        expect(messageFor('board/b1/task/t1', 'PATCH', withStatus(403, {})))
            .toBe(t('errors.notAllowed'))
    })

    it('tells a failed save from a failed read', () => {
        expect(messageFor('board/b1/task/t1', 'PATCH', withStatus(500, {}))).toBe(t('errors.saveFailed'))
        expect(messageFor('board/b1', 'GET', withStatus(500, {}))).toBe(t('errors.loadFailed'))
    })

    it('knows there was no answer at all', () => {
        // No `response`: the server is down, or the network is. That is a
        // different sentence from "the server refused".
        expect(messageFor('board/b1/task/t1', 'PATCH', {message: 'Network Error'}))
            .toBe(t('errors.offline'))
    })

    it('refuses a server string long enough to be a stack trace', () => {
        const huge = 'x'.repeat(400)
        expect(messageFor('board/b1', 'POST', withStatus(500, {err: huge}))).toBe(t('errors.saveFailed'))
    })

    it('survives a body that is not what anybody expected', () => {
        expect(messageFor('board/b1', 'POST', withStatus(500, null))).toBe(t('errors.saveFailed'))
        expect(messageFor('board/b1', 'POST', withStatus(500, 'plain text'))).toBe(t('errors.saveFailed'))
        expect(messageFor('board/b1', 'POST', withStatus(500, {err: 42}))).toBe(t('errors.saveFailed'))
    })
})
