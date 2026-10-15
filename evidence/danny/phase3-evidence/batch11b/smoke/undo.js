const fs = require('fs'), path = require('path')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const [a, b] = process.argv.slice(2)
const printer = ts.createPrinter({ removeComments: true })
const f = ts.factory
const undo = (ctx) => (sf) => {
  const v = (n) => {
    n = ts.visitEachChild(n, v, ctx)
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text
      if (name === 'getKey') return f.createElementAccessExpression(n.arguments[0], n.arguments[1])
      if (name === 'setKey') return f.createAssignment(f.createElementAccessExpression(n.arguments[0], n.arguments[1]), n.arguments[2])
    }
    return n
  }
  return ts.visitNode(sf, v)
}
const norm = (p, doUndo) => {
  let sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.ES2022, true)
  if (doUndo) sf = ts.transform(sf, [undo]).transformed[0]
  // reprint and reparse so printing is uniform
  const txt = printer.printFile(sf)
  return printer.printFile(ts.createSourceFile(p, txt, ts.ScriptTarget.ES2022, true)).split('\n').filter((l) => l.trim() !== '' && !/dynamicKey/.test(l) && !/^const \{ (getKey|setKey|getKey, setKey) \} = /.test(l))
}
for (const file of ['AbsMetadataFileScanner', 'AudioFileScanner', 'BookScanner', 'LibraryItemScanData', 'NfoFileScanner', 'OpfFileScanner', 'PodcastScanner', 'Scanner']) {
  const p = 'server/scanner/' + file + '.js'
  const la = norm(path.join(a, p), false), lb = norm(path.join(b, p), true)
  const same = la.join('\n') === lb.join('\n')
  console.log(file, same ? 'IDENTICAL after undo' : 'DIFFERS')
  if (!same) { for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { console.log(' a:', la[i]); console.log(' b:', lb[i]); break } }
}
