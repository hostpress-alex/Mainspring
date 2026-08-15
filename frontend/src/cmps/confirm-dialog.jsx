import {useEffect, useRef, useState} from 'react'
import './confirm-dialog.css'
import {t} from '../i18n'

/**
 * Ask before deleting.
 *
 * Deliberately a function rather than a component at every call site:
 *
 *   if (!await confirmDelete({ what: t('task.thisTask') })) return
 *
 * That keeps a call site one line longer instead of five, and there is exactly
 * ONE dialog in the tree. `window.confirm` would be shorter still, but it looks
 * different in every browser and its buttons cannot be labelled.
 */

let openDialog = null

export function confirmDialog(options = {}){
    // No host in the tree (in a test, say): let it through rather than block.
    if(!openDialog) return Promise.resolve(true)
    return openDialog(options)
}

/** Short form for the common case. */
export function confirmDelete({what, note = null, button = t('common.delete')} = {}){
    return confirmDialog({
        title: t('common.deleteTitle'),
        text: what?t('common.deleteText', {what}):t('common.deleteEntryText'),
        note,
        button,
        danger: true
    })
}

/** Belongs into the application tree once, at the very outside. */
export function ConfirmHost(){
    const [question, setQuestion] = useState(null)
    const answerRef = useRef(null)
    const buttonRef = useRef(null)

    useEffect(() => {
        openDialog = options => new Promise(resolve => {
            answerRef.current = resolve
            setQuestion(options)
        })
        return () => {
            openDialog = null
        }
    }, [])

    // The confirming button takes focus — Enter is enough, Escape cancels.
    useEffect(() => {
        if(!question) return
        buttonRef.current?.focus()

        function onKey(ev){
            if(ev.key === 'Escape'){
                ev.preventDefault();
                close(false)
            }
        }

        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [question])

    function close(answer){
        const resolve = answerRef.current
        answerRef.current = null
        setQuestion(null)
        if(resolve) resolve(answer)
    }

    if(!question) return null

    return (
        <div className="confirm-overlay" onMouseDown={ev => {
            if(ev.target === ev.currentTarget) close(false)
        }}>
            <div className="confirm-box" role="alertdialog" aria-modal="true">
                <h3 className="confirm-title">{question.title || t('common.confirmTitle')}</h3>
                {question.text && <p className="confirm-text">{question.text}</p>}
                {question.note && <p className="confirm-hint">{question.note}</p>}
                <div className="confirm-actions">
                    <button type="button" className="confirm-cancel" onClick={() => close(false)}>{t('common.cancel')}</button>
                    <button type="button" ref={buttonRef} className={question.danger?'confirm-ok is-danger':'confirm-ok'} onClick={() => close(true)}>{question.button || t('common.yes')}</button>
                </div>
            </div>
        </div>
    )
}
