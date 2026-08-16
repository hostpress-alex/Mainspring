import {useMemo} from 'react'

import {toDisplayHtml, isEmpty} from '../../services/rich-text'

/**
 * Stored rich text, on screen.
 *
 * The only place in the application that hands markup to
 * `dangerouslySetInnerHTML`, and it does so through `toDisplayHtml` — which
 * cleans on the way out. Every other component shows text by rendering it as
 * React nodes.
 *
 * Anything that wants to display a comment goes through here rather than
 * calling the sanitizer itself. One door is auditable; six are not.
 */
export function RichTextView({value, className = '', ...rest}){
    const html = useMemo(() => toDisplayHtml(value), [value])
    if(isEmpty(value)) return null

    return (
        <div
            className={`rich-text${className?' ' + className:''}`}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{__html: html}}
            {...rest}
        />
    )
}
