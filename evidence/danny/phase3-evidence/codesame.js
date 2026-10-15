// usage: node codesame.js <base tree> <new tree> <dir that holds node_modules/typescript>
// Compares every .ts file under server/ (except server/libs) and index.ts of two source trees.
// A file "differs in code" when the TypeScript printer output (comments removed) differs.
// A comment-only batch must give 0 files that differ in code.
const fs = require('fs'), path = require('path')
const [a, b, tsDir] = process.argv.slice(2)
const ts = require(path.resolve(tsDir, 'node_modules/typescript'))
const printer = ts.createPrinter({ removeComments: true })
function walk(root, d, acc) {
  if (!fs.existsSync(d)) return acc
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'libs' && e.name !== 'node_modules') walk(root, p, acc) }
    else if (p.endsWith('.ts')) acc.push(path.relative(root, p))
  }
  return acc
}
const list = (root) => { const acc = walk(root, path.join(root, 'server'), []); if (fs.existsSync(path.join(root, 'index.ts'))) acc.push('index.ts'); return acc.sort() }
const la = list(a), lb = list(b)
const sa = new Set(la), sb = new Set(lb)
const norm = (p) => { const src = fs.readFileSync(p, 'utf8'); const sf = ts.createSourceFile(p, src, ts.ScriptTarget.ES2022, false, ts.ScriptKind.TS); return printer.printFile(sf).split('\n').filter((l) => l.trim() !== '').join('\n') }
let raw = 0, code = 0
const out = []
for (const f of la) if (!sb.has(f)) out.push('only in base: ' + f)
for (const f of lb) if (!sa.has(f)) out.push('only in new: ' + f)
for (const f of la) {
  if (!sb.has(f)) continue
  const ra = fs.readFileSync(path.join(a, f), 'utf8'), rb = fs.readFileSync(path.join(b, f), 'utf8')
  if (ra !== rb) raw++
  if (norm(path.join(a, f)) !== norm(path.join(b, f))) { code++; out.push('DIFFERS IN CODE: ' + f) }
}
out.push('files: ' + la.length + ' (base) / ' + lb.length + ' (new)')
out.push('files that differ in raw text: ' + raw)
out.push('files that differ in code (comments removed): ' + code)
console.log(out.join('\n'))
