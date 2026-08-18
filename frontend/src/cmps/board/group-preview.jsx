import {useState, useRef, useEffect, useMemo} from 'react'
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
import * as boardRoles from '../../services/board-roles'

import {TaskToolsModal} from '../modal/task-tools-modal'
import {TitleGroupPreview} from './title-group-preview'
import {SubtaskRows} from '../task/subtask-rows'
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
import {StatisticGroup} from './statistics-group'

import { Icon } from '../icon'
import {GUEST_IMG} from '../../services/avatar'
import {t} from '../../i18n'

export function GroupPreview({group, board, idx}){
    const [taskToEdit, setTaskToEdit] = useState(boardService.getEmptyTask())
    const [isTyping, setIsTyping] = useState(false)
    const [isTitleFocused, setIsTitleFocused] = useState(false)
    // Which tasks show their children. Open by id rather than a flag on the
    // task, so the board coming back from the server never closes a row the
    // person just opened.
    const [openSubtasks, setOpenSubtasks] = useState(() => new Set())

    /*
     * Three different questions, and they really are three — an editor may add
     * a group and change the ones they made, but not this one unless it is
     * theirs, and may work on every task in it either way.
     */
    const me = useSelector(storeState => storeState.userModule.user)
    const canManage = boardRoles.canManageGroup(board, me, group)
    const canWork = boardRoles.canEdit(board, me)

    function onToggleSubtasks(taskId){
        setOpenSubtasks(prev => {
            const next = new Set(prev)
            if(next.has(taskId)) next.delete(taskId)
            else next.add(taskId)
            return next
        })
    }
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

    /**
     * Tick a task off or on.
     *
     * By id, not by object. `includes` compares references and the row is
     * handed a fresh `{...task}` on every render, so the check never matched:
     * unticking fell into the "not selected yet" branch and added a SECOND
     * copy. Hence a toolbar that counted two after one tick and one untick and
     * never emptied.
     *
     * The old version also spliced the state array in place before setting it.
     * Both halves of the bug are the same mistake — treating a rendered copy
     * and a piece of state as things you can identify and edit directly.
     *
     * No history entry: the checkbox marks a task for the multi-select and
     * changes nothing on the task itself.
     */
    function handleCheckboxChange(task){
        const id = String(task.id)
        setSelectedTasks(prev => prev.some(selected => String(selected.id) === id)
            ?prev.filter(selected => String(selected.id) !== id)
            :[...prev, task])
    }

    function onClickMainCheckbox(){
        // Decided by what is actually selected, not by a flag remembered here.
        // The flag could disagree with the rows — tick every row by hand and it
        // still said "off", so the next click on the header ticked them all
        // again instead of clearing.
        const next = !isAllSelected
        // A copy of the list, never the array from the store: the selection is
        // filtered and rebuilt, and doing that to the store's array would edit
        // the board itself.
        setSelectedTasks(next?[...(group.tasks || [])]:[])
        setIsMainCheckbox({isActive: next})
    }

    // The header box follows the selection instead of remembering its own
    // state: ticking every row by hand should fill it, and unticking one
    // should empty it again.
    const selectedIds = useMemo(
        () => new Set(selectedTasks.map(task => String(task.id))), [selectedTasks])
    const isAllSelected = (group.tasks || []).length > 0
        && (group.tasks || []).every(task => selectedIds.has(String(task.id)))

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
                            {/* The whole menu is colour, symbol, duplicate and
                                delete — all of it the frame of the board. A
                                member has nothing to do in there. */}
                            <div className="group-menu" ref={elMainGroup}>
                                {canManage && <Icon name='ellipsis' className="icon" onClick={onToggleMenuModal}/>}
                            </div>
                            {/* Shown, not operated. Colour and symbol are both
                                changed from the group menu — a heading whose
                                every part does something different is a heading
                                you cannot click to rename. */}
                            <div className={`group-title-info flex align-center ${isTitleFocused?'showBorder':''} `} onFocus={() => setIsTitleFocused(true)} onBlur={() => setIsTitleFocused(false)}>
                                {group.icon && <span className="group-icon-static">{group.icon}</span>}
                                <blockquote ref={elTitle} className="group-title" contentEditable={canManage && isEditingTitle} suppressContentEditableWarning={true} onClick={() => canManage && setIsEditingTitle(true)} onBlur={(ev) => onSave(ev)}
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
                                                {canWork && <input type="checkbox" checked={isAllSelected} onChange={onClickMainCheckbox}/>}
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
                                        {/* Columns are the frame of the board,
                                            so this one really is owner-only. */}
                                        {boardRoles.isOwner(board, me) && (
                                            <div ref={elAddColumn} className="add-picker-task flex align-items" onClick={toggleColumnModal}>
                                                <span className={`add-btn ${getAddColumnClassName()?'active':''}`}>
                                                    <Icon name='plus' className={`${getAddColumnClassName()?'plus':'close'}`}/>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                }}
                            </Droppable>
                        </DragDropContext>
                        <Droppable droppableId={group.id} type="task">
                            {(droppableProvided) => (
                                <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps} >
                                    {group.tasks.map((task, idx) => {
                                        // The fallback used to end in Date.now(), so a task without
                                        // an id got a different one on every render — a new drag id
                                        // and a new React key each time.
                                        const taskId = task.id || `task-${idx}`
                                        return (
                                            <Draggable key={taskId} draggableId={taskId} index={idx}>
                                                {(provided) => (
                                                    <li ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                                                        <TaskPreview task={{
                                                            ...task,
                                                            id: taskId
                                                        }} group={group} board={board} widths={widths} handleCheckboxChange={handleCheckboxChange} isSelected={selectedIds.has(String(taskId))}
                                                                     isSubtasksOpen={openSubtasks.has(taskId)}
                                                                     onToggleSubtasks={() => onToggleSubtasks(taskId)}/>
                                                        {/* Inside the same li as the task: the children move with
                                                            their parent when the row is dragged, and they cannot
                                                            end up under a different task. */}
                                                        {openSubtasks.has(taskId) &&
                                                            <SubtaskRows task={task} group={group} board={board} widths={widths}
                                                                         handleCheckboxChange={handleCheckboxChange}
                                                                         selectedIds={selectedIds}/>}
                                                    </li>
                                                )}
                                            </Draggable>
                                        )
                                    })}
                                    {droppableProvided.placeholder}
                                    {canWork && <div className="add-task flex">
                                        <div className="sticky-div" style={{'--group-color': group.color}}>
                                            <div className="check-box add-task">
                                                <input type="checkbox" disabled/>
                                            </div>
                                            <form onSubmit={onAddTask} className="add-task-form flex align-center">
                                                <input type="text" name="title" value={taskToEdit.title} placeholder={t('task.add')} onChange={handleChange} onBlur={onAddTask}/>
                                            </form>
                                        </div>
                                        <div className="empty-div"></div>
                                    </div>}
                                </div>
                            )}
                        </Droppable>
                        <div className="statistic flex">
                            {/* Built from the same pieces as the header row and
                                with the same width, not from a number. It used
                                to be a `min-width: 375px` in the stylesheet
                                while everything above it followed the column
                                the person can drag — so the summary row lined
                                up only at the default width and slid out of
                                true the moment anybody resized the task
                                column. */}
                            <div className="sticky-div flex" style={{'--group-color': group.color}}>
                                <div className="hidden"></div>
                                <div className="check-box"></div>
                                <div className="task title" style={widthStyle(widthOf(widths, TASK_COLUMN))}></div>
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
        {/* Belt and braces. Without a tick box there can be no selection, so
            this should be unreachable for a viewer — but a toolbar of actions
            somebody may not carry out is exactly the thing not to leave to
            "should be". */}
        {canWork && selectedTasks.length > 0 &&
            <TaskToolsModal board={board} tasks={selectedTasks} group={group} setSelectedTasks={setSelectedTasks} setIsMainCheckbox={setIsMainCheckbox}/>}
    </ul>
}
