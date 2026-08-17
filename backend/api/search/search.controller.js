const searchService = require('./search.service')
const logger = require('../../services/logger.service')

module.exports = {
    search: async (req, res) => {
        try {
            res.json(await searchService.search(req.query.q, {type: req.query.type || 'all'}))
        } catch(err) {
            if(!err.status) logger.error('search failed', err)
            res.status(err.status || 500).send({err: err.status?err.message:'Suche fehlgeschlagen'})
        }
    }
}
