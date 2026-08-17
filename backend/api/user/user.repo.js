/**
 * Storage access for users.
 */
const crypto = require('crypto')
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)
// Gleiche Form wie die alte ObjectId, damit bestehende Links und die
// Verweise in board_member unveraendert weiterfunktionieren.
const newUserId = () => crypto.randomBytes(12).toString('hex')

function out(row){
    if(!row) return null
    return {
        _id: row.id,
        username: row.username,
        password: row.password,
        fullname: row.fullname,
        imgUrl: row.img_url || '',
        isAdmin: !!row.is_admin,
        // 'active' or 'inactive'. A closed account keeps everything it wrote;
        // it just cannot be signed into any more.
        state: row.state || 'active',
        // '' means the person never chose one — the browser decides.
        language: row.language || '',
        createdAt: row.created_at
    }
}

const COLUMNS = {
    username: 'username',
    state: 'state',
    password: 'password',
    fullname: 'fullname',
    imgUrl: 'img_url',
    isAdmin: 'is_admin',
    language: 'language'
}

function toRow(user){
    const row = {}
    for(const [key, column] of Object.entries(COLUMNS)){
        if(user[key] === undefined) continue
        row[column] = key === 'isAdmin'?!!user[key]:(user[key] === null?'':String(user[key]))
    }
    return row
}

/**
 * Everyone, closed accounts included.
 *
 * Deliberately everyone: this is what the display resolves names against, and
 * an update written by somebody who has since left still has to say who wrote
 * it. Lists that people pick FROM ask for active ones — see `query`.
 */
async function findAll(){
    return (await db()('user').orderBy('fullname')).map(out)
}

/** Turn an account off, or back on. Nothing is deleted. */
async function setState(userId, state){
    await db()('user').where({id: sid(userId)}).update({state, state_at: Date.now()})
}

async function query(filterBy = {}){
    let q = db()('user')
    // Closed accounts are out unless somebody asks for them by name — the
    // administration does, every picker in the application does not.
    if(!filterBy.withInactive) q = q.where('state', 'active')
    if(filterBy.txt){
        const needle = String(filterBy.txt).toLowerCase().replace(/[%_\\]/g, ch => '\\' + ch)
        q = q.where(function(){
            this.whereRaw('LOWER(username) LIKE ?', ['%' + needle + '%']).orWhereRaw('LOWER(fullname) LIKE ?', ['%' + needle + '%'])
        })
    }
    return (await q.orderBy('fullname')).map(out)
}

async function findById(userId){
    return out(await db()('user').where({id: sid(userId)}).first())
}

async function findByUsername(username){
    return out(await db()('user').where({username: sid(username)}).first())
}

async function insert(user){
    const given = sid(user._id)
    const id = /^[a-f0-9]{24}$/i.test(given)?given.toLowerCase():newUserId()
    await db()('user').insert({id, ...toRow(user), created_at: new Date()})
    return await findById(id)
}

async function updateFields(userId, patch){
    const row = toRow(patch || {})
    if(!Object.keys(row).length) return
    await db()('user').where({id: sid(userId)}).update(row)
}

async function deleteById(userId){
    await db()('user').where({id: sid(userId)}).del()
}

module.exports = {findAll, query, findById, findByUsername, insert, updateFields, deleteById, setState}
