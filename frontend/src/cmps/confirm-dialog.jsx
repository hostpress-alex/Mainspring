import { useEffect, useRef, useState } from 'react'
import './confirm-dialog.css'

/**
 * Rueckfrage vor dem Loeschen.
 *
 * Bewusst als Funktion statt als Komponente an jeder Stelle:
 *
 *   if (!await confirmDelete({ was: 'diesen Task' })) return
 *
 * So bleibt jede Aufrufstelle eine Zeile laenger statt fuenf, und es gibt
 * genau EINEN Dialog im Baum. `window.confirm` waere noch kuerzer, sieht aber
 * in jedem Browser anders aus und laesst sich nicht beschriften.
 */

let oeffne = null

export function confirmDialog(optionen = {}) {
    // Kein Host im Baum (z. B. in einem Test): dann lieber durchlassen als blockieren.
    if (!oeffne) return Promise.resolve(true)
    return oeffne(optionen)
}

/** Kurzform fuer den haeufigsten Fall. */
export function confirmDelete({ was, hinweis = null, knopf = 'Löschen' } = {}) {
    return confirmDialog({
        titel: 'Wirklich löschen?',
        text: was ? `${was} wird gelöscht.` : 'Der Eintrag wird gelöscht.',
        hinweis,
        knopf,
        gefahr: true,
    })
}

/** Gehoert einmal in den Anwendungsbaum, ganz aussen. */
export function ConfirmHost() {
    const [frage, setFrage] = useState(null)
    const antwortRef = useRef(null)
    const knopfRef = useRef(null)

    useEffect(() => {
        oeffne = optionen => new Promise(resolve => {
            antwortRef.current = resolve
            setFrage(optionen)
        })
        return () => { oeffne = null }
    }, [])

    // Der bestaetigende Knopf bekommt den Fokus — Enter reicht, Escape bricht ab.
    useEffect(() => {
        if (!frage) return
        knopfRef.current?.focus()
        function onKey(ev) {
            if (ev.key === 'Escape') { ev.preventDefault(); schliessen(false) }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [frage])

    function schliessen(antwort) {
        const resolve = antwortRef.current
        antwortRef.current = null
        setFrage(null)
        if (resolve) resolve(antwort)
    }

    if (!frage) return null

    return (
        <div className="confirm-overlay" onMouseDown={ev => {
            if (ev.target === ev.currentTarget) schliessen(false)
        }}>
            <div className="confirm-box" role="alertdialog" aria-modal="true">
                <h3 className="confirm-title">{frage.titel || 'Wirklich?'}</h3>
                {frage.text && <p className="confirm-text">{frage.text}</p>}
                {frage.hinweis && <p className="confirm-hint">{frage.hinweis}</p>}
                <div className="confirm-actions">
                    <button type="button" className="confirm-cancel"
                        onClick={() => schliessen(false)}>Abbrechen</button>
                    <button type="button" ref={knopfRef}
                        className={frage.gefahr ? 'confirm-ok is-danger' : 'confirm-ok'}
                        onClick={() => schliessen(true)}>{frage.knopf || 'Ja'}</button>
                </div>
            </div>
        </div>
    )
}
