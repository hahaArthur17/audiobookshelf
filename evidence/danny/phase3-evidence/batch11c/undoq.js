// Undo check: turn optionalString(x) / requiredString(x) / isNaNArgument(x) back into x and drop
// the queryValue require and destructuring lines, then compare with the baseline build.
const fs = require('fs'), path = require('path')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const [a, b, ...files] = process.argv.slice(2)
const printer = ts.createPrinter({ removeComments: true })
const NAMES = new Set(['optionalString', 'requiredString', 'isNaNArgument'])
const undo = (ctx) => (sf) => {
  const v = (n) => {
    n = ts.visitEachChild(n, v, ctx)
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && NAMES.has(n.expression.text) && n.arguments.length === 1) return n.arguments[0]
    return n
  }
  return ts.visitNode(sf, v)
}
const norm = (p, doUndo) => {
  let sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.ES2022, true)
  if (doUndo) sf = ts.transform(sf, [undo]).transformed[0]
  const txt = printer.printFile(sf)
  return printer.printFile(ts.createSourceFile(p, txt, ts.ScriptTarget.ES2022, true)).split('\n').filter((l) => l.trim() !== '' && !/^const queryValue = require\(/.test(l) && !/^const \{ [\w, ]+ \} = queryValue;$/.test(l))
}
for (const p of files) {
  const la = norm(path.join(a, p), false), lb = norm(path.join(b, p), true)
  const same = la.join('\n') === lb.join('\n')
  console.log(p, same ? 'IDENTICAL after undo' : 'DIFFERS')
  if (!same) for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { console.log(' a:', la[i]); console.log(' b:', lb[i]); break }
}
