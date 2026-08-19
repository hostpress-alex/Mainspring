import {render, screen} from '@testing-library/react'
import {StatisticGroup} from '../cmps/board/statistics-group'

const mockBoard = {
    '_id': 'b101',
    'labels': [
        {
            'id': 'l101',
            'title': 'Done',
            'color': '#00c875'
        },
        {
            'id': 'l102',
            'title': 'Progress',
            'color': '#fdab3d'
        },
        {
            'id': 'l103',
            'title': 'Stuck',
            'color': '#e2445c'
        },
        {
            'id': 'l104',
            'title': 'Low',
            'color': '#ffcb00'
        },
        {
            'id': 'l105',
            'title': 'Medium',
            'color': '#a25ddc'
        },
        {
            'id': 'l106',
            'title': 'High',
            'color': '#e2445c'
        },
        {
            'id': 'l107',
            'title': '',
            'color': '#c4c4c4'
        }
    ],
    'members': [
        {
            'id': 'm101',
            'fullname': 'Tal Tarablus',
            'imgUrl': 'https://res.cloudinary.com/du63kkxhl/image/upload/v1673788222/cld-sample.jpg'
        }
    ],
    'groups': [{
        'id': 'g101',
        'title': 'Group 1',
        'archivedAt': 1589983468418,
        'tasks': [
            {
                'id': 'c101',
                'title': 'Replace logo',
                'status': 'Stuck',
                'priority': 'Medium',
                'memberIds': ['m101', 'm102', 'm103'],
                'dueDate': 1615621,
                'number': 10
            },
            {
                'id': 'c102',
                'title': 'Add Samples',
                'status': 'Done',
                'priority': 'Low',
                'memberIds': ['m101'],
                'dueDate': 16156211111,
                'number': 20
            }
        ],
        'color': '#66ccff'
    }
    ],
    'activities': []
}

// The summary row takes the whole column now, not a picker name. It reads
// `column.type` to decide what to count and `column.field` to know where the
// value sits — the same two questions every other cell asks. The tests below
// kept passing `cmpType={'number-picker'}` after that change, so `column` was
// undefined, every switch fell to the default, and the component rendered
// nothing. Both tests then failed on "no such element", which reads like a
// broken component and was a stale test.
const numberColumn = {id: 'col-num', type: 'number', field: 'number'}
const statusColumn = {id: 'col-status', type: 'status', field: 'status'}
const personColumn = {id: 'col-person', type: 'person', field: 'memberIds'}

describe('statistics context', () => {

    it('test number statistic', () => {
        render(<StatisticGroup column={numberColumn} group={mockBoard.groups[0]} board={mockBoard}/>)
        const divEl = screen.getByRole('contentinfo')
        expect(divEl).toBeInTheDocument()
        expect(divEl).toHaveTextContent(/30/)
    })

    it('status statistic labels', () => {
        render(<StatisticGroup column={statusColumn} group={mockBoard.groups[0]} board={mockBoard}/>)
        const spanElements = screen.getAllByTestId(/label/)
        const firstSpanElement = screen.getByTestId('label-0')
        expect(spanElements.length).toBe(2)
        expect(firstSpanElement).toHaveStyle('width: 50%')
    })

    it('counts nothing for a person column', () => {
        const {asFragment} = render(
            <StatisticGroup column={personColumn} group={mockBoard.groups[0]} board={mockBoard}/>)
        expect(asFragment()).toMatchInlineSnapshot(`<DocumentFragment />`)
    })

    it('stays empty for a column type that has no summary', () => {
        const {asFragment} = render(
            <StatisticGroup column={{id: 'col-txt', type: 'text', field: 'title'}}
                group={mockBoard.groups[0]} board={mockBoard}/>)
        expect(asFragment()).toMatchInlineSnapshot(`<DocumentFragment />`)
    })

    it('survives a column that is not there', () => {
        // The board renders this row before the columns have arrived.
        const {asFragment} = render(
            <StatisticGroup group={mockBoard.groups[0]} board={mockBoard}/>)
        expect(asFragment()).toMatchInlineSnapshot(`<DocumentFragment />`)
    })
})
