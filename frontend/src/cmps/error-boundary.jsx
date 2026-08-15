import React from 'react'

/**
 * Faengt Fehler beim Rendern ab.
 *
 * Ohne so etwas reisst ein einziger kaputter Datensatz den kompletten
 * React-Baum ab und die Seite wird weiss — ohne jeden Hinweis, was los ist.
 * Mit Boundary bleibt der Rest der Anwendung stehen und man sieht, welcher
 * Bereich betroffen ist.
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
                <strong>{this.props.label || 'Dieser Bereich'} konnte nicht angezeigt werden.</strong>
                <div style={{ marginTop: 4, color: '#676879' }}>
                    Der Rest der Seite funktioniert weiter. Einzelheiten stehen in der Browser-Konsole.
                </div>
                <button type="button"
                    onClick={() => this.setState({ err: null })}
                    style={{
                        marginTop: 8, padding: '4px 10px', border: '1px solid #c3c6d4',
                        borderRadius: 4, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13,
                    }}>
                    Nochmal versuchen
                </button>
            </div>
        )
    }
}
