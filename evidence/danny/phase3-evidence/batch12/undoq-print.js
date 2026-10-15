// Prints a compiled file with optionalString(x)/requiredString(x) turned back into x and the queryValue lines dropped
const fs = require('fs'), ts = require(process.argv[2] + '/typescript')
const NAMES = new Set(['optionalString', 'requiredString', 'isNaNArgument'])
const undo = (ctx) => (sf) => { const v = (n) => { n = ts.visitEachChild(n, v, ctx); if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && NAMES.has(n.expression.text) && n.arguments.length === 1) return n.arguments[0]; return n }; return ts.visitNode(sf, v) }
let sf = ts.createSourceFile('x.js', fs.readFileSync(process.argv[3], 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
sf = ts.transform(sf, [undo]).transformed[0]
const p = ts.createPrinter({ removeComments: true })
const txt = p.printFile(ts.createSourceFile('x.js', p.printFile(sf), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS))
process.stdout.write(txt.split('\n').filter((l) => l.trim() !== '' && !/^const queryValue = require\(/.test(l) && !/^const \{ [\w, ]+ \} = queryValue;$/.test(l)).join('\n') + '\n')
