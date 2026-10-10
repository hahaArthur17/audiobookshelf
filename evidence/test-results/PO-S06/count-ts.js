// Counts type-safety markers in converted TypeScript files and checks which comments of the original JavaScript files survived.
// Usage: node count-ts.js <repo with node_modules/typescript> <root of the .ts files> <root of the original .js files> <label> <output file>
const path = require('path')
const fs = require('fs')
const tsRepo = process.argv[2]
const rootTs = process.argv[3]
const rootJs = process.argv[4]
const label = process.argv[5]
const outFile = process.argv[6]
const ts = require(path.join(tsRepo, 'node_modules', 'typescript'))
const K = ts.SyntaxKind
const names = [
  'server/objects/Notification', 'server/objects/Task', 'server/objects/TrackProgressMonitor', 'server/objects/files/AudioTrack',
  'server/objects/metadata/AudioMetaTags', 'server/providers/OpenLibrary', 'server/utils/areEquivalent',
  'server/utils/generators/hlsPlaylistGenerator', 'server/utils/globals', 'server/utils/longTimeout',
  'server/utils/parsers/parseFullName', 'server/utils/parsers/parseNfoMetadata', 'server/utils/parsers/parseUserAgent',
  'server/utils/stringifySequelizeQuery'
]
const out = []
function say(s) { out.push(s); console.log(s) }
function norm(s) { return s.replace(/\s+/g, ' ').trim() }
function parse(file, kind) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true, kind)
}
function isJsDoc(n) { return n.kind >= K.FirstJSDocNode && n.kind <= K.LastJSDocNode }
function commentsOf(sf) {
  const text = sf.text
  const seen = new Set()
  const found = []
  function add(ranges) {
    if (!ranges) return
    for (const r of ranges) {
      if (!seen.has(r.pos)) { seen.add(r.pos); found.push(text.slice(r.pos, r.end)) }
    }
  }
  function walk(n) {
    if (isJsDoc(n)) return
    add(ts.getLeadingCommentRanges(text, n.getFullStart()))
    add(ts.getTrailingCommentRanges(text, n.getEnd()))
    for (const c of n.getChildren(sf)) walk(c)
  }
  walk(sf)
  return found
}
function analyse(sf) {
  const c = { lines: 0, any: 0, asAny: 0, asUnknownAs: 0, casts: 0, nonNull: 0, indexSig: 0, declare: 0, unknown: 0, require: 0, moduleExports: 0, exportEquals: 0, importEquals: 0, suppress: 0 }
  c.lines = sf.text.split(/\r?\n/).filter((l) => l.trim() !== '').length
  c.suppress = (sf.text.match(/@ts-(ignore|nocheck|expect-error)/g) || []).length
  function visit(n) {
    if (isJsDoc(n)) return
    if (n.kind === K.AnyKeyword) c.any++
    if (n.kind === K.UnknownKeyword) c.unknown++
    if (ts.isAsExpression(n)) {
      const isConst = ts.isTypeReferenceNode(n.type) && ts.isIdentifier(n.type.typeName) && n.type.typeName.text === 'const'
      if (!isConst) c.casts++
      if (n.type.kind === K.AnyKeyword) c.asAny++
      let inner = n.expression
      while (ts.isParenthesizedExpression(inner)) inner = inner.expression
      if (ts.isAsExpression(inner) && inner.type.kind === K.UnknownKeyword) c.asUnknownAs++
    }
    if (ts.isTypeAssertionExpression(n)) c.casts++
    if (ts.isNonNullExpression(n)) c.nonNull++
    if (ts.isIndexSignatureDeclaration(n)) c.indexSig++
    if (ts.isPropertyDeclaration(n) && ts.canHaveModifiers(n) && (ts.getModifiers(n) || []).some((m) => m.kind === K.DeclareKeyword)) c.declare++
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require') c.require++
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'exports' && ts.isIdentifier(n.expression) && n.expression.text === 'module') c.moduleExports++
    if (ts.isExportAssignment(n) && n.isExportEquals) c.exportEquals++
    if (ts.isImportEqualsDeclaration(n)) c.importEquals++
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return c
}
const cols = ['lines', 'any', 'asAny', 'asUnknownAs', 'casts', 'nonNull', 'indexSig', 'declare', 'unknown', 'require', 'moduleExports', 'exportEquals', 'importEquals', 'suppress']
const heads = ['lines', 'any', 'as any', 'as unk as', 'casts', '!', 'index', 'declare', 'unknown', 'require()', 'mod.exp', 'export =', 'import =', '@ts-*']
say('Counts for ' + label + ' (' + rootTs + ')')
say('file'.padEnd(46) + heads.map((h) => h.padStart(10)).join(''))
const total = {}
cols.forEach((k) => { total[k] = 0 })
const missingByFile = []
let converted = 0
for (const n of names) {
  const tsFile = path.join(rootTs, n + '.ts')
  const jsFile = path.join(rootJs, n + '.js')
  if (!fs.existsSync(tsFile)) { say(n.padEnd(46) + 'not converted (no .ts file)'); continue }
  converted++
  const sf = parse(tsFile, ts.ScriptKind.TS)
  const c = analyse(sf)
  cols.forEach((k) => { total[k] += c[k] })
  say(n.padEnd(46) + cols.map((k) => String(c[k]).padStart(10)).join(''))
  if (fs.existsSync(jsFile)) {
    const orig = commentsOf(parse(jsFile, ts.ScriptKind.JS))
    const newText = norm(sf.text)
    missingByFile.push({ n, total: orig.length, missing: orig.filter((x) => !newText.includes(norm(x))) })
  }
}
say(('TOTAL (' + converted + ' files)').padEnd(46) + cols.map((k) => String(total[k]).padStart(10)).join(''))
say('')
say('Comments of the original .js file that are not found unchanged in the converted file (whitespace ignored):')
let miss = 0
let all = 0
for (const m of missingByFile) {
  all += m.total
  miss += m.missing.length
  say(m.n + ': ' + m.missing.length + ' of ' + m.total + ' missing')
  m.missing.slice(0, 6).forEach((x) => say('    ' + norm(x).slice(0, 150)))
}
say('TOTAL: ' + miss + ' of ' + all + ' comments missing or changed')
fs.writeFileSync(outFile, out.join('\n') + '\n')