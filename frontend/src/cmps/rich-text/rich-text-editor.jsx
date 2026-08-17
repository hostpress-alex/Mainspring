import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useEditor, EditorContent} from '@tiptap/react'
import {createPortal} from 'react-dom'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {buildExtensions} from './extensions'
import {createMentionBridge} from './mention-suggestion'
import {fromLegacy, isEmpty, trimTrailingEmpty} from '../../services/rich-text'
import {t} from '../../i18n'

/**
 * The one editor, used by updates, replies, the board description and the
 * calendar note.
 *
 * It is uncontrolled on purpose. Feeding `value` back in on every keystroke
 * would reset the cursor to the end of the document on every change, which is
 * what a controlled ProseMirror always ends up doing. `value` is therefore
 * only read when it names a document the editor does not already hold — a
 * switch to another task, a cancelled edit — and the host is told about
 * changes through `onChange`.
 */
export function RichTextEditor({
    value = '',
    onChange,
    members = [],
    placeholder = '',
    autoFocus = false,
    className = '',
    onSubmit = null,
    onUpload = null,
    onAttach = null
}){
    const [mention, setMention] = useState(null)
    const [linkDraft, setLinkDraft] = useState(null)
    const [isDropping, setIsDropping] = useState(false)
    const takeRef = useRef(null)

    /**
     * Where a dropped or pasted file goes.
     *
     * An image lands in the text at the place it was dropped; everything else
     * becomes an attachment under the comment. That split is the whole point
     * of this: a screenshot belongs next to the sentence it explains, and a
     * spreadsheet does not belong in the middle of a paragraph.
     *
     * Uploaded one at a time on purpose. Several at once would each want to
     * insert at "the cursor", and the cursor has moved by the time the second
     * answer arrives.
     */
    takeRef.current = async files => {
        if(!onUpload) return
        for(const file of files){
            try {
                const saved = await onUpload(file)
                if(!saved || !saved.url) continue
                if(String(saved.mime || file.type || '').startsWith('image/')){
                    editorRef.current?.chain().focus()
                        .insertContent({type: 'image', attrs: {src: saved.url, alt: saved.name || ''}})
                        .run()
                } else if(onAttach){
                    onAttach(saved)
                }
            } catch(err) {
                console.error('cannot add the file', err)
            }
        }
    }

    const editorRef = useRef(null)
    const mentionRef = useRef(null)
    const membersRef = useRef(members)
    membersRef.current = members

    const extensions = useMemo(() => buildExtensions({
        onMentionQuery: createMentionBridge({
            getMembers: () => membersRef.current,
            setState: setMention,
            stateRef: mentionRef
        })
    }), [])

    const editor = useEditor({
        extensions,
        // Through fromLegacy, like everywhere a stored value is read. Without
        // it an older comment opens as its own source — "@[Alex](6a7f…)" as
        // literal text — and saving that back would store the token twice
        // over, once as text and once as a real mention.
        content: fromLegacy(value),
        autofocus: autoFocus?'end':false,
        editorProps: {
            attributes: {class: 'rich-text rich-text-input', 'data-placeholder': placeholder},

            /**
             * Files are dropped and pasted into the text, not picked from a
             * button. Both are handled at ProseMirror level rather than with
             * React handlers on a wrapper: the editor has its own paste and
             * drop handling for text, and a listener on a parent element fires
             * after it has already decided what to do.
             */
            handlePaste(view, event){
                const take = takeRef.current
                if(!onUpload) return false
                const files = Array.from(event.clipboardData?.files || [])
                if(!files.length) return false
                event.preventDefault()
                take(files)
                return true
            },

            handleDrop(view, event){
                const take = takeRef.current
                if(!onUpload) return false
                const files = Array.from(event.dataTransfer?.files || [])
                if(!files.length) return false
                event.preventDefault()
                take(files)
                return true
            },
            handleKeyDown(view, event){
                // Ctrl/Cmd+Enter posts. Enter alone is a new line, because the
                // whole point of this box is that a text may have paragraphs.
                if(onSubmit && event.key === 'Enter' && (event.metaKey || event.ctrlKey)){
                    event.preventDefault()
                    onSubmit()
                    return true
                }
                return false
            }
        },
        onUpdate({editor}){
            // Trimmed on the way out, not in the editor: ProseMirror needs its
            // trailing empty paragraph to have somewhere to put the cursor.
            // The database does not, and every one of them is a blank line
            // under the comment when it is read back.
            const html = trimTrailingEmpty(editor.getHTML())
            onChange(isEmpty(html)?'':html)
        }
    }, [])

    // Only when the host really means a different document — see above.
    useEffect(() => {
        if(!editor) return
        const incoming = fromLegacy(value)
        if(incoming === editor.getHTML()) return
        if(isEmpty(incoming) && isEmpty(editor.getHTML())) return
        editor.commands.setContent(incoming, {emitUpdate: false})
    }, [value, editor])

    editorRef.current = editor

    const chain = useCallback(() => editor?.chain().focus(), [editor])

    function applyLink(){
        const url = String(linkDraft?.url || '').trim()
        setLinkDraft(null)
        if(!editor) return
        if(!url) return chain().extendMarkRange('link').unsetLink().run()
        chain().extendMarkRange('link').setLink({href: url}).run()
    }

    if(!editor) return null

    const is = (name, attrs) => editor.isActive(name, attrs)

    return (
        <div className={`rich-text-editor${className?' ' + className:''}`}>
            <div className="rich-text-toolbar" role="toolbar" aria-label={t('richtext.toolbar')}>
                <Tool on={is('bold')} title={t('richtext.bold')} icon="bold" onClick={() => chain().toggleBold().run()}/>
                <Tool on={is('italic')} title={t('richtext.italic')} icon="italic" onClick={() => chain().toggleItalic().run()}/>
                <Tool on={is('strike')} title={t('richtext.strike')} icon="strikethrough" onClick={() => chain().toggleStrike().run()}/>

                <span className="rich-text-sep"/>
                {[1, 2, 3].map(level => (
                    <Tool key={level} on={is('heading', {level})} title={t('richtext.heading', {n: level})}
                          label={`H${level}`} onClick={() => chain().toggleHeading({level}).run()}/>
                ))}

                <span className="rich-text-sep"/>
                <Tool on={is('bulletList')} title={t('richtext.bulletList')} icon="list-ul" onClick={() => chain().toggleBulletList().run()}/>
                <Tool on={is('orderedList')} title={t('richtext.orderedList')} icon="list-ol" onClick={() => chain().toggleOrderedList().run()}/>
                <Tool on={is('taskList')} title={t('richtext.taskList')} icon="list-check" onClick={() => chain().toggleTaskList().run()}/>

                <span className="rich-text-sep"/>
                <Tool on={is('blockquote')} title={t('richtext.quote')} icon="quote-right" onClick={() => chain().toggleBlockquote().run()}/>
                <Tool on={is('codeBlock')} title={t('richtext.codeBlock')} icon="file-code" onClick={() => chain().toggleCodeBlock().run()}/>
                <Tool title={t('richtext.rule')} icon="minus" onClick={() => chain().setHorizontalRule().run()}/>

                <span className="rich-text-sep"/>
                <Tool on={is('link')} title={t('richtext.link')} icon="link"
                      onClick={() => setLinkDraft({url: editor.getAttributes('link').href || ''})}/>
            </div>

            {linkDraft && (
                /* A div and not a form, and every button type="button".
                   This editor sits INSIDE the update form, and a form inside a
                   form is not nesting — the browser flattens it, so a submit
                   here submitted the update form instead and reloaded the
                   page. Enter is handled on the input by hand. */
                <div className="rich-text-link">
                    <input
                        autoFocus
                        type="text"
                        value={linkDraft.url}
                        placeholder="https://"
                        onChange={ev => setLinkDraft({url: ev.target.value})}
                        onKeyDown={ev => {
                            if(ev.key === 'Enter'){
                                ev.preventDefault()
                                applyLink()
                            }
                            if(ev.key === 'Escape'){
                                ev.preventDefault()
                                setLinkDraft(null)
                            }
                        }}
                    />
                    {/* Empty and save removes the link — one field for both
                        instead of a second button nobody finds. */}
                    <button type="button" className="is-primary" onClick={applyLink}>{t('common.save')}</button>
                    <button type="button" onClick={() => setLinkDraft(null)}>{t('common.cancel')}</button>
                </div>
            )}

            <div
                className={`rich-text-drop${isDropping?' is-over':''}`}
                onDragOver={ev => {
                    if(!onUpload || !ev.dataTransfer?.types?.includes('Files')) return
                    ev.preventDefault()
                    setIsDropping(true)
                }}
                onDragLeave={() => setIsDropping(false)}
                onDrop={() => setIsDropping(false)}>
                {/* EditorContent puts a wrapper div of its own around the
                    editable element. It needs a name, or the column that lets
                    the text scroll under a fixed toolbar breaks on the one
                    element in the chain nobody can see. */}
                <EditorContent className="rich-text-content" editor={editor}/>
                {isDropping && <span className="rich-text-drop-hint">{t('update.dropFiles')}</span>}
            </div>

            {mention && mention.items.length > 0 && mention.rect && createPortal(
                // In a portal because the box this sits in scrolls and clips —
                // the same reason the notification panel is in one. A z-index
                // cannot climb out of a stacking context.
                <ul className="rich-text-mentions" role="listbox"
                    style={{left: Math.round(mention.rect.left), top: Math.round(mention.rect.bottom + 6)}}>
                    {mention.items.map((member, i) => (
                        <li key={member._id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={i === mention.index}
                                className={`rich-text-mention-option${i === mention.index?' is-active':''}`}
                                // mousedown, not click: clicking blurs the
                                // editor first and the reply box closes on blur.
                                onMouseDown={ev => {
                                    ev.preventDefault()
                                    mentionRef.current?.command({id: String(member._id), label: member.fullname})
                                }}>
                                <Avatar className="rich-text-mention-avatar" src={member.imgUrl}/>
                                <span>{member.fullname}</span>
                            </button>
                        </li>
                    ))}
                </ul>,
                document.body
            )}
        </div>
    )
}

function Tool({on = false, title, icon = null, label = null, onClick}){
    return (
        <button
            type="button"
            className={`rich-text-tool${on?' is-on':''}`}
            title={title}
            aria-label={title}
            aria-pressed={on}
            // The editor must not lose the selection when a button is pressed,
            // or "make this bold" has nothing left to work on.
            onMouseDown={ev => ev.preventDefault()}
            onClick={onClick}>
            {icon?<Icon name={icon}/>:<span className="rich-text-tool-label">{label}</span>}
        </button>
    )
}
