// Inlines the local aliases `const NAME = <expr>` (NAME in the list) back into their uses in the same block
// and drops the declaration; prints the result (comments and blank lines removed)
const fs = require('fs'), ts = require(process.argv[2] + '/typescript')
const NAMES = new Set(['book', 'podcast', 'validCoverResult', 'scanResultValues'])
let sf = ts.createSourceFile('x.js', fs.readFileSync(process.argv[3], 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
const tr = (ctx) => (root) => {
  const visitBlock = (n, env) => {
    if (ts.isBlock(n)) {
      const env2 = new Map(env); const stmts = []
      for (const st of n.statements) {
        if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
          const d = st.declarationList.declarations[0]
          if (ts.isIdentifier(d.name) && NAMES.has(d.name.text) && d.initializer) { env2.set(d.name.text, sub(d.initializer, env2)); continue }
        }
        stmts.push(sub(st, env2))
      }
      return ts.factory.updateBlock(n, stmts)
    }
    return ts.visitEachChild(n, (c) => visitBlock(c, env), ctx)
  }
  const sub = (n, env) => {
    if (ts.isBlock(n)) return visitBlock(n, env)
    if (ts.isIdentifier(n) && env.has(n.text) && !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) return env.get(n.text)
    return ts.visitEachChild(n, (c) => sub(c, env), ctx)
  }
  return visitBlock(root, new Map())
}
sf = ts.transform(sf, [tr]).transformed[0]
const p = ts.createPrinter({ removeComments: true })
const txt = p.printFile(ts.createSourceFile('x.js', p.printFile(sf), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS))
process.stdout.write(txt.split('\n').filter((l) => l.trim() !== '').join('\n') + '\n')
