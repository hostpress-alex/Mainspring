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
            <div style={{
                padding: '12px 14px', margin: '8px 0', borderRadius: 6,
                background: '#fff4f5', border: '1px solid #f0c2c9',
                color: '#a3283a', fontSize: 13, lineHeight: 1.5,
            }}>
                <strong>{t('common.areaFailed', { area: this.props.label || t('common.thisArea') })}</strong>
                <div style={{ marginTop: 4, color: '#676879' }}>
                    {t('common.areaFailedHint')}
                </div>
                <button type="button"
                    onClick={() => this.setState({ err: null })}
                    style={{
                        marginTop: 8, padding: '4px 10px', border: '1px solid #c3c6d4',
                        borderRadius: 4, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13,
                    }}>
                    {t('common.retry')}
                </button>
            </div>
        )
    }
}
