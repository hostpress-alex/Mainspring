import { useState } from 'react'
import { uploadService } from '../../services/upload.service'
import { GUEST_IMG } from '../../services/avatar'
import { t } from '../../i18n'
export function ImgUploader({ onUploaded = null }) {
  const [imgData, setImgData] = useState({
    imgUrl: null,
    height: 500,
    width: 500,
  })
  const [isUploading, setIsUploading] = useState(false)

  async function uploadImg(ev) {
    setIsUploading(true)
    const { secure_url, height, width } = await uploadService.uploadImg(ev)
    setImgData({ imgUrl: secure_url, width, height })
    setIsUploading(false)
    onUploaded && onUploaded(secure_url)
  }

  function getUploadLabel() {
    if (imgData.imgUrl) return t('profile.replacePicture')
    return isUploading ? t('update.uploading') : t('profile.uploadPicture')
  }

  // TODO: fix all
  return (
    <div className="upload-preview">
      <div className='img-picker'>
        {getUploadLabel()}
        <label htmlFor="imgUpload">
          {!imgData.imgUrl && <img className="GUEST_IMG-img" src={GUEST_IMG} style={{ maxWidth: '200px', float: 'right' }} alt="" />}
          {imgData.imgUrl && <img className="user-img" src={imgData.imgUrl} style={{ maxWidth: '100px', float: 'right' }} alt="" />}
        </label>
      </div>
      <input type="file" onChange={uploadImg} accept="img/*" id="imgUpload" />
    </div>
  )
}