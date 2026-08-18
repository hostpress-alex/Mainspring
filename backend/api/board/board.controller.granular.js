/**
 * Controller fuer die gezielten Schreibvorgaenge.
 *
 * Alle geben das frische Board zurueck: der Schreibvorgang ist granular (nur
 * das geaenderte Feld wandert in die Datenbank), das Lesen danach ist billig
 * und haelt das Frontend einfach.
 */
const boardService = require('./board.service')
const logger = require('../../services/logger.service')

function fail(res, err, fallback){
    if(!err.status) logger.error(fallback, err)
    res.status(err.status || 500).send({err: err.status?err.message:fallback})
}

const handler = (fn, fallback) => async(req, res) => {
    try {
        res.json(await fn(req))
    } catch(err) {
        fail(res, err, fallback)
    }
}

module.exports = {
    /* ------------------------------------------ Gespeicherte Filter -- */

    getViews: handler(req =>
        boardService.views(req.params.boardId), 'Ansichten konnten nicht geladen werden'),

    postView: handler(req =>
        boardService.addView(req.params.boardId, req.body), 'Ansicht konnte nicht gespeichert werden'),

    putView: handler(req =>
        boardService.updateView(req.params.boardId, req.params.viewId, req.body),
        'Ansicht konnte nicht gespeichert werden'),

    deleteView: handler(req =>
        boardService.removeView(req.params.boardId, req.params.viewId),
        'Ansicht konnte nicht geloescht werden'),

    /* ---------------------------------------- Papierkorb und Archiv -- */

    putBoardState: handler(req =>
        boardService.setBoardState(req.params.boardId, req.body.state),
        'Zustand konnte nicht geaendert werden'),

    putGroupState: handler(req =>
        boardService.setGroupState(req.params.boardId, req.params.groupId, req.body.state),
        'Zustand konnte nicht geaendert werden'),

    putTaskState: handler(req =>
        boardService.setTaskState(req.params.boardId, req.params.taskId, req.body.state),
        'Zustand konnte nicht geaendert werden'),

    getBin: handler(req =>
        boardService.bin(req.params.boardId, req.query.state || 'trashed'),
        'Papierkorb konnte nicht geladen werden'),

    getBoardsInState: handler(req =>
        boardService.boardsInState(req.query.state || 'trashed'),
        'Papierkorb konnte nicht geladen werden'),

    purgeBoard: handler(req =>
        boardService.purgeBoard(req.params.boardId), 'Board konnte nicht geloescht werden'),

    purgeGroup: handler(req =>
        boardService.purgeGroup(req.params.boardId, req.params.groupId), 'Gruppe konnte nicht geloescht werden'),

    purgeTask: handler(req =>
        boardService.purgeTask(req.params.boardId, req.params.taskId), 'Task konnte nicht geloescht werden'),

    patchBoard: handler(req =>
        boardService.updateMeta(req.params.boardId, req.body), 'Board konnte nicht geaendert werden'),

    putColumns: handler(req =>
        boardService.setColumns(req.params.boardId, req.body.columns), 'Spalten konnten nicht gespeichert werden'),

    putMembers: handler(req =>
        boardService.setMembers(req.params.boardId, req.body.members), 'Mitglieder konnten nicht gespeichert werden'),

    putOwners: handler(req =>
        boardService.setOwners(req.params.boardId, req.body.ownerIds), 'Owner konnten nicht gespeichert werden'),

    postGroup: handler(req =>
        boardService.addGroup(req.params.boardId, req.body.group, req.body.index ?? null), 'Gruppe konnte nicht angelegt werden'),

    patchGroup: handler(req =>
        boardService.updateGroupMeta(req.params.boardId, req.params.groupId, req.body), 'Gruppe konnte nicht geaendert werden'),

    putGroup: handler(req =>
        boardService.replaceGroup(req.params.boardId, req.params.groupId, req.body.group), 'Gruppe konnte nicht gespeichert werden'),

    deleteGroup: handler(req =>
        boardService.removeGroup(req.params.boardId, req.params.groupId), 'Gruppe konnte nicht geloescht werden'),

    putGroupOrder: handler(req =>
        boardService.reorderGroups(req.params.boardId, req.body.groupIds), 'Reihenfolge konnte nicht gespeichert werden'),

    postTask: handler(req =>
        boardService.addTask(req.params.boardId, req.params.groupId, req.body.task, req.body.index ?? null), 'Task konnte nicht angelegt werden'),

    /* A subtask is a task, so it is only created and reordered through routes
       of its own. Changing and deleting one goes through the ordinary task
       routes — the service finds a subtask there as well. */
    postSubtask: handler(req =>
        boardService.addSubtask(req.params.boardId, req.params.groupId, req.params.taskId,
            req.body.task, req.body.index ?? null), 'Subtask konnte nicht angelegt werden'),

    /* Both directions: a body without parentId promotes back to a task. */
    putTaskParent: handler(req =>
        boardService.setTaskParent(req.params.boardId, req.params.groupId, req.params.taskId,
            req.body.parentId ?? null, req.body.index ?? null), 'Task konnte nicht umgehaengt werden'),

    putMemberRole: handler(req =>
        boardService.setMemberRole(req.params.boardId, req.params.userId, req.body.role),
        'Rolle konnte nicht geaendert werden'),

    putSubtaskOrder: handler(req =>
        boardService.reorderSubtasks(req.params.boardId, req.params.groupId, req.params.taskId,
            req.body.taskIds), 'Reihenfolge konnte nicht gespeichert werden'),

    patchTask: handler(req =>
        boardService.updateTaskFields(req.params.boardId, req.params.groupId, req.params.taskId, req.body), 'Task konnte nicht geaendert werden'),

    putTask: handler(req =>
        boardService.replaceTask(req.params.boardId, req.params.groupId, req.params.taskId, req.body.task), 'Task konnte nicht gespeichert werden'),

    deleteTask: handler(req =>
        boardService.removeTask(req.params.boardId, req.params.groupId, req.params.taskId), 'Task konnte nicht geloescht werden'),

    putTaskOrder: handler(req =>
        boardService.reorderTasks(req.params.boardId, req.params.groupId, req.body.taskIds), 'Reihenfolge konnte nicht gespeichert werden'),

    postTaskMove: handler(req =>
        boardService.moveTask(req.params.boardId, req.body.fromGroupId, req.body.toGroupId,
            req.params.taskId, req.body.index ?? null), 'Task konnte nicht verschoben werden'),

    postActivity: handler(req =>
        boardService.addActivity(req.params.boardId, req.body.activity), 'Aktivitaet konnte nicht gespeichert werden')
}
