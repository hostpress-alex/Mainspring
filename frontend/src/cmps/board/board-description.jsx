import {useEffect, useState} from 'react'

import { Icon } from '../icon'
import {loadBoards, updateBoardMeta} from '../../store/board.actions';
import {utilService} from '../../services/util.service';
import { Avatar } from '../avatar'
import {singleLineEditable} from '../../services/editable'
import {RichTextEditor} from '../rich-text/rich-text-editor'
import {t} from '../../i18n'

export function BoardDescription({setIsShowDescription, board}){
    const [description, setDescription] = useState(board.description || '')

    // Another board opened behind this dialog — follow it rather than keep
    // showing the previous text.
    useEffect(() => {
        setDescription(board.description || '')
    }, [board._id])

    /**
     * The description is saved when the editor loses focus, not on every
     * keystroke. Saving per keystroke would be one request per letter, and
     * the board answer would arrive back mid-typing.
     */
    async function onSaveDescription(){
        if(description === (board.description || '')) return
        try {
            await updateBoardMeta(board._id, {description})
            loadBoards()
        } catch(err) {
            console.error('saving the description failed', err)
        }
    }

    async function onSave(ev){
        let value = ev.target.innerText
        const key = ev.target.id
        if(value === '' && key === 'title') value = board.title
        if(value === board[key]) return
        board[key] = value
        try {
            // Only send that one field, not the whole board.
            await updateBoardMeta(board._id, {[key]: value})
            loadBoards()
        } catch(err) {
            console.log('saving failed')
        }
    }

    return (
        <section className="board-description-modal flex">
            <div className="close-btn">
                <Icon name='xmark' onClick={() => setIsShowDescription(false)}/>
            </div>
            <div className="board-edit flex column">
                <div className="board-edit-title">
                    <blockquote onBlur={onSave} id="title" contentEditable suppressContentEditableWarning={true}
                                {...singleLineEditable()}>
                        <h1>{board.title}</h1>
                    </blockquote>
                </div>
                <div className="board-edit-description" onBlur={onSaveDescription}>
                    <RichTextEditor
                        value={description}
                        members={board.members}
                        placeholder={t('board.descriptionPlaceholder')}
                        onChange={setDescription}
                    />
                </div>
            </div>
            <div className="board-info flex column">
                <span className="title">{t('board.info')}</span>
                <div className="workspace-info">
                    <span className="header">{t('board.workspace')}</span>
                    <div className="workspace-details flex">
                        <span className="lightning-container">
                            <Icon name='bolt'/>
                        </span>
                        <span className="workspace-name">{t('board.workspaceName')}</span>
                    </div>
                </div>
                <div className="created-by">
                    <span className="header">{t('board.createdAt')}</span>
                    <div className="created-by-details flex">
                        <Avatar src={board.createdBy.imgUrl} alt=""/>
                        <span className="date">{utilService.getFormattedDate(board.archivedAt)}</span>
                    </div>
                </div>
                <div className="owners">
                    <span className="header">{t('board.owner')}</span>
                    <div className="owners-details">
                        <Avatar src={board.createdBy.imgUrl} alt=""/>
                        <span className="owner-name">{board.createdBy.fullname}</span>
                    </div>
                </div>
                <div className="board-type">
                    <span className="header">{t('board.type')}</span>
                    <div className="board-details flex">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" clipRule="evenodd" d="M7.5 4.5H16C16.2761 4.5 16.5 4.72386 16.5 5V15C16.5 15.2761 16.2761 15.5 16 15.5H7.5L7.5 4.5ZM6 4.5H4C3.72386 4.5 3.5 4.72386 3.5 5V15C3.5 15.2761 3.72386 15.5 4 15.5H6L6 4.5ZM2 5C2 3.89543 2.89543 3 4 3H16C17.1046 3 18 3.89543 18 5V15C18 16.1046 17.1046 17 16 17H4C2.89543 17 2 16.1046 2 15V5Z" fill="currentColor"/>
                        </svg>
                        <span>{t('board.visibility')}</span>
                    </div>
                </div>
            </div>
        </section>
    )
}