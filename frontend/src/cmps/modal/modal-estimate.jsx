import {useState} from 'react'

import {setDynamicModalObj} from '../../store/board.actions'
import {ESTIMATE_UNITS, splitEstimate, toMinutes} from '../task/estimate-picker'
import {t} from '../../i18n'

/**
 * Typing in an estimate: a number and the unit it is in.
 *
 * Two controls rather than one text field that parses "2h 30m". The parser
 * looks friendlier right up to the first person who writes "2 Std" in a
 * German interface and gets nothing, or "1.5d" and has to guess how long a
 * day is here. A number and three buttons cannot be misunderstood, and the
 * value that is stored is the same either way.
 *
 * The unit is only how it was typed. What is stored is minutes — see
 * estimate-picker.
 */
export function ModalEstimate({dynamicModalObj}){
    const task = dynamicModalObj.task
    const field = dynamicModalObj.field
    const start = splitEstimate(task?task[field]:0)
    const [amount, setAmount] = useState(start.amount === ''?'':String(start.amount))
    const [unit, setUnit] = useState(start.unit)
    const [err, setErr] = useState(null)

    function save(minutes){
        const activity = dynamicModalObj.activity
        if(activity) activity.to = minutes
        dynamicModalObj.onTaskUpdate(field, minutes === null?'':minutes, activity)
        setDynamicModalObj({...dynamicModalObj, isOpen: false})
    }

    function onSubmit(ev){
        ev.preventDefault()
        if(String(amount).trim() === '') return save(null)
        const minutes = toMinutes(amount, unit)
        if(minutes === null) return setErr(t('estimate.notANumber'))
        save(minutes)
    }

    return (
        <section className="modal-estimate">
            <form onSubmit={onSubmit}>
                <div className="modal-estimate-row">
                    <input className="modal-estimate-amount" type="text" inputMode="decimal"
                        autoFocus value={amount} placeholder={t('estimate.amount')}
                        onChange={ev => {
                            setErr(null)
                            setAmount(ev.target.value)
                        }}/>
                    <div className="modal-estimate-units">
                        {ESTIMATE_UNITS.map(u => (
                            <button type="button" key={u.key}
                                className={`modal-estimate-unit${u.key === unit?' is-active':''}`}
                                onClick={() => setUnit(u.key)}>
                                {t(`estimate.unit.${u.key}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {err && <p className="modal-estimate-err">{err}</p>}

                <div className="modal-estimate-tools">
                    {/* Clearing is its own button. Emptying the field and
                        pressing save does the same thing, but only if you
                        guess that it will. */}
                    <button type="button" className="modal-estimate-clear" onClick={() => save(null)}>
                        {t('estimate.clear')}
                    </button>
                    <button type="submit" className="modal-estimate-save">{t('common.save')}</button>
                </div>
            </form>
            <p className="modal-estimate-note">{t('estimate.dayNote')}</p>
        </section>
    )
}
