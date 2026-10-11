const fs = require('fs'), path = require('path')
const root = process.argv[2]
const files = []
;(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'libs' && e.name !== 'test') walk(p) } else if (p.endsWith('.js')) files.push(p) } })(path.join(root, 'server'))
files.push(path.join(root, 'index.js'))
const resolve = (from, req) => { const b = path.resolve(path.dirname(from), req); for (const c of [b, b + '.js', path.join(b, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; return null }
const g = {}
for (const f of files) { g[f] = []; const t = fs.readFileSync(f, 'utf8'); for (const m of t.matchAll(/require\((['"])(\.[^'"]+)\1\)/g)) { const r = resolve(f, m[2]); if (r && r.startsWith(root) && !r.includes(path.sep + 'libs' + path.sep)) g[f].push(r) } }
// Tarjan SCC
let idx = 0; const st = [], on = new Set(), index = {}, low = {}, sccs = []
function sc(v) { index[v] = low[v] = idx++; st.push(v); on.add(v); for (const w of g[v] || []) { if (index[w] === undefined) { sc(w); low[v] = Math.min(low[v], low[w]) } else if (on.has(w)) low[v] = Math.min(low[v], index[w]) } if (low[v] === index[v]) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w) } while (w !== v); if (c.length > 1) sccs.push(c) } }
Object.keys(g).forEach((v) => { if (index[v] === undefined) sc(v) })
const rel = (p) => path.relative(root, p).replace(/\\/g, '/')
console.log('modules:', files.length, ' require-cycles (groups of modules that require each other):', sccs.length)
const inCycle = new Set(); sccs.forEach((c) => c.forEach((m) => inCycle.add(rel(m))))
console.log('modules inside a cycle:', inCycle.size)
const targets = process.argv.slice(3)
console.log('replaced-export modules inside a cycle:')
let n = 0; targets.forEach((t) => { if (inCycle.has(t)) { console.log('  ' + t); n++ } }); if (!n) console.log('  none')
fs.writeFileSync(process.argv[2] + '/../audit/cycle-modules.txt', [...inCycle].sort().join('\n') + '\n')
