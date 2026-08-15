import React from 'react'

/**
 * Symbol fuer "Workspaces". Bewusst ein Haus statt des fruehreren monday-Logos —
 * erbt die Farbe der Seitenleiste ueber currentColor.
 */
export default function WorkspaceIcon () {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M3 10.4L12 3l9 7.4" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.2 9.6V19a1 1 0 0 0 1 1h3.4v-5.1h4.8V20h3.4a1 1 0 0 0 1-1V9.6"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
