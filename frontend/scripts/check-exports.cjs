const {parse} = require('@babel/parser')
const fs = require('fs'), path = require('path')

const files = []
;(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name)
if(e.isDirectory()){if(e.name==='node_modules'||e.name.startsWith('_to_delete')||e.name==='vendor')continue;walk(p);continue}
if(/\.(jsx|js)$/.test(e.name))files.push(p)}})(process.argv[2] || 'src')

const ast = f => parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx']})
const exportsOf = new Map()

function collect(f){
    const out = new Set()
    let star = false
    for(const n of ast(f).program.body){
        if(n.type === 'ExportNamedDeclaration'){
            if(n.declaration){
                const d = n.declaration
                if(d.type === 'VariableDeclaration') d.declarations.forEach(x => x.id.name && out.add(x.id.name))
                else if(d.id) out.add(d.id.name)
            }
            n.specifiers.forEach(s => out.add(s.exported.name))
            if(n.source && !n.specifiers.length) star = true
        }
        if(n.type === 'ExportDefaultDeclaration') out.add('default')
        if(n.type === 'ExportAllDeclaration') star = true
    }
    return {out, star}
}
files.forEach(f => exportsOf.set(path.resolve(f), collect(f)))

const resolve = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec)
    for(const c of [base, base+'.js', base+'.jsx', path.join(base,'index.js'), path.join(base,'index.jsx')]){
        if(fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c)
    }
    return null
}

let bad = 0
for(const f of files){
    const abs = path.resolve(f)
    for(const n of ast(f).program.body){
        if(n.type !== 'ImportDeclaration') continue
        const spec = n.source.value
        if(!spec.startsWith('.')) continue
        const target = resolve(abs, spec)
        if(!target){ console.log(`MISSING      ${f}: ${spec}`); bad++; continue }
        const info = exportsOf.get(target)
        if(!info || info.star) continue
        for(const s of n.specifiers){
            if(s.type === 'ImportSpecifier' && !info.out.has(s.imported.name)){
                console.log(`NO EXPORT    ${f}: {${s.imported.name}} from ${spec}`); bad++
            }
            if(s.type === 'ImportDefaultSpecifier' && !info.out.has('default')){
                console.log(`NO DEFAULT   ${f}: from ${spec}`); bad++
            }
        }
    }
}
console.log(bad?`${bad} problem(s)`:'every named import exists')
