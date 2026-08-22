/**
 * Which columns a Kanban card shows.
 *
 * A card is not a table row lying on its side. The table can afford twenty
 * columns because they are columns; a card has to be readable at a glance in a
 * stack of thirty, and every field on it costs height that the next card
 * pays for.
 *
 * The choice is per column, stored as `onCard` in `board_column.settings`.
 * That bag is free JSON both ways — `board.repo` writes every key it does not
 * recognise into it and spreads it back on the way out — so this needed no
 * migration, no endpoint and no validation: it rides the ordinary column write.
 *
 * Everything here is pure and knows nothing about React.
 */

/**
 * What a board shows before anybody has decided.
 *
 * Not "everything that has a value", which is what the card did before and is
 * how a card ends up eleven lines tall. These three are what a Kanban is read
 * for: how urgent, how far along, by when. Order matters — it is the order
 * they appear in on the card.
 */
export const CARD_DEFAULT_TYPES = ['priority', 'status', 'deadline']

/**
 * Has anybody made a choice on this board?
 *
 * `onCard === false` counts as a choice, and that is the point: switching the
 * last column off has to leave the card empty rather than snapping back to the
 * default, which would look like the click did nothing.
 */
export const hasCardChoice = board =>
    (board?.columns || []).some(column => column && column.onCard !== undefined)

/**
 * The columns for the card, in board order.
 *
 * Board order, not the order of CARD_DEFAULT_TYPES, once somebody has chosen:
 * the columns are already arranged in the table, and a card that reorders them
 * behind your back is a card you cannot compare with the row.
 */
export function cardColumns(board){
    const columns = (board?.columns || []).filter(Boolean)
    if(hasCardChoice(board)) return columns.filter(column => column.onCard === true)

    // The default, in the order the three types are named above — there is no
    // choice to respect yet, and "urgent, how far, by when" reads better than
    // whatever order the board happens to have.
    const out = []
    for(const type of CARD_DEFAULT_TYPES){
        const found = columns.find(column => column.type === type)
        if(found) out.push(found)
    }
    return out
}

/** Is this column currently drawn on the card? Used by the column menu. */
export function isOnCard(board, column){
    if(!column) return false
    return cardColumns(board).some(other => other.id === column.id)
}

/**
 * The same list with one column flipped.
 *
 * The first flip has to freeze what is on screen, or it is a surprise: on a
 * board that never chose, switching one column ON would otherwise drop the
 * other two defaults at the same moment. So every column gets an explicit
 * `onCard` the first time anybody touches any of them.
 */
export function toggledCardColumns(board, columnId){
    const columns = (board?.columns || []).filter(Boolean)
    const shown = new Set(cardColumns(board).map(column => column.id))
    return columns.map(column => ({
        ...column,
        onCard: column.id === columnId?!shown.has(column.id):shown.has(column.id)
    }))
}
