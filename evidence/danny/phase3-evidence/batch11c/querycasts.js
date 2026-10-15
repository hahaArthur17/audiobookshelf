// AST search: casts (as / as unknown as) whose operand reads req.query (directly, or a local
// initialised from req.query / destructured from it, within the same function)
const fs = require('fs'), path = require('path')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const root = process.argv[2]
function walk(d, out) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'libs') walk(p, out) } else if (/\.(ts|js)$/.test(p) && !p.endsWith('.d.ts')) out.push(p) } return out }
const files = walk(path.join(root, 'server'), [])
const isReqQuery = (n) => ts.isPropertyAccessExpression(n) && n.name.text === 'query' && /^req$|^request$/.test(n.expression.getText())
for (const f of files.sort()) {
  const src = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true, f.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS)
  // collect names bound from req.query anywhere in the file
  const qnames = new Set()
  const collect = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer
      const fromQ = (e) => { let found = false; const v = (x) => { if (isReqQuery(x)) found = true; ts.forEachChild(x, v) }; v(e); return found }
      if (fromQ(init)) {
        if (ts.isIdentifier(n.name)) qnames.add(n.name.text)
        else if (ts.isObjectBindingPattern(n.name)) n.name.elements.forEach((el) => qnames.add(el.name.getText()))
      }
      // const { query: { a, b } } = req
      if (ts.isObjectBindingPattern(n.name) && /^req$/.test(init.getText())) {
        for (const el of n.name.elements) {
          if (el.propertyName && el.propertyName.getText() === 'query' && ts.isObjectBindingPattern(el.name)) el.name.elements.forEach((e2) => qnames.add(e2.name.getText()))
        }
      }
    }
    ts.forEachChild(n, collect)
  }
  collect(sf)
  const visit = (n) => {
    if (ts.isAsExpression(n) && !(ts.isAsExpression(n.parent) && n.parent.expression === n)) {
      let inner = n.expression
      while (ts.isAsExpression(inner) || ts.isParenthesizedExpression(inner)) inner = inner.expression
      let hit = null
      const v = (x) => { if (isReqQuery(x)) hit = 'req.query'; else if (ts.isIdentifier(x) && qnames.has(x.text) && !hit) hit = 'local ' + x.text; ts.forEachChild(x, v) }
      v(inner)
      if (isReqQuery(inner)) hit = 'req.query itself'
      if (hit) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        console.log(path.relative(root, f) + ':' + line, '|', hit, '|', n.getText(sf).replace(/\s+/g, ' ').slice(0, 120))
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
