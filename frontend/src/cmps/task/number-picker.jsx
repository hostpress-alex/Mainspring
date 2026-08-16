import {useState} from 'react'
import { Icon } from '../icon'
import {boardService} from '../../services/board.service'

export function NumberPicker({info, onUpdate, field = 'number'}){
    const [number, setNumber] = useState(info[field] || '')
    const [isShowInput, setIsShowInput] = useState(false)
    const activity = boardService.getEmptyActivity()

    activity.action = 'number'
    activity.from = info[field] || '-'
    activity.task = {id: info.id, title: info.title}

    function handleNumberChange({target}){
        setNumber((target.value))
    }

    function onSave(){
        console.log('number:', number)
        if(activity.from === '-' && !number){
            setIsShowInput(false)
            return
        }
        activity.to = number
        onUpdate('number', parseInt(number), activity)
    }

    function onClearNumber(){
        setNumber('')
        activity.to = '-'
        onUpdate('number', '', activity)
    }

    return (
        <section className="number-picker picker">
            {(!number && !isShowInput) &&
                <span onClick={() => setIsShowInput(true)} className="add-number-icons"><Icon name='circle-plus' className="plus-icon"/><Icon name='hashtag'/></span>}
            {(number || isShowInput) &&
                <>
                    <input type="number" name="number" value={number} onChange={handleNumberChange} onBlur={onSave}/>
                    <span className="clear-input" onClick={onClearNumber}><Icon name='xmark'/></span>
                </>
            }
        </section>
    )
}