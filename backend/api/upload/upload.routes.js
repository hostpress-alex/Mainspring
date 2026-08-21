const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const fileService = require('../../services/file.service')
const {uploadFile, serveFile} = require('./upload.controller')

const router = express.Router()

router.use(requireAuth)

// Raw bytes instead of multipart: no extra package needed, and the browser can
// send a File or Blob object (including one from the clipboard) directly.
//
// type: '*/*' is deliberate. This used to hold the list of allowed MIME types
// — and then Express simply dropped the body for everything else, so the
// server reported "empty file" instead of "file type not allowed". Worse:
// browsers often send application/octet-stream for Office files, which never
// arrived at all. Which types are really allowed is file.service's decision
// — the size limit applies here, before it.
router.post('/', express.raw({
    type: '*/*',
    limit: fileService.MAX_BYTES
}), uploadFile)

router.get('/:id', serveFile)

module.exports = router
