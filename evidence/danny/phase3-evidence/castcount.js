const fs = require('fs'), path = require('path')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const root = process.argv[2]
const only = process.argv.slice(3)
function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'libs' && e.name !== 'node_modules') walk(p, out) }
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p)
  }
}
let files = []
if (only.length) files = only.map((f) => path.join(root, f))
else { walk(path.join(root, 'server'), files); const i = path.join(root, 'index.ts'); if (fs.existsSync(i)) files.push(i) }
const tot = { as: 0, unk: 0, nn: 0 }
const tags = {}, targets = {}, untagged = []
for (const f of files.sort()) {
  const src = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true)
  const lines = src.split('\n')
  const c = { as: 0, unk: 0, nn: 0 }
  const tagOf = (node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
    for (let i = line; i >= Math.max(0, line - 60); i--) {
      const m = lines[i].match(/cast\(([a-e])\)/)
      if (m) return m[1]
      if (i < line && lines[i].trim() === '') break
    }
    untagged.push(path.relative(root, f) + ':' + (line + 1))
    return 'none'
  }
  const visit = (n) => {
    if (ts.isAsExpression(n)) {
      const t = n.type
      const isConst = ts.isTypeReferenceNode(t) && t.typeName.getText(sf) === 'const'
      const isInner = t.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(n.parent) && n.parent.expression === n
      if (!isConst && !isInner) {
        const outerUnknown = ts.isAsExpression(n.expression) && n.expression.type.kind === ts.SyntaxKind.UnknownKeyword
        if (outerUnknown) c.unk++; else c.as++
        const tag = tagOf(n)
        tags[tag] = (tags[tag] || 0) + 1
        const key = t.getText(sf).replace(/\s+/g, ' ')
        targets[key] = (targets[key] || 0) + 1
      }
    } else if (ts.isNonNullExpression(n)) c.nn++
    ts.forEachChild(n, visit)
  }
  visit(sf)
  tot.as += c.as; tot.unk += c.unk; tot.nn += c.nn
  console.log(path.relative(root, f), 'as=' + c.as, 'unknown_as=' + c.unk, 'nonnull=' + c.nn)
}
console.log('TOTAL files=' + files.length, 'as=' + tot.as, 'unknown_as=' + tot.unk, 'nonnull=' + tot.nn)
console.log('TAGS', JSON.stringify(tags))
console.log('TARGETS with count over 2:', Object.entries(targets).filter(([, v]) => v > 2).sort((a, b) => b[1] - a[1]).map(([k, v]) => v + ' ' + k).join(' | '))
console.log('UNTAGGED', untagged.length, untagged.slice(0, 20).join(' '))
