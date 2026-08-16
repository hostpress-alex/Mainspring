import {useEffect, useRef, useState, forwardRef, useImperativeHandle} from 'react'

import {Avatar} from '../avatar'
import {activeQuery, matchMembers, insertMention} from '../../services/mention'
import {t} from '../../i18n'

/**
 * A textarea that suggests people after an `@`.
 *
 * A drop-in for the plain `<textarea>` it replaces: every other prop is
 * forwarded, so style, placeholder, rows, onBlur and the rest keep working.
 * Two things it has to be careful about, both learned from the three places
 * it is used:
 *
 * 1. The reply box already binds Enter to "send". So the host's onKeyDown is
 *    only called when the suggestion list did not use the key itself.
 *    Otherwise picking a name with Enter would post the comment instead.
 *
 * 2. The update box closes on blur. Clicking a suggestion blurs the textarea,
 *    which would close the box before the click lands — so the list swallows
 *    mousedown rather than click.
 *
 * The list sits under the textarea rather than at the caret. Measuring a caret
 * inside a textarea means mirroring the whole thing into a hidden div with
 * pixel-identical font and padding, and getting it wrong looks worse than a
 * list in a fixed place.
 */
export const MentionTextarea = forwardRef(function MentionTextarea(
    {value, onChange, members = [], onKeyDown, className = '', ...rest}, ref
){
    const [query, setQuery] = useState(null)   // {start, query} or null
    const [active, setActive] = useState(0)
    const elTextarea = useRef(null)
    const caretToSet = useRef(null)

    useImperativeHandle(ref, () => elTextarea.current, [])

    const suggestions = query?matchMembers(members, query.query).slice(0, 8):[]
    const isOpen = !!query && suggestions.length > 0

    // Putting the caret back has to wait for React to have written the new
    // value, otherwise the browser puts it at the end of the old one.
    useEffect(() => {
        if(caretToSet.current === null || !elTextarea.current) return
        elTextarea.current.setSelectionRange(caretToSet.current, caretToSet.current)
        caretToSet.current = null
    }, [value])

    function refreshQuery(el){
        setQuery(activeQuery(el.value, el.selectionStart))
        setActive(0)
    }

    function handleChange(ev){
        onChange(ev)
        refreshQuery(ev.target)
    }

    function choose(member){
        const el = elTextarea.current
        if(!el || !query) return
        const next = insertMention(el.value, query.start, el.selectionStart, member)
        caretToSet.current = next.caret
        setQuery(null)
        // The host owns the value, so the change is handed over the same way a
        // keystroke would be — it needs no special case for this.
        onChange({target: {name: el.name, value: next.text}})
    }

    function handleKeyDown(ev){
        if(isOpen){
            if(ev.key === 'ArrowDown'){
                ev.preventDefault()
                setActive(i => (i + 1) % suggestions.length)
                return
            }
            if(ev.key === 'ArrowUp'){
                ev.preventDefault()
                setActive(i => (i - 1 + suggestions.length) % suggestions.length)
                return
            }
            if(ev.key === 'Enter' || ev.key === 'Tab'){
                ev.preventDefault()
                choose(suggestions[active])
                return
            }
            if(ev.key === 'Escape'){
                ev.preventDefault()
                setQuery(null)
                return
            }
        }
        if(onKeyDown) onKeyDown(ev)
    }

    return (
        <div className="mention-field">
            <textarea
                {...rest}
                ref={elTextarea}
                className={className}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onClick={ev => refreshQuery(ev.target)}
                onKeyUp={ev => {
                    // Arrow keys move the caret out of the @ without firing
                    // onChange, so the list has to be re-checked here too.
                    if(['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) refreshQuery(ev.target)
                }}
            />

            {isOpen && (
                <ul className="mention-list" role="listbox" aria-label={t('mention.suggestions')}>
                    {suggestions.map((member, i) => (
                        <li key={member._id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={i === active}
                                className={`mention-option${i === active?' is-active':''}`}
                                onMouseEnter={() => setActive(i)}
                                onMouseDown={ev => {
                                    // Not onClick: the textarea would blur first
                                    // and the update box closes on blur.
                                    ev.preventDefault()
                                    choose(member)
                                }}
                            >
                                <Avatar className="mention-avatar" src={member.imgUrl}/>
                                <span>{member.fullname}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
})
