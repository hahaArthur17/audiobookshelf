const fs = require('fs'), path = require('path')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const dir = 'server/scanner'
let total = 0
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()) {
  const p = path.join(dir, f), sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.ES2022, true)
  const v = (n) => {
    if (ts.isAsExpression(n) && n.type.getText(sf) === 'Record<string, unknown>' ) {
      // outermost node of the cast (skip inner `as unknown`)
      let cast = n, inner = ts.isAsExpression(n.expression) && n.expression.type.kind === ts.SyntaxKind.UnknownKeyword ? n.expression.expression : n.expression
      let par = cast.parent; while (ts.isParenthesizedExpression(par)) par = par.parent
      let ctx = 'other'
      if (ts.isElementAccessExpression(par) && ts.isParenthesizedExpression(cast.parent) ) {
        const g = par.parent
        if (ts.isBinaryExpression(g) && g.left === par && g.operatorToken.kind === ts.SyntaxKind.EqualsToken) ctx = 'write'
        else if (ts.isBinaryExpression(g) && g.left === par) ctx = 'compound:' + ts.tokenToString(g.operatorToken.kind)
        else if (ts.isDeleteExpression(g)) ctx = 'delete'
        else ctx = 'read'
      }
      total++
      console.log(p + ':' + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1), ctx, ts.isAsExpression(n.expression) ? 'unk' : 'as', '|', par.getText(sf).replace(/\s+/g, ' ').slice(0, 110))
    }
    ts.forEachChild(n, v)
  }
  v(sf)
}
console.log('TOTAL', total)
