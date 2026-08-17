/**
 * The automation endpoints.
 *
 * Thin on purpose: every rule about who may do what lives in
 * automation.service, which the socket layer and the tests reach the same way.
 */
const automationService = require('./automation.service')
const logger = require('../../services/logger.service')

const handler = (fn, fallback) => async (req, res) => {
    try {
        res.json(await fn(req))
    } catch(err){
        if(!err.status) logger.error(fallback, err)
        res.status(err.status || 500).send({err: err.status?err.message:fallback})
    }
}

module.exports = {
    list: handler(req => automationService.list(req.params.boardId),
        'Automatisierungen konnten nicht geladen werden'),

    runs: handler(req => automationService.runs(req.params.boardId, req.query.limit),
        'Verlauf konnte nicht geladen werden'),

    create: handler(req => automationService.create(req.params.boardId, req.body),
        'Automatisierung konnte nicht angelegt werden'),

    update: handler(req => automationService.update(req.params.id, req.body),
        'Automatisierung konnte nicht gespeichert werden'),

    remove: handler(async req => {
        await automationService.remove(req.params.id)
        return {ok: true}
    }, 'Automatisierung konnte nicht geloescht werden')
}
