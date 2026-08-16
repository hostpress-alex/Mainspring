import {useState, useRef, useEffect} from 'react'
import {useSelector} from 'react-redux'
import {DragDropContext, Draggable, Droppable} from '@hello-pangea/dnd'

import {TaskPreview} from '../task/task-preview'
import {
    addTask,
    updateGroupAction,
    setDynamicModalObj,
    updateBoardColumns,
    loadBoard
} from '../../store/board.actions'
import {boardService} from '../../services/board.service'

import {TaskToolsModal} from '../modal/task-tools-modal'
import {TitleGroupPreview} from './title-group-preview'
import {AddColumnDialog} from '../modal/add-column-dialog'
import {singleLineEditable} from '../../services/editable'
import {
    useColumnWidths,
    setWidth,
    commitWidths,
    widthOf,
    widthStyle,
    MIN_WIDTH,
    MAX_WIDTH,
    TASK_COLUMN
} from './column-width'
import {isCollapsed, toggleCollapsed} from './group-collapse'
import './board-columns.css'
import {StatisticGroup} from './statistics-group'

import { Icon } from '../icon'
import {GUEST_IMG} from '../../services/avatar'
import {t} from '../../i18n'

export function GroupPreview({group, board, idx}){
    const [taskToEdit, setTaskToEdit] = useState(boardService.getEmptyTask())
    const [isTyping, setIsTyping] = useState(false)
    const [isShowColorPicker, setIsShowColorPicker] = useState(false)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [collapsed, setCollapsed] = useState(() => isCollapsed(board._id, group.id))
    const elTitle = useRef()
    const [selectedTasks, setSelectedTasks] = useState([])
    const [isMainCheckbox, setIsMainCheckbox] = useState({isActive: false})
    const [isAddColumnOpen, setIsAddColumnOpen] = useState(false)
    const widths = useColumnWidths(board._id)
    const [resizing, setResizing] = useState(null)

    useEffect(() => {
        setCollapsed(isCollapsed(board._id, group.id))
    }, [board._id, group.id])

    /** Fold the group away. The arrow is the only handle — the rest of the
     *  header is the drag handle, so the click must not travel further up. */
    function onToggleCollapse(ev){
        ev.stopPropagation()
        ev.preventDefault()
        setCollapsed(toggleCollapsed(board._id, group.id))
    }

    /**
     * The title only becomes editable once it is actually being edited.
     *
     * A permanently contentEditable heading acts as a caret magnet: clicking
     * the blank space between two groups has no text of its own, so the
     * browser puts the caret in the nearest editable text it can find — the
     * heading below — and the group jumped into edit mode from a click far
     * above it. Measured with caretRangeFromPoint: editable heading, the caret
     * lands in it from 50 px away; plain heading, it does not.
     */
    useEffect(() => {
        if(!isEditingTitle || !elTitle.current) return
        const el = elTitle.current
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)                       // caret at the end, nothing selected
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
    }, [isEditingTitle])

    /** Drag the width: live while moving, saved on release. */
    function onStartResize(ev, column){
        ev.preventDefault()
        ev.stopPropagation()
        setResizing({id: column.id, startX: ev.clientX, startWidth: widthOf(widths, column)})
    }

    useEffect(() => {
        if(!resizing) return
        document.body.classList.add('is-col-resizing')

        function onMove(ev){
            const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizing.startWidth + (ev.clientX - resizing.startX)))
            setWidth(board._id, resizing.id, next)
        }

        function onUp(){
            commitWidths(board._id)
            setResizing(null)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            document.body.classList.remove('is-col-resizing')
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [resizing, board._id])

    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const user = useSelector(storeState => storeState.userModule.user)

    // Only owners and admins may change the column order.
    const canReorderColumns = boardService.canManageMembers(board, user)
    const elMainGroup = useRef()
    const elAddColumn = useRef()

    const columns = board.columns || []

    async function onAddColumn(column){
        setIsAddColumnOpen(false)
        try {
            await updateBoardColumns(board, [...columns, column])
            loadBoard(board._id)
        } catch(err) {
            console.log('creating a column failed', err)
        }
    }

    async function onRenameColumn(column, title){
        try {
            await updateBoardColumns(board, columns.map(c => c.id === column.id?{...c, title}:c))
            loadBoard(board._id)
        } catch(err) {
            console.log('renaming a column failed', err)
        }
    }

    function onToggleMenuModal(){
        const isOpen = dynamicModalObj?.group?.id === group.id && dynamicModalObj?.type === 'menu-group'?!dynamicModalObj.isOpen:true
        const {x, y, height, width} = elMainGroup.current.getClientRects()[0]
        setDynamicModalObj({isOpen, pos: {x: (x + width / 2), y: (y + height)}, type: 'menu-group', group: group})
    }

    function onTogglePalette(){
        const isOpen = dynamicModalObj?.group?.id === group.id && dynamicModalObj?.type === 'palette-modal'?!dynamicModalObj.isOpen:true
        const {x, y, height, width} = elMainGroup.current.getClientRects()[0]
        setDynamicModalObj({isOpen, pos: {x: (x + width / 2), y: (y + height)}, type: 'palette-modal', group: group})
    }

    function toggleColumnModal(){
        setIsAddColumnOpen(open => !open)
    }

    async function onSave(ev){
        const value = ev.target.innerText
        setIsEditingTitle(false)
        if(value === group.title){
            setIsTyping(false)
            setIsShowColorPicker(false)
            return
        }
        group.title = value
        try {
            await updateGroupAction(board, group)
            setIsTyping(false)
            setIsShowColorPicker(false)
        } catch(err) {
            console.log('saving a group failed', err)
        }
    }

    function handleChange({target}){
        let {value, name: field} = target
        setTaskToEdit((prevTask) => ({...prevTask, [field]: value}))
    }

    function onAddTask(ev){
        ev.preventDefault()
        if(!taskToEdit.title) return
        const activity = boardService.getEmptyActivity()
        activity.from = {color: group.color, title: group.title}
        activity.action = 'create'
        taskToEdit.updatedBy.date = Date.now()
        taskToEdit.updatedBy.imgUrl = user?.imgUrl || GUEST_IMG
        addTask(taskToEdit, group, board, activity)
        setTaskToEdit(boardService.getEmptyTask())
    }

    function handleHorizontalDrag(ev){
        if(!ev.destination) return
        if(!canReorderColumns) return
        const next = [...columns]
        const [dragged] = next.splice(ev.source.index, 1)
        next.splice(ev.destination.index, 0, dragged)
        updateBoardColumns(board, next).then(() => loadBoard(board._id))
    }

    async function handleCheckboxChange(task){
        try {
            // Deliberately without a history entry: the checkbox marks a task
            // only for the multi-select and changes nothing on the task itself.
            if(selectedTasks.includes(task)){
                selectedTasks.splice(selectedTasks.indexOf(task), 1)
                setSelectedTasks((selectedTasks) => ([...selectedTasks]))
            } else {
                setSelectedTasks((prevTasks) => ([...prevTasks, task]))
            }
        } catch(err) {
            console.log('err:', err)
        }
    }

    function onClickMainCheckbox(){
        if(isMainCheckbox.isActive) setSelectedTasks([])
        else setSelectedTasks(group.tasks)
        setIsMainCheckbox({isActive: !isMainCheckbox.isActive})
    }

    function getSumOfTasks(){
        const sum = group.tasks.length
        return sum?t('task.count', {n: sum}):t('task.none')
    }

    function getAddColumnClassName(){
        return dynamicModalObj.isOpen === true && dynamicModalObj.type === 'add-column' && dynamicModalObj?.group?.id === group.id
    }

    return <ul className={`group-preview flex column${collapsed?' is-collapsed':''}`}>
        <Draggable key={group.id} draggableId={group.id} index={idx}>
            {(provided) => {
                return <div ref={provided.innerRef}
                            {...provided.draggableProps}>
                    <div {...provided.dragHandleProps} className={`group-header flex align-center${!board.description?' not-des':''}${collapsed?' is-collapsed':''}`} style={{'--group-color': group.color}}>
                        <div className="group-header-title flex align-center">
                            {collapsed
                                ?
                                <Icon name='chevron-right' className="arrow-icon" onClick={onToggleCollapse} title={t('group.expand')}/>
                                :
                                <Icon name='chevron-down' className="arrow-icon" onClick={onToggleCollapse} title={t('group.collapse')}/>}
                            <div className="group-menu" ref={elMainGroup}>
                                <Icon name='ellipsis' className="icon" onClick={onToggleMenuModal}/>
                            </div>
                            <div className={`group-title-info flex align-center ${isShowColorPicker?'showBorder':''} `} onFocus={() => setIsShowColorPicker(true)}>
                                {isShowColorPicker && <Icon name='circle' onClick={onTogglePalette}/>}
                                <blockquote ref={elTitle} className="group-title" contentEditable={isEditingTitle} suppressContentEditableWarning={true} onClick={() => setIsEditingTitle(true)} onBlur={(ev) => onSave(ev)}
                                            {...singleLineEditable({onFocus: () => setIsTyping(true)})}>
                                    <h4>{group.title}</h4>
                                </blockquote>
                                {!isTyping && <span className="task-count flex align-center">{getSumOfTasks()}</span>}
                            </div>
                        </div>
                    </div>
                    {collapsed &&
                        <div className="group-collapsed-bar" onClick={onToggleCollapse} style={{'--group-color': group.color}}>
                            {t('task.count', {n: (group.tasks || []).length})}
                        </div>}
                    {!collapsed && <div className="group-preview-content">
                        <DragDropContext onDragEnd={handleHorizontalDrag}>
                            <Droppable droppableId="title" direction="horizontal">
                                {(droppableProvided) => {
                                    return <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps} className={`title-container flex ${!board.description?' not-des':''}`}>
                                        <div className="sticky-div titles flex" style={{'--group-color': group.color}}>
                                            <div className="hidden"></div>
                                            <div className="check-box">
                                                <input type="checkbox" checked={isMainCheckbox.isActive} onChange={onClickMainCheckbox}/>
                                            </div>
                                            <div className="task title" style={widthStyle(widthOf(widths, TASK_COLUMN))}>
                                                <span className="col-label">{t('task.task')}</span>
                                                <span className={`col-resizer${resizing?.id === TASK_COLUMN.id?' is-active':''}`} title={t('column.dragWidth')} onMouseDown={ev => onStartResize(ev, TASK_COLUMN)}/>
                                            </div>
                                        </div>
                                        {columns.map((column, idx) =>
                                            <Draggable key={column.id} draggableId={column.id} index={idx} isDragDisabled={!canReorderColumns}>
                                                {(provided) => (
                                                    <li ref={provided.innerRef}
                                                        {...provided.draggableProps} style={{...provided.draggableProps.style, ...widthStyle(widthOf(widths, column))}} className={`${column.type}-picker cmp-order-title title`}>
                                                        {/* Only the title is the handle for reordering — otherwise
                                                            the width grabber would trigger a column drag at the same time. */}
                                                        <span className="col-drag" {...provided.dragHandleProps}>
                                                            <TitleGroupPreview column={column} group={group} board={board} onRename={onRenameColumn}/>
                                                        </span>
                                                        <span className={`col-resizer${resizing?.id === column.id?' is-active':''}`} title={t('column.dragWidth')} onMouseDown={ev => onStartResize(ev, column)}/>
                                                    </li>
                                                )}
                                            </Draggable>
                                        )}
                                        <div ref={elAddColumn} className="add-picker-task flex align-items" onClick={toggleColumnModal}>
                                            <span className={`add-btn ${getAddColumnClassName()?'active':''}`}>
                                                <Icon name='plus' className={`${getAddColumnClassName()?'plus':'close'}`}/>
                                            </span>
                                        </div>
                                    </div>
                                }}
                            </Droppable>
                        </DragDropContext>
                        <Droppable droppableId={group.id} type="task">
                            {(droppableProvided) => (
                                <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps} >
                                    {group.tasks.map((task, idx) => {
                                        const taskId = task.id || `task-${idx}-${Date.now()}`
                                        return (
                                            <Draggable key={taskId} draggableId={taskId} index={idx}>
                                                {(provided) => (
                                                    <li ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                                                        <TaskPreview task={{
                                                            ...task,
                                                            id: taskId
                                                        }} group={group} board={board} widths={widths} handleCheckboxChange={handleCheckboxChange} isMainCheckbox={isMainCheckbox}/>
                                                    </li>
                                                )}
                                            </Draggable>
                                        )
                                    })}
                                    {droppableProvided.placeholder}
                                    <div className="add-task flex">
                                        <div className="sticky-div" style={{'--group-color': group.color}}>
                                            <div className="check-box add-task">
                                                <input type="checkbox" disabled/>
                                            </div>
                                            <form onSubmit={onAddTask} className="add-task-form flex align-center">
                                                <input type="text" name="title" value={taskToEdit.title} placeholder={t('task.add')} onChange={handleChange} onBlur={onAddTask}/>
                                            </form>
                                        </div>
                                        <div className="empty-div"></div>
                                    </div>
                                </div>
                            )}
                        </Droppable>
                        <div className="statistic flex">
                            <div className="sticky-container">
                                <div className="hidden"></div>
                            </div>
                            <div className="statistic-container flex">
                                {columns.map((column, idx) => (
                                    <div key={column.id} style={widthStyle(widthOf(widths, column))} className={`title ${idx === 0?' first ':''}${column.type}-picker`}>
                                        <StatisticGroup column={column} board={board} group={group}/>
                                    </div>
                                ))}
                            </div>
                            <div className="empty-div"></div>
                        </div>
                    </div>}
                </div>
            }}
        </Draggable>
        {isAddColumnOpen && (
            <AddColumnDialog existingTitles={(board.columns || []).map(c => c.title)} onAdd={onAddColumn} onClose={() => setIsAddColumnOpen(false)}/>
        )}
        {selectedTasks.length > 0 &&
            <TaskToolsModal board={board} tasks={selectedTasks} group={group} setSelectedTasks={setSelectedTasks} setIsMainCheckbox={setIsMainCheckbox}/>}
    </ul>
}
