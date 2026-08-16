import {matchMembers} from '../../services/mention'

/**
 * The bridge between tiptap's suggestion plugin and React.
 *
 * The plugin is not a React thing: it calls `onStart`, `onUpdate`, `onKeyDown`
 * and `onExit` on a plain object and expects synchronous answers — `onKeyDown`
 * in particular has to say TRUE OR FALSE right there, because that is what
 * decides whether Enter picks a name or posts the comment.
 *
 * So the list state lives in React and this only pushes into it. The current
 * items and the highlighted index are kept in a ref as well, because the
 * keyboard handler cannot wait for a re-render to know what is selected.
 */
export function createMentionBridge({getMembers, setState, stateRef}){
    return {
        items({query}){
            return matchMembers(getMembers(), query).slice(0, 8)
        },

        render(){
            return {
                onStart(props){
                    stateRef.current = {items: props.items, index: 0, command: props.command}
                    setState({items: props.items, index: 0, rect: props.clientRect?.() || null})
                },

                onUpdate(props){
                    // The index is reset rather than kept: after another
                    // letter the list is a different list, and holding the old
                    // position means Enter picks whoever happens to be third.
                    stateRef.current = {items: props.items, index: 0, command: props.command}
                    setState({items: props.items, index: 0, rect: props.clientRect?.() || null})
                },

                onKeyDown(props){
                    const state = stateRef.current
                    if(!state || !state.items.length) return false
                    const key = props.event.key

                    if(key === 'ArrowDown'){
                        state.index = (state.index + 1) % state.items.length
                        setState(prev => ({...prev, index: state.index}))
                        return true
                    }
                    if(key === 'ArrowUp'){
                        state.index = (state.index - 1 + state.items.length) % state.items.length
                        setState(prev => ({...prev, index: state.index}))
                        return true
                    }
                    if(key === 'Enter' || key === 'Tab'){
                        const member = state.items[state.index]
                        if(!member) return false
                        state.command({id: String(member._id), label: member.fullname})
                        return true
                    }
                    if(key === 'Escape'){
                        stateRef.current = null
                        setState(null)
                        return true
                    }
                    return false
                },

                onExit(){
                    stateRef.current = null
                    setState(null)
                }
            }
        }
    }
}
