import {t} from '../i18n'

/**
 * What is left for an inline display to say about an error.
 *
 * Since round 29 `http.service` reports EVERY failed request itself — a box in
 * the bottom left corner, for the whole application, from one place. The inline
 * messages in the panels are older than that channel; they exist precisely
 * because there was nowhere else to say it. Ever since, the calendar, the
 * search, the profile and a dozen others show the same sentence twice.
 *
 * The dividing line is not "which file" but **whether the error went over the
 * wire at all**:
 *
 *   has a `response`  -> the server answered, `http.service` has already said
 *                        so. Inline would be the duplicate.
 *   has none          -> a validation, an arithmetic error, a `new Error()`
 *                        from the panel itself. That has no other channel and
 *                        MUST be shown inline.
 *
 * Hence one helper instead of twelve rebuilt try/catch blocks: the rule is a
 * single one, it lives here, and every inline display asks the same question.
 *
 * Deliberate exception: `pages/login-signup` keeps its own evaluation.
 * `messageFor` is silent for `auth/*` — a wrong password is an answer, not a
 * malfunction — so there is no box there that could duplicate, and the form is
 * the only thing that can report it.
 */
export function localErrorText(err){
    if(!err) return null
    // A network error without an answer (server down, cable out) has been
    // reported as well — `messageFor` answers it with errors.offline.
    if(err.response || err.request || err.code === 'ERR_NETWORK') return null
    if(err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return null
    return err.message || String(err) || t('common.unknownError')
}
