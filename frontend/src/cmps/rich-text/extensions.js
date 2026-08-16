import {Node} from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {TaskItem, TaskList} from '@tiptap/extension-list'
import Mention from '@tiptap/extension-mention'

/**
 * What the editor is allowed to produce.
 *
 * Kept apart from the React component on purpose: this list and the allowlist
 * in `services/rich-text.js` have to agree, and the pair is the whole safety
 * story. Anything switched on here that the sanitizer does not know is simply
 * dropped again on the way to the screen — which looks like the editor losing
 * text. So the two are changed together, and this file can be exercised
 * without a browser to prove the round trip.
 */
/**
 * An image in the text.
 *
 * Written by hand rather than pulled in as `@tiptap/extension-image`, and the
 * reason is that the official one earns its keep by handling images arriving
 * from anywhere — pasted base64, dragged URLs, external addresses. None of
 * that is wanted here: an image gets into a comment exactly one way, by being
 * uploaded first and inserted with the address the server gave back. The
 * sanitizer enforces that on the way out, and this node is small enough to
 * read in one sitting.
 *
 * A block, not inline. An image sitting between two words is a thing people
 * spend an afternoon making look right and nobody ever wants in a comment.
 */
const Image = Node.create({
    name: 'image',
    group: 'block',
    draggable: true,
    atom: true,

    addAttributes(){
        return {
            src: {default: null},
            alt: {default: null}
        }
    },

    parseHTML(){
        return [{tag: 'img[src]'}]
    },

    renderHTML({HTMLAttributes}){
        return ['img', HTMLAttributes]
    }
})

export function buildExtensions({placeholder = '', onMentionQuery = null} = {}){
    const list = [
        StarterKit.configure({
            // Everything the toolbar offers comes from here. The two turned off
            // are off because the sanitizer would drop them anyway.
            heading: {levels: [1, 2, 3]},
            // Inline code is off — the code BLOCK stays. Two ways to mark
            // something as code, one of which is invisible in a short comment,
            // is one too many. The `<code>` tag itself remains allowed by the
            // sanitizer because a code block is `<pre><code>`.
            code: false,
            link: {
                openOnClick: false,
                autolink: true,
                // Matches the sanitizer's URI test. Without it the editor
                // happily makes a `javascript:` link that then silently loses
                // its href when displayed.
                protocols: ['http', 'https', 'mailto', 'tel'],
                HTMLAttributes: {rel: 'noopener noreferrer nofollow', target: '_blank'}
            }
        }),
        TaskList,
        TaskItem.configure({nested: true}),
        Image
    ]

    if(onMentionQuery){
        list.push(Mention.configure({
            deleteTriggerWithBackspace: true,
            /**
             * The stored shape of a mention — deliberately tiptap's own.
             *
             * The first version of this wrote `data-mention-id` and
             * `data-mention-label` because they read better. Writing was fine;
             * READING was not. The extension's parser looks for `data-id` and
             * `data-label`, found neither, and every mention came back as
             * "@null" the moment an existing comment was opened for editing.
             * It writes correctly and destroys on the way back — which no
             * amount of looking at the editor would have shown.
             *
             * Both id and name are stored: the id so a rename does not break
             * the link, the name so a mention still says something once the
             * person has left the board.
             */
            renderText({node}){
                return `@${node.attrs.label ?? node.attrs.id}`
            },
            suggestion: {
                char: '@',
                // The list opens after "@" at the start or following a space,
                // so an e-mail address does not open it on every keystroke.
                allowedPrefixes: [' ', '\n'],
                items: ({query}) => onMentionQuery.items(query),
                render: onMentionQuery.render
            }
        }))
    }

    return list
}

/** Attributes tiptap reads back when a stored mention is edited again. */
export const MENTION_ATTRS = ['data-type', 'data-mention-id', 'data-mention-label']
