// usage: node compare-dist.js <typescript dir> <dist A> <dist B> <out file>
// Prints every .js file of both dist-server trees with the TypeScript printer with
// comments removed, drops blank lines, and compares them. Other files (json, .tsbuildinfo)
// are compared byte for byte, except .tsbuildinfo, which holds source hashes.
const fs = require('fs')
const path = require('path')
const [tsDir, a, b, outFile] = process.argv.slice(2)
const ts = require(path.join(tsDir, 'typescript'))
const printer = ts.createPrinter({ removeComments: true })
function list(d, base = d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) list(p, base, acc)
    else acc.push(path.relative(base, p))
  }
  return acc
}
const norm = (file) => {
  const src = fs.readFileSync(file, 'utf8')
  if (!file.endsWith('.js')) return src
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS)
  return printer
    .printFile(sf)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .join('\n')
}
const la = list(a).filter((f) => !f.endsWith('.tsbuildinfo')).sort()
const lb = list(b).filter((f) => !f.endsWith('.tsbuildinfo')).sort()
const sa = new Set(la)
const sb = new Set(lb)
const out = []
out.push(`files: ${la.length} (A) / ${lb.length} (B)`)
for (const f of la) if (!sb.has(f)) out.push(`only in A: ${f}`)
for (const f of lb) if (!sa.has(f)) out.push(`only in B: ${f}`)
let diff = 0
let rawDiff = 0
for (const f of la) {
  if (!sb.has(f)) continue
  const ra = fs.readFileSync(path.join(a, f), 'utf8')
  const rb = fs.readFileSync(path.join(b, f), 'utf8')
  if (ra !== rb) rawDiff++
  if (norm(path.join(a, f)) !== norm(path.join(b, f))) {
    diff++
    out.push(`DIFFERS: ${f}`)
  }
}
out.push(`files that differ in raw bytes (comments included): ${rawDiff}`)
out.push(`files that differ after removing comments and blank lines: ${diff}`)
fs.writeFileSync(outFile, out.join('\n') + '\n')
console.log(out.join('\n'))
