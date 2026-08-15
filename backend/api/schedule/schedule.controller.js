const scheduleService = require('./schedule.service')
const logger = require('../../services/logger.service')

function fail(res, err, fallback) {
    if (!err.status) logger.error(fallback, err)
    res.status(err.status || 500).send({ err: err.status ? err.message : fallback })
}

async function getEntries(req, res) {
    try {
        res.json(await scheduleService.query({ from: req.query.from, to: req.query.to }))
    } catch (err) { fail(res, err, 'Kalender konnte nicht geladen werden') }
}

async function addEntry(req, res) {
    try {
        res.json(await scheduleService.add(req.body))
    } catch (err) { fail(res, err, 'Eintrag konnte nicht angelegt werden') }
}

async function updateEntry(req, res) {
    try {
        res.json(await scheduleService.update(req.params.id, req.body))
    } catch (err) { fail(res, err, 'Eintrag konnte nicht gespeichert werden') }
}

async function removeEntry(req, res) {
    try {
        res.send({ _id: await scheduleService.remove(req.params.id) })
    } catch (err) { fail(res, err, 'Eintrag konnte nicht geloescht werden') }
}

module.exports = { getEntries, addEntry, updateEntry, removeEntry }
