import React from 'react'
import { t } from '../i18n'

/**
 * Catches errors during rendering.
 *
 * Without something like this a single broken record tears down the entire
 * React tree and the page turns white — with no hint at all as to what is
 * going on. With a boundary the rest of the application stays up and you can
 * see which area is affected.
 */
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { err: null }
    }

    static getDerivedStateFromError(err) {
        return { err }
    }

    componentDidCatch(err, info) {
        console.error('Fehler in', this.props.label || 'einem Bereich', err, info)
    }

    render() {
        if (!this.state.err) return this.props.children
        return (
            <div className="error-boundary">
                <strong>{t('common.areaFailed', { area: this.props.label || t('common.thisArea') })}</strong>
                <div className="error-boundary-hint">
                    {t('common.areaFailedHint')}
                </div>
                <button type="button"
                    onClick={() => this.setState({ err: null })}
                    className="error-boundary-retry">
                    {t('common.retry')}
                </button>
            </div>
        )
    }
}
