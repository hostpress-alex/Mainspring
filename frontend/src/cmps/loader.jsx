import loader from '../assets/img/loader.gif'
import { t } from '../i18n'
export function Loader() {


  return <div className="loader-container">
    <img className="loader" src={loader} alt={t('common.loading')} />
  </div>
}