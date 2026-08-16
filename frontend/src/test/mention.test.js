import {describe, it, expect} from 'vitest'
import {activeQuery, matchMembers, insertMention, toStorage, parse, mentionedIds, toPlain} from '../services/mention'

const members = [
    {_id: 'u1', fullname: 'Alex Neumann'},
    {_id: 'u2', fullname: 'Alex'},
    {_id: 'u3', fullname: 'Chris Nowak'},
    {_id: 'u4', fullname: 'Bea Öztürk'}
]

describe('activeQuery — when should the list open', () => {
    it('opens on a bare @ at the start', () => {
        expect(activeQuery('@', 1)).toEqual({start: 0, query: ''})
    })

    it('collects the letters typed after the @', () => {
        expect(activeQuery('Hallo @neu', 10)).toEqual({start: 6, query: 'neu'})
    })

    it('stays closed inside an e-mail address', () => {
        // The @ has a letter in front of it, so it is an address and not a
        // mention. Without this the list pops open on every address typed.
        expect(activeQuery('schreib an alex@example', 23)).toBe(null)
    })

    it('closes once a space follows', () => {
        expect(activeQuery('@Alex Neumann', 13)).toBe(null)
    })

    it('is about the caret, not the end of the text', () => {
        // Caret sits right after "@ne", the rest of the line is behind it.
        expect(activeQuery('@ne und noch was', 3)).toEqual({start: 0, query: 'ne'})
    })

    it('has nothing to say without an @', () => {
        expect(activeQuery('ganz normaler Text', 18)).toBe(null)
    })
})

describe('matchMembers — who is offered', () => {
    it('matches the start of any word in the name', () => {
        // Typing the surname has to work; nobody types the full name.
        expect(matchMembers(members, 'neu').map(m => m._id)).toEqual(['u1'])
    })

    it('offers everybody on a bare @', () => {
        expect(matchMembers(members, '')).toHaveLength(4)
    })

    it('ignores case', () => {
        expect(matchMembers(members, 'ALEX').map(m => m._id)).toEqual(['u1', 'u2'])
    })

    it('handles names outside a-z', () => {
        expect(matchMembers(members, 'özt').map(m => m._id)).toEqual(['u4'])
    })

    it('offers nobody for something nobody is called', () => {
        expect(matchMembers(members, 'xyz')).toEqual([])
    })
})

describe('insertMention', () => {
    it('replaces what was typed and leaves a trailing space', () => {
        const out = insertMention('Hallo @neu', 6, 10, members[0])
        expect(out.text).toBe('Hallo @Alex Neumann ')
        expect(out.caret).toBe(out.text.length)
    })

    it('keeps the text behind the caret', () => {
        const out = insertMention('@ne, schaust du?', 0, 3, members[0])
        expect(out.text).toBe('@Alex Neumann , schaust du?')
    })
})

describe('toStorage — shown form to stored form', () => {
    it('carries the id, not just the name', () => {
        expect(toStorage('Danke @Alex Neumann', members))
            .toBe('Danke @[Alex Neumann](u1)')
    })

    it('prefers the longer name when one is a prefix of the other', () => {
        // "Alex" and "Alex Neumann" are both on the board. Matching the short
        // one first would leave " Neumann" hanging outside the mention.
        expect(toStorage('@Alex Neumann', members)).toBe('@[Alex Neumann](u1)')
        expect(toStorage('@Alex', members)).toBe('@[Alex](u2)')
    })

    it('leaves text alone that names nobody', () => {
        expect(toStorage('@Niemand hier', members)).toBe('@Niemand hier')
        expect(toStorage('ganz ohne', members)).toBe('ganz ohne')
    })

    it('converts several mentions in one comment', () => {
        expect(toStorage('@Alex und @Chris Nowak', members))
            .toBe('@[Alex](u2) und @[Chris Nowak](u3)')
    })

    it('does not fire on a name that is only the start of a longer word', () => {
        expect(toStorage('@Alexander', members)).toBe('@Alexander')
    })

    it('leaves punctuation after the name outside the mention', () => {
        expect(toStorage('@Alex, kurz?', members)).toBe('@[Alex](u2), kurz?')
    })
})

describe('parse and render helpers', () => {
    it('splits text and mentions apart', () => {
        expect(parse('Hi @[Alex](u2)!')).toEqual([
            {type: 'text', value: 'Hi '},
            {type: 'mention', name: 'Alex', id: 'u2'},
            {type: 'text', value: '!'}
        ])
    })

    it('treats a comment without mentions as one piece', () => {
        expect(parse('nur Text')).toEqual([{type: 'text', value: 'nur Text'}])
        expect(parse('')).toEqual([])
    })

    it('lists each mentioned id once', () => {
        expect(mentionedIds('@[A](u1) @[B](u2) @[A](u1)')).toEqual(['u1', 'u2'])
    })

    it('turns the stored form back into something readable', () => {
        expect(toPlain('Hi @[Alex Neumann](u1), kurz?')).toBe('Hi @Alex Neumann, kurz?')
    })
})
