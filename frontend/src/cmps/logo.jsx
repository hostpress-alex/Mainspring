import { Link } from 'react-router-dom'
import { LogoMark } from './logo-mark'

/**
 * Bildmarke mit Schriftzug. Der Name steht bewusst an genau einer Stelle —
 * hier — damit ein spaeterer Wechsel nicht durch die halbe Anwendung geht.
 */
export const APP_NAME = 'myday'

export default function Logo () {
      return (
            <Link to={'/'} className='logo'>
                  <LogoMark className='logo-img' size={30} title={APP_NAME} />
                  <h2 className='logo-title'>{APP_NAME}</h2>
            </Link>
      )
}
