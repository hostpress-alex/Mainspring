/**
 * Temporal-dead-zone check inside function bodies.
 *
 * The old check only knew one shape: a module-level object referring to const
 * arrows declared further down. It could not see the shape that actually took
 * the board page down —
 *
 *     const [id, setId] = useState(() => read(boardId))   // <- here
 *     const {boardId} = useParams()                       // <- declared below
 *
 * The reference sits inside an arrow function, which normally means "later,
 * not now" and is perfectly legal. But that arrow is an ARGUMENT to a call on
 * the same line, so it runs immediately, and `boardId` is a const that has not
 * been reached yet: ReferenceError, and in React a white page.
 *
 * So: descend into nested functions only where they are call arguments or
 * called on the spot. A handler stored for later is left alone — that is the
 * legal case and flagging it would drown the real one in noise.
 */
const {parse} = require('@babel/parser')
const fs = require('fs'), path = require('path')

const files = []
;(function walk(d){
    for(const e of fs.readdirSync(d, {withFileTypes: true})){
        const p = path.join(d, e.name)
        if(e.isDirectory()){
            if(['node_modules', 'vendor', 'dist', '_to_delete'].includes(e.name)) continue
            walk(p); continue
        }
        if(/\.(jsx|js)$/.test(e.name)) files.push(p)
    }
})(process.argv[2] || 'src')

const FN = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']
const isFn = n => n && FN.includes(n.type)

/** Every name a pattern binds: {a, b: [c]} -> a, c */
function namesOf(node, out = []){
    if(!node) return out
    switch(node.type){
        case 'Identifier': out.push(node.name); break
        case 'ObjectPattern': node.properties.forEach(p =>
            namesOf(p.type === 'RestElement'?p.argument:p.value, out)); break
        case 'ArrayPattern': node.elements.forEach(e => namesOf(e, out)); break
        case 'AssignmentPattern': namesOf(node.left, out); break
        case 'RestElement': namesOf(node.argument, out); break
    }
    return out
}

const children = node => Object.keys(node)
    .filter(k => k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments')
    .flatMap(k => {
        const v = node[k]
        if(Array.isArray(v)) return v.filter(x => x && typeof x.type === 'string')
        return (v && typeof v.type === 'string')?[v]:[]
    })

let found = 0

function checkScope(body, file, src){
    // What this scope declares with const/let, and where.
    const decls = new Map()
    for(const st of body){
        if(st.type !== 'VariableDeclaration' || st.kind === 'var') continue
        for(const d of st.declarations) for(const n of namesOf(d.id)) decls.set(n, st.start)
    }
    if(!decls.size) return

    // Names bound by a nested scope shadow ours and must not be reported.
    function scan(node, shadowed, immediate){
        if(!node) return
        if(node.type === 'Identifier'){
            const at = decls.get(node.name)
            if(at !== undefined && !shadowed.has(node.name) && node.start < at && immediate){
                const line = src.slice(0, node.start).split('\n').length
                console.log(`  TDZ  ${file}:${line}  '${node.name}' is read before its own line`)
                found++
            }
            return
        }
        // Not references: property names, keys, import/export names.
        if(node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression'){
            scan(node.object, shadowed, immediate)
            if(node.computed) scan(node.property, shadowed, immediate)
            return
        }
        // A nested block declares its own const/let. Those are different
        // bindings with the same name, and reading them is not a TDZ hit.
        if(node.type === 'BlockStatement'){
            const inner = new Set(shadowed)
            for(const st of node.body){
                if(st.type === 'VariableDeclaration' && st.kind !== 'var'){
                    st.declarations.forEach(d => namesOf(d.id).forEach(n => inner.add(n)))
                }
            }
            for(const c of children(node)) scan(c, inner, immediate)
            return
        }
        if(node.type === 'ObjectProperty'){
            if(node.computed) scan(node.key, shadowed, immediate)
            scan(node.value, shadowed, immediate)
            return
        }
        if(node.type === 'JSXAttribute'){ scan(node.value, shadowed, immediate); return }
        if(node.type === 'VariableDeclarator'){
            // The declared name itself is not a read of it.
            scan(node.init, shadowed, immediate)
            return
        }
        if(isFn(node)){
            const inner = new Set([...shadowed, ...node.params.flatMap(p => namesOf(p))])
            if(node.id) inner.add(node.id.name)
            // A nested function only matters here if it runs at once.
            for(const c of children(node)) scan(c, inner, immediate && node.__runsNow === true)
            return
        }
        if(node.type === 'CallExpression' || node.type === 'NewExpression'){
            node.arguments.forEach(a => { if(isFn(a)) a.__runsNow = true })
            if(isFn(node.callee)) node.callee.__runsNow = true
        }
        for(const c of children(node)) scan(c, shadowed, immediate)
    }

    body.forEach(st => scan(st, new Set(), true))
}

function visit(node, file, src){
    if(!node) return
    if(node.type === 'Program') checkScope(node.body, file, src)
    if(isFn(node) && node.body && node.body.type === 'BlockStatement') checkScope(node.body.body, file, src)
    for(const c of children(node)) visit(c, file, src)
}

for(const f of files){
    const src = fs.readFileSync(f, 'utf8')
    let ast
    try { ast = parse(src, {sourceType: 'module', plugins: ['jsx']}) } catch(e) { continue }
    visit(ast.program, f, src)
}
console.log(found?`${found} finding(s)`:'  no TDZ access')
