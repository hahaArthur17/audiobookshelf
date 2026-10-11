const { execFileSync } = require('child_process')
const path = require('path'); const fs = require('fs')
const repo = process.argv[2]; const verify = process.argv[3]
const ts = require(path.join(verify, 'node_modules', 'typescript')); const K = ts.SyntaxKind
const git = (...a) => execFileSync('git', ['-c', 'safe.directory=*', '-c', 'core.quotepath=off', '-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1e8 })
const runs = {}
for (const line of git('log', '--reverse', '--format=%h|%s', '9f4ff460..HEAD').trim().split('\n')) {
  const [h, s] = line.split('|'); const m = s.match(/^\[(PO-S\d+)\]/); if (!m) continue
  for (const l of git('diff', '--name-status', '-M30%', h + '^', h, '--', 'server').split('\n')) {
    if (l.startsWith('R')) { const to = l.split('\t')[2]; (runs[m[1]] = runs[m[1]] || []).push(to) }
  }
}
function count(file) {
  const text = fs.readFileSync(path.join(verify, file), 'utf8'); const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const c = { cast: 0, nonnull: 0, unknown: 0, indexsig: 0, require: 0, any: 0, declare: 0 }
  const isDoc = (n) => n.kind >= K.FirstJSDocNode && n.kind <= K.LastJSDocNode
  ;(function v(n) {
    if (isDoc(n)) return
    if (n.kind === K.AnyKeyword) c.any++
    if (n.kind === K.UnknownKeyword) c.unknown++
    if (ts.isAsExpression(n) && !(ts.isTypeReferenceNode(n.type) && n.type.typeName.text === 'const')) c.cast++
    if (ts.isTypeAssertionExpression(n)) c.cast++
    if (ts.isNonNullExpression(n)) c.nonnull++
    if (ts.isIndexSignatureDeclaration(n)) c.indexsig++
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require') c.require++
    if (ts.isPropertyDeclaration(n) && n.modifiers && n.modifiers.some((m) => m.kind === K.DeclareKeyword)) c.declare++
    ts.forEachChild(n, v)
  })(sf)
  return c
}
const tot = {}; const hot = []
console.log('run      files  cast nonnull unknown indexsig require any declare')
let all = { cast: 0, nonnull: 0, unknown: 0, indexsig: 0, require: 0, any: 0, declare: 0 }, nf = 0
for (const r of Object.keys(runs).sort()) {
  const t = { cast: 0, nonnull: 0, unknown: 0, indexsig: 0, require: 0, any: 0, declare: 0 }
  for (const f of runs[r]) { const c = count(f); for (const k in t) t[k] += c[k]; if (c.cast + c.nonnull >= 4) hot.push(r + ' ' + f.replace('server/', '') + ' cast ' + c.cast + ' nonnull ' + c.nonnull) }
  console.log(r.padEnd(8), String(runs[r].length).padEnd(6), String(t.cast).padEnd(5), String(t.nonnull).padEnd(7), String(t.unknown).padEnd(7), String(t.indexsig).padEnd(8), String(t.require).padEnd(7), String(t.any).padEnd(3), t.declare)
  for (const k in all) all[k] += t[k]; nf += runs[r].length
}
console.log('ALL      ' + String(nf).padEnd(6), String(all.cast).padEnd(5), String(all.nonnull).padEnd(7), String(all.unknown).padEnd(7), String(all.indexsig).padEnd(8), String(all.require).padEnd(7), String(all.any).padEnd(3), all.declare)
console.log('\nfiles with 4 or more casts/non-nulls:'); hot.forEach((h) => console.log('  ' + h))
