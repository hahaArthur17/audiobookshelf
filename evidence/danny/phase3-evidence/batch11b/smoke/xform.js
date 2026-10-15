const fs = require('fs')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const files = process.argv.slice(2)
for (const p of files) {
  let src = fs.readFileSync(p, 'utf8'), reads = 0, writes = 0
  for (;;) {
    const sf = ts.createSourceFile(p, src, ts.ScriptTarget.ES2022, true)
    const sites = []
    const v = (n) => {
      if (ts.isElementAccessExpression(n) && ts.isParenthesizedExpression(n.expression) && ts.isAsExpression(n.expression.expression) && n.expression.expression.type.getText(sf) === 'Record<string, unknown>') sites.push(n)
      ts.forEachChild(n, v)
    }
    v(sf)
    // innermost: a site with no other site inside it
    const site = sites.find((s) => !sites.some((o) => o !== s && o.getStart(sf) >= s.getStart(sf) && o.end <= s.end))
    if (!site) break
    const cast = site.expression.expression
    let obj = cast.expression
    if (ts.isAsExpression(obj) && obj.type.kind === ts.SyntaxKind.UnknownKeyword) obj = obj.expression
    const objText = obj.getText(sf), keyText = site.argumentExpression.getText(sf)
    const parent = site.parent
    let start, end, text
    if (ts.isBinaryExpression(parent) && parent.left === site && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (!ts.isExpressionStatement(parent.parent)) throw new Error('write not a statement ' + p + ' ' + parent.getText(sf))
      start = parent.getStart(sf); end = parent.end
      text = `setKey(${objText}, ${keyText}, ${parent.right.getText(sf)})`
      writes++
    } else {
      if (ts.isBinaryExpression(parent) && parent.left === site && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) throw new Error('compound assign ' + p)
      if (ts.isCallExpression(parent) && parent.expression === site) throw new Error('method call ' + p)
      if (ts.isDeleteExpression(parent) || ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent) || (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.InKeyword)) throw new Error('special ' + p + ' ' + parent.getText(sf))
      start = site.getStart(sf); end = site.end
      text = `getKey(${objText}, ${keyText})`
      reads++
    }
    src = src.slice(0, start) + text + src.slice(end)
  }
  fs.writeFileSync(p, src)
  console.log(p, 'reads', reads, 'writes', writes)
}
