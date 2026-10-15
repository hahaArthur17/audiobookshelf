// usage: node dump.js <repo root> <casts.json> <path prefix> [...]
// prints the code around each untagged cast (strict rule), per file, windows merged.
// Lines with an untagged cast are marked ">>"; "S" marks the statement start lines.
const fs = require('fs')
const path = require('path')
const [root, json, ...prefixes] = process.argv.slice(2)
const casts = require(path.resolve(json)).filter((x) => x.tag === 'none' && prefixes.some((p) => x.file.startsWith(p)))
const byFile = {}
for (const c of casts) (byFile[c.file] = byFile[c.file] || []).push(c)
for (const [file, cs] of Object.entries(byFile)) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n')
  const ranges = []
  const marks = new Set()
  const starts = new Set()
  for (const c of cs) {
    marks.add(c.line)
    marks.add(c.opLine)
    const s = Math.min(c.line, ...(c.stmtLines.length ? [c.stmtLines[c.stmtLines.length - 1]] : []))
    starts.add(s)
    let a = s - 1
    while (a > 1 && /^\s*(\/\/|\/\*|\*)/.test(lines[a - 2])) a--
    a = Math.max(1, Math.min(a, s - 1))
    // long statements: show the start and the cast line area
    let b = Math.max(c.line, c.opLine) + 1
    if (c.line - s > 12) {
      ranges.push([a, s + 2])
      ranges.push([c.line - 4, b])
    } else ranges.push([a, b])
  }
  ranges.sort((x, y) => x[0] - y[0])
  const merged = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  console.log(`===== ${file} (${cs.length})`)
  for (const [a, b] of merged) {
    for (let i = a; i <= Math.min(b, lines.length); i++) {
      const m = marks.has(i) ? '>>' : starts.has(i) ? 'S ' : '  '
      console.log(`${m}${String(i).padStart(4)}| ${lines[i - 1].slice(0, 220)}`)
    }
    console.log('    ...')
  }
}
