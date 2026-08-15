import {AiOutlinePlus} from 'react-icons/ai';
import {FiTrash} from 'react-icons/fi';
import {HiOutlineDocumentDuplicate} from 'react-icons/hi';
import {TbArrowsDiagonal} from 'react-icons/tb';
import {useSelector} from 'react-redux';
import {useNavigate} from 'react-router-dom';
import {boardService} from '../../services/board.service';
import {utilService} from '../../services/util.service';
import {duplicateTask, setDynamicModalObj, toggleModal, updateGroupAction} from '../../store/board.actions';
import {confirmDelete} from '../confirm-dialog';
import {t} from '../../i18n'

export function TaskMenuModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const isOpen = useSelector((storeState) => storeState.boardModule.isBoardModalOpen)
    const navigate = useNavigate()

    async function onRemoveTask(){
        const title = dynamicModalObj.task?.title
        if(!await confirmDelete({what: title?t('task.deleteName', {title}):t('task.thisTask')})) return
        try {
            const tasksToSave = dynamicModalObj.group.tasks.filter(task => task.id !== dynamicModalObj.task.id)
            const updatedGroup = {...dynamicModalObj.group, tasks: tasksToSave}
            updateGroupAction(board, updatedGroup)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('deleting a task failed', err)
        }
    }

    function onDuplicateTask(){
        try {
            duplicateTask(board, dynamicModalObj.group, dynamicModalObj.task)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log(err)
        }
    }

    function onCreateNewTaskBelow(){
        try {
            const newTask = boardService.getEmptyTask()
            newTask.id = utilService.makeId()
            newTask.title = 'New Task'
            const idx = dynamicModalObj.group.tasks.indexOf(dynamicModalObj.task)
            const updatedTasks = [...dynamicModalObj.group.tasks]
            updatedTasks.splice(idx + 1, 0, newTask)
            const updatedGroup = {...dynamicModalObj.group, tasks: updatedTasks}
            updateGroupAction(board, updatedGroup)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log(err)
        }
    }

    function onOpenModal(){
        navigate(`/board/${board._id}/${dynamicModalObj.group.id}/${dynamicModalObj.task.id}`)
        setDynamicModalObj({...dynamicModalObj, isOpen: false})
    }

    return (
        <section className="task-menu-modal">
            <div onClick={onOpenModal}>
                <TbArrowsDiagonal/>
                <span>{t('common.open')}</span>
            </div>
            <div onClick={onDuplicateTask}>
                <HiOutlineDocumentDuplicate/>
                <span>{t('common.duplicate')}</span>
            </div>
            <div onClick={() => onRemoveTask()}>
                <FiTrash/>
                <span>{t('common.delete')}</span>
            </div>
            <div onClick={onCreateNewTaskBelow}>
                <AiOutlinePlus/>
                <span>{t('task.newBelow')}</span>
            </div>
        </section>
    )
}