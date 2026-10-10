// Lists every escape hatch (cast, non-null, unknown, index signature, require call, any) in converted TypeScript files, with file, line and source text.
// Usage: node list-ts.js <repo with node_modules/typescript> <root of the .ts files> <label> <output file>
const path = require('path')
const fs = require('fs')
const tsRepo = process.argv[2]
const rootTs = process.argv[3]
const label = process.argv[4]
const outFile = process.argv[5]
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
function isJsDoc(n) { return n.kind >= K.FirstJSDocNode && n.kind <= K.LastJSDocNode }
say('Escape hatches in ' + label + ' (' + rootTs + ')')
const counts = {}
for (const n of names) {
  const f = path.join(rootTs, n + '.ts')
  if (!fs.existsSync(f)) continue
  const text = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const lines = text.split(/\r?\n/)
  const found = []
  function add(kind, node) {
    const ln = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
    found.push({ ln: ln + 1, kind, src: lines[ln].trim().slice(0, 150) })
    counts[kind] = (counts[kind] || 0) + 1
  }
  function visit(node) {
    if (isJsDoc(node)) return
    if (node.kind === K.AnyKeyword) add('any', node)
    if (node.kind === K.UnknownKeyword) add('unknown', node)
    if (ts.isAsExpression(node)) {
      const isConst = ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const'
      if (!isConst) add('cast', node)
    }
    if (ts.isTypeAssertionExpression(node)) add('cast', node)
    if (ts.isNonNullExpression(node)) add('non-null', node)
    if (ts.isIndexSignatureDeclaration(node)) add('index-sig', node)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') add('require()', node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const uuidLines = []
  lines.forEach((l, i) => { if (/uuid/i.test(l)) uuidLines.push({ ln: i + 1, kind: 'uuid-mention', src: l.trim().slice(0, 150) }) })
  const all = found.concat(uuidLines).sort((a, b) => a.ln - b.ln)
  say('')
  say(n + '  (' + found.length + ' escape hatches)')
  all.forEach((x) => say('  ' + String(x.ln).padStart(4) + '  ' + x.kind.padEnd(14) + x.src))
}
say('')
say('Totals by kind: ' + JSON.stringify(counts))
fs.writeFileSync(outFile, out.join('\n') + '\n')