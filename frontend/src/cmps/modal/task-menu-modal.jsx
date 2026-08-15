import { AiOutlinePlus } from "react-icons/ai";
import { FiTrash } from "react-icons/fi";
import { HiOutlineDocumentDuplicate } from "react-icons/hi";
import { TbArrowsDiagonal } from "react-icons/tb";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { boardService } from "../../services/board.service";
import { utilService } from "../../services/util.service";
import { duplicateTask, setDynamicModalObj, toggleModal, updateGroupAction } from "../../store/board.actions";
import { confirmDelete } from "../confirm-dialog";

export function TaskMenuModal({ dynamicModalObj }) {
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const isOpen = useSelector((storeState) => storeState.boardModule.isBoardModalOpen)
    const navigate = useNavigate()
    async function onRemoveTask() {
        const titel = dynamicModalObj.task?.title
        if (!await confirmDelete({ was: titel ? `Der Task „${titel}"` : 'Dieser Task' })) return
        try {
            const tasksToSave = dynamicModalObj.group.tasks.filter(task => task.id !== dynamicModalObj.task.id)
            const updatedGroup = { ...dynamicModalObj.group, tasks: tasksToSave }
            updateGroupAction(board, updatedGroup)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log('Task konnte nicht gelöscht werden', err)
        }
    }

    function onDuplicateTask() {
        try {
            duplicateTask(board, dynamicModalObj.group, dynamicModalObj.task)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log(err)
        }
    }

    function onCreateNewTaskBelow() {
        try {
            const newTask = boardService.getEmptyTask()
            newTask.id = utilService.makeId()
            newTask.title = 'New Task'
            const idx = dynamicModalObj.group.tasks.indexOf(dynamicModalObj.task)
            const updatedTasks = [...dynamicModalObj.group.tasks]
            updatedTasks.splice(idx + 1, 0, newTask)
            const updatedGroup = { ...dynamicModalObj.group, tasks: updatedTasks }
            updateGroupAction(board, updatedGroup)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log(err)
        }
    }
    
    function onOpenModal() {
        navigate(`/board/${board._id}/${dynamicModalObj.group.id}/${dynamicModalObj.task.id}`)
        setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
    }
    return (
        <section className="task-menu-modal">
            <div onClick={onOpenModal}>
                <TbArrowsDiagonal />
                <span>Öffnen</span>
            </div>
            <div onClick={onDuplicateTask}>
                <HiOutlineDocumentDuplicate />
                <span>Duplizieren</span>
            </div>
            <div onClick={() => onRemoveTask()}>
                <FiTrash />
                <span>Löschen</span>
            </div>
            <div onClick={onCreateNewTaskBelow}>
                <AiOutlinePlus />
                <span>Neuen Task darunter</span>
            </div>
        </section>
    )
}