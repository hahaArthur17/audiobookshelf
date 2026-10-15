// Batch 11d: counts `as`, `as unknown as` and non-null `!` with the TypeScript AST
// and checks their reason tags.
//
// usage: node casttags.js <repo root> <out prefix>
// writes <out prefix>-summary.txt, <out prefix>-perfile.txt, <out prefix>-casts.json
//
// Scope: all .ts under server/ except server/libs and .d.ts files, plus index.ts.
// `as const` is not counted; in `x as unknown as T` the inner `as unknown` is not
// counted, the outer cast counts as one `as unknown as`.
//
// Strict rule (batch 11d): a cast has a tag when a comment `cast(x): reason`
// (x in a-e) is
//   1. on the same line as the cast, or
//   2. in the comment lines directly above the cast's line (no blank line), or
//   3. in the comment lines directly above its statement (no blank line). The
//      statement is the nearest enclosing statement or class member; when that
//      statement is itself part of another statement (an `else if`, a labelled
//      statement), the outer statements count too, up to the one that sits in a
//      block, case clause or file.
// One comment block may cover several casts of the same statement only if it says
// how many: each `cast(x)` entry covers 1 cast, or N when its text has "(N)".
// Casts beyond what the comment covers are reported as untagged ("count").
// For `!`, a comment "Non-null: <reason>" (or "Non-null (N): <reason>" for N of them)
// at the same places counts as its tag (letter "nonnull").
// Places are tried in this order: a trailing comment on the line of the cast, the
// comment lines above the line where the cast starts, above the line of the `as`
// keyword (or of the `!`), above its statement(s); the cast takes a free slot at the
// first place that has one (see "strict resolution" below).
//
// Loose rule (the counter of batches 11b/11c): the nearest line with cast(x) above
// the cast or on its line, up to a blank line (60 lines at most).
const fs = require('fs')
const path = require('path')
const root = process.argv[2]
const out = process.argv[3]
const ts = require(path.join(root, 'node_modules/typescript'))

function walk(d, acc) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'libs' && e.name !== 'node_modules') walk(p, acc)
    } else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) acc.push(p)
  }
}
const files = []
walk(path.join(root, 'server'), files)
if (fs.existsSync(path.join(root, 'index.ts'))) files.push(path.join(root, 'index.ts'))
files.sort()

const isCommentLine = (s) => /^\s*(\/\/|\/\*|\*)/.test(s)
// comment text of a line that holds code and a trailing comment (rough: `//` or `/*` after code)
const trailingComment = (s) => {
  const m = s.match(/(\/\/|\/\*).*$/)
  return m ? m[0] : ''
}
// contiguous comment lines directly above line index i (no blank line), top to bottom
function commentBlockAbove(lines, i) {
  let j = i - 1
  while (j >= 0 && isCommentLine(lines[j])) j--
  return { start: j + 1, end: i - 1 }
}
const TAG_RE = /cast\(([a-e])\)/g
// entries of a comment block: [{ letter, count, assumed, text }]
function tagEntries(text) {
  const res = []
  const ms = [...text.matchAll(TAG_RE)]
  ms.forEach((m, k) => {
    const seg = text.slice(m.index, k + 1 < ms.length ? ms[k + 1].index : undefined)
    const cm = seg.match(/\((\d+)(?: casts?)?\)/)
    const after = seg.replace(/^cast\([a-e]\)\s*(\(\d+(?: casts?)?\))?\s*:?\s*(\(\d+(?: casts?)?\))?\s*/, '')
    res.push({ letter: m[1], count: cm ? parseInt(cm[1], 10) : 1, assumed: /^assumed:/i.test(after), text: seg.trim(), pos: m.index })
  })
  return res
}

// "Non-null: reason" or "Non-null (N): reason" comments (for `!` only)
function nonnullEntries(text) {
  return [...text.matchAll(/Non-null(?: \((\d+)\))?:/g)].map((m) => ({ letter: 'nonnull', count: m[1] ? parseInt(m[1], 10) : 1, assumed: false, pos: m.index }))
}

