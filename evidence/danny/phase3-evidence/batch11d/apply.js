// usage: node apply.js <repo root> <plan file>
// Plan format (line numbers are the line numbers of the file before this plan):
//   @ <file>
//   I <line> <comment text>   insert a whole comment line above <line>, with the indent of <line>
//   R <line> <comment text>   replace the text of comment line <line>, keeping its indent
// Every new text must start with "//". R only applies to a line that already is a
// comment line. Nothing else is touched.
const fs = require('fs')
const path = require('path')
const [root, planFile] = process.argv.slice(2)
const plan = fs.readFileSync(planFile, 'utf8').split('\n')
const byFile = {}
let cur = null
for (const raw of plan) {
  if (!raw.trim() || raw.startsWith('#')) continue
  if (raw.startsWith('@ ')) {
    cur = raw.slice(2).trim()
    byFile[cur] = byFile[cur] || []
    continue
  }
  const m = raw.match(/^([IR]) (\d+) (\/\/.*)$/)
  if (!m || !cur) throw new Error('bad plan line: ' + raw)
  byFile[cur].push({ op: m[1], line: +m[2], text: m[3].replace(/\s+$/, '') })
}
let n = 0
const outputs = []
const review = []
for (const [file, ops] of Object.entries(byFile)) {
  const p = path.join(root, file)
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  const isComment = (s) => /^\s*(\/\/|\/\*|\*)/.test(s)
  const indent = (s) => s.match(/^\s*/)[0]
  // replacements first (line numbers unchanged), then inserts bottom-up
  for (const o of ops.filter((o) => o.op === 'R')) {
    const old = lines[o.line - 1]
    if (!isComment(old) || !/^\s*\/\//.test(old)) throw new Error(`${file}:${o.line} is not a // comment line: ${old}`)
    review.push(`${file}:${o.line}\n  - ${old.trim()}\n  + ${o.text}`)
    lines[o.line - 1] = indent(old) + o.text
    n++
  }
  const ins = ops.map((o, i) => ({ ...o, i })).filter((o) => o.op === 'I')
  ins.sort((a, b) => b.line - a.line || b.i - a.i)
  for (const o of ins) {
    const target = lines[o.line - 1]
    if (target === undefined) throw new Error(`${file}:${o.line} out of range`)
    lines.splice(o.line - 1, 0, indent(target) + o.text)
    n++
  }
  outputs.push([p, lines.join('\n')])
}
// nothing is written unless every operation of the plan is valid
for (const [p, text] of outputs) fs.writeFileSync(p, text)
fs.writeFileSync(planFile + '.review.txt', review.join('\n') + '\n')
console.log('applied', n, 'line changes in', Object.keys(byFile).length, 'files')
