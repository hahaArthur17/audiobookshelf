const fs = require('fs'), path = require('path')
const ts = require('/home/danny/Code/compx574/audiobookshelf/node_modules/typescript')
const [a, b] = process.argv.slice(2)
function walk(d, base, out) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, base, out); else if (p.endsWith('.js')) out.push(path.relative(base, p)) } return out }
const fa = walk(a, a, []), fb = walk(b, b, [])
const sa = new Set(fa), sb = new Set(fb)
const printer = ts.createPrinter({ removeComments: true })
const norm = (p) => printer.printFile(ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.ES2022, true)).split('\n').filter((l) => l.trim() !== '')
console.log('files', fa.length, fb.length, 'only-a', fa.filter((f) => !sb.has(f)), 'only-b', fb.filter((f) => !sa.has(f)))
let nd = 0
for (const f of fa.filter((f) => sb.has(f)).sort()) {
  const la = norm(path.join(a, f)), lb = norm(path.join(b, f))
  if (la.join('\n') === lb.join('\n')) continue
  nd++
  console.log('=== ' + f)
  const fsA = path.join('/tmp/claude-1000/-home-danny-Code-compx574-audiobookshelf/3609af51-5f86-410c-a5c7-caef34b39469/scratchpad', 'na.txt'), fsB = fsA.replace('na.txt', 'nb.txt')
  fs.writeFileSync(fsA, la.join('\n') + '\n'); fs.writeFileSync(fsB, lb.join('\n') + '\n')
  try { require('child_process').execSync(`diff ${fsA} ${fsB}`) } catch (e) { process.stdout.write(e.stdout.toString()) }
}
console.log('DIFFERING FILES', nd)