const all = []
const perFile = []
for (const f of files) {
  const rel = path.relative(root, f)
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split('\n')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true)
  const c = { as: 0, unk: 0, nn: 0 }
  const casts = []
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line
  const stmtChain = (n) => {
    // statements to look above, inner first
    const chain = []
    let p = n.parent
    while (p) {
      if (ts.isStatement(p) || ts.isClassElement(p)) {
        chain.push(p)
        const pp = p.parent
        if (!pp || ts.isBlock(pp) || ts.isSourceFile(pp) || ts.isCaseClause(pp) || ts.isDefaultClause(pp) || ts.isModuleBlock(pp) || ts.isClassLike(pp)) break
      }
      p = p.parent
    }
    return chain
  }
  const visit = (n) => {
    let kind = null
    if (ts.isAsExpression(n)) {
      const t = n.type
      const isConst = ts.isTypeReferenceNode(t) && t.typeName.getText(sf) === 'const'
      const isInner = t.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(n.parent) && n.parent.expression === n
      if (!isConst && !isInner) {
        kind = ts.isAsExpression(n.expression) && n.expression.type.kind === ts.SyntaxKind.UnknownKeyword ? 'unk' : 'as'
      }
    } else if (ts.isNonNullExpression(n)) kind = 'nn'
    if (kind) {
      c[kind]++
      const line = lineOf(n.getStart(sf))
      // the position of the `as` / `!` token decides "same line"
      const opLine = kind === 'nn' ? lineOf(n.getEnd() - 1) : lineOf(n.type.getStart(sf))
      const chain = stmtChain(n)
      casts.push({
        file: rel,
        line: line + 1,
        opLine: opLine + 1,
        kind,
        text: n.getText(sf).replace(/\s+/g, ' ').slice(0, 160),
        target: kind === 'nn' ? '!' : n.type.getText(sf).replace(/\s+/g, ' '),
        stmtLines: chain.map((s) => lineOf(s.getStart(sf)) + 1),
        stmtEnd: chain.length ? lineOf(chain[0].getEnd()) + 1 : line + 1
      })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  perFile.push({ file: rel, ...c })

  // strict resolution. A comment block (or a trailing comment) holds slots: each cast(x)
  // entry gives 1 slot, or N with "(N)". Casts are taken in source order (an outer cast
  // before the casts inside it); each takes a free slot at the first of its places that
  // has one. A `!` takes a Non-null comment first; Non-null comments are not counted.
  const blocks = new Map()
  const getBlock = (key, text) => {
    if (!blocks.has(key)) {
      const slots = []
      for (const e of tagEntries(text)) for (let k = 0; k < e.count; k++) slots.push({ ...e, used: false })
      blocks.set(key, { slots, nonnull: nonnullEntries(text).length > 0 })
    }
    return blocks.get(key)
  }
  for (const cast of casts) {
    const cands = []
    for (const li of new Set([cast.line, cast.opLine])) {
      const tc = trailingComment(lines[li - 1])
      if (isCommentLine(lines[li - 1]) === false && tc) cands.push(['L' + li, tc])
    }
    const above = (li) => {
      const b = commentBlockAbove(lines, li - 1)
      if (b.start <= b.end) cands.push(['B' + b.start, lines.slice(b.start, b.end + 1).join('\n')])
    }
    above(cast.line)
    if (cast.opLine !== cast.line) above(cast.opLine)
    for (const s of cast.stmtLines) above(s)
    cast.tag = 'none'
    let sawTag = false
    for (const [key, text] of cands) {
      const b = getBlock(key, text)
      if (cast.kind === 'nn' && b.nonnull) {
        cast.tag = 'nonnull'
        cast.site = key
        break
      }
      if (b.slots.length) sawTag = true
      const slot = b.slots.find((sl) => !sl.used)
      if (slot) {
        slot.used = true
        cast.tag = slot.letter
        cast.assumed = slot.assumed
        cast.site = key
        break
      }
    }
    if (cast.tag === 'none' && sawTag) cast.reason = 'count'
    // loose rule
    let loose = 'none'
    for (let i = cast.line - 1; i >= Math.max(0, cast.line - 61); i--) {
      const m = lines[i].match(/cast\(([a-e])\)/)
      if (m) {
        loose = m[1]
        break
      }
      if (i < cast.line - 1 && lines[i].trim() === '') break
    }
    cast.loose = loose
  }
  all.push(...casts)
}

const tot = perFile.reduce((a, p) => ({ as: a.as + p.as, unk: a.unk + p.unk, nn: a.nn + p.nn }), { as: 0, unk: 0, nn: 0 })
const by = (key) => all.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {})
const byKind = (tag) => all.filter((x) => x.tag === tag).reduce((m, x) => ((m[x.kind] = (m[x.kind] || 0) + 1), m), {})
const untagged = all.filter((x) => x.tag === 'none')
const summary = [
  `files=${files.length} as=${tot.as} unknown_as=${tot.unk} nonnull=${tot.nn} total=${all.length}`,
  `strict tags: ${JSON.stringify(by('tag'))}`,
  ...['a', 'b', 'c', 'd', 'e', 'nonnull', 'none'].map((t) => `  ${t} by kind: ${JSON.stringify(byKind(t))}`),
  `strict assumed: ${all.filter((x) => x.assumed).length}`,
  `strict untagged: ${untagged.length} (count missing: ${untagged.filter((x) => x.reason === 'count').length})`,
  `loose tags (as and as unknown as only, as in 11b/11c): ${JSON.stringify(all.filter((x) => x.kind !== 'nn').reduce((m, x) => ((m[x.loose] = (m[x.loose] || 0) + 1), m), {}))}`,
  `loose tags (all three kinds): ${JSON.stringify(by('loose'))}`,
  '',
  'untagged (strict):',
  ...untagged.map((x) => `${x.file}:${x.line} ${x.kind} ${x.reason === 'count' ? '[count missing] ' : ''}${x.text}`)
]
fs.writeFileSync(out + '-summary.txt', summary.join('\n') + '\n')
fs.writeFileSync(out + '-perfile.txt', perFile.map((p) => `${p.file} as=${p.as} unknown_as=${p.unk} nonnull=${p.nn}`).join('\n') + `\nTOTAL files=${files.length} as=${tot.as} unknown_as=${tot.unk} nonnull=${tot.nn}\n`)
fs.writeFileSync(out + '-casts.json', JSON.stringify(all, null, 1))
console.log(summary.slice(0, 12).join('\n'))
