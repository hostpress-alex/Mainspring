import { useState } from 'react'
import { GUEST_IMG } from '../services/avatar'

/**
 * A user's picture, with a fallback that actually holds.
 *
 * `src={user.imgUrl || GUEST_IMG}` only catches the empty case. A URL that
 * exists but no longer resolves — a deleted upload, a server that has moved —
 * leaves the browser's torn-paper icon sitting in the middle of the interface.
 * The error is caught here and the placeholder shown, exactly as if no picture
 * had ever been set.
 *
 * The failed URL is remembered rather than a boolean: after a new upload the
 * src changes and the picture gets its chance again without a remount.
 */
export function Avatar({ src, alt = '', ...rest }) {
    const [failed, setFailed] = useState(null)
    const url = src && src !== failed ? src : GUEST_IMG

    return <img src={url} alt={alt} onError={() => setFailed(src)} {...rest} />
}
