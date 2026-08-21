/**
 * Assigns ownerless boards to a user and makes sure every owner is a member
 * as well.
 *
 *   OWNER=alex npm run claim:boards
 *     - boards without an owner  -> <OWNER> becomes the owner
 *     - owners are always recorded as members too
 *
 *   OWNER=alex ALL=true npm run claim:boards
 *     - additionally rewrites EVERY board onto <OWNER>
 *
 *
 * The move from the old single ownerId field to ownerIds happens on read and in
 * the migration to MariaDB by now; what is left for this script are the boards
 * that belong to nobody.
 */
const boardRepo = require('../api/board/board.repo')
const userRepo = require('../api/user/user.repo')

const sid = v => (v === undefined || v === null)?'':String(v)

async function main(){
    const username = process.env.OWNER
    const all = process.env.ALL === 'true'
    if(!username){
        console.error('Fehlt: OWNER=<username> setzen.')
        process.exit(1)
    }

    const user = await userRepo.findByUsername(username)
    if(!user){
        console.error(`Benutzer "${username}" existiert nicht. Erst npm run seed:admin ausfuehren.`)
        process.exit(1)
    }
    const uid = sid(user._id)

    // Read as an admin, otherwise only one's own boards are visible.
    const boards = await boardRepo.findForUser({_id: uid, isAdmin: true}, {})
    if(!boards.length){
        console.log('Keine Boards gefunden.')
        return
    }

    const allUsers = await userRepo.findAll()
    const userById = new Map(allUsers.map(u => [sid(u._id), u]))
    const entryFor = id => {
        const u = userById.get(id)
        return u?{_id: id, fullname: u.fullname, imgUrl: u.imgUrl || ''}
            :{_id: id, fullname: 'Unbekannt', imgUrl: ''}
    }

    let touched = 0
    for(const b of boards){
        const boardId = sid(b._id)
        const currentOwners = (b.ownerIds || []).map(sid)
        const ownerIds = all?[uid]:(currentOwners.length?currentOwners:[uid])

        const members = (b.members || []).filter(Boolean).map(m => ({
            _id: sid(m._id), fullname: m.fullname || '', imgUrl: m.imgUrl || ''
        }))
        const memberIds = members.map(m => m._id)
        const added = []
        for(const oid of ownerIds){
            if(memberIds.includes(oid)) continue
            members.unshift(entryFor(oid))
            memberIds.push(oid)
            added.push((userById.get(oid) || {}).fullname || oid)
        }

        const ownersUnchanged = currentOwners.length === ownerIds.length
            && currentOwners.every((v, i) => v === ownerIds[i])
        if(ownersUnchanged && !added.length) continue

        // Members first, owners second: an owner has to be a member.
        if(added.length) await boardRepo.setMembers(boardId, members)
        if(!ownersUnchanged) await boardRepo.setOwners(boardId, ownerIds)

        const names = ownerIds.map(id => (userById.get(id) || {}).fullname || id).join(', ')
        console.log(`  ${b.title} -> Owner: ${names}${added.length?` (als Mitglied ergaenzt: ${added.join(', ')})`:''}`)
        touched++
    }
    console.log(touched?`${touched} Board(s) angepasst.`:'Alles schon aktuell.')
}

async function closeAll(){
    try {
        await require('../db/knex').destroy()
    } catch(err) { /* kein MariaDB im Spiel */
    }
}

main().then(async() => {
    await closeAll();
    process.exit(0)
}).catch(async err => {
    console.error('claim-boards fehlgeschlagen:', err);
    await closeAll();
    process.exit(1)
})
