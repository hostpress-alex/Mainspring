import {t} from '../i18n'

/**
 * Was von einem Fehler noch inline gezeigt werden muss.
 *
 * Seit Runde 29 meldet `http.service` JEDEN fehlgeschlagenen Request selbst —
 * eine Box unten links, für die ganze Anwendung, an einer Stelle. Die
 * Inline-Meldungen in den Panels stammen aus der Zeit davor, als es diesen
 * Kanal nicht gab. Seither zeigen Kalender, Suche, Profil und ein Dutzend
 * andere denselben Satz zweimal.
 *
 * Die Trennlinie ist nicht „welche Datei", sondern **ob der Fehler überhaupt
 * über das Netz gegangen ist**:
 *
 *   hat eine `response`  -> der Server hat geantwortet, `http.service` hat es
 *                           schon gesagt. Inline wäre die Dopplung.
 *   hat keine            -> Validierung, ein Rechenfehler, ein `new Error()`
 *                           aus dem Panel selbst. Das hat keinen anderen
 *                           Kanal und MUSS inline stehen.
 *
 * Deshalb ein Helfer und keine zwölf umgebauten try/catch-Blöcke: die Regel
 * ist eine einzige, sie steht hier, und jede Inline-Anzeige stellt dieselbe
 * Frage.
 *
 * Ausnahme mit Absicht: `pages/login-signup` behält seine eigene Auswertung.
 * `messageFor` schweigt bei `auth/*` — ein falsches Passwort ist eine Antwort
 * und keine Störung — also gibt es dort keine Box, die doppeln könnte, und
 * das Formular ist die einzige Stelle, die es sagen kann.
 */
export function localErrorText(err){
    if(!err) return null
    // Ein Netzfehler ohne Antwort (Server aus, Kabel ab) ist ebenfalls schon
    // gemeldet — `messageFor` beantwortet ihn mit errors.offline.
    if(err.response || err.request || err.code === 'ERR_NETWORK') return null
    if(err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return null
    return err.message || String(err) || t('common.unknownError')
}
