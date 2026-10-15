// Read-only syntax audit of Arthur's accepted Phase 3 Stage 1 checkout.
// Usage: node audit.cjs /absolute/path/to/audiobookshelf-phase3 [baseline-commit]
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const repo = process.argv[2]
const baseline = process.argv[3] || '7d10b8fc4abe57a4e777a07b7b462ca32c33371c'
if (!repo || !fs.existsSync(path.join(repo, 'node_modules/typescript'))) {
  throw new Error('Pass the Phase 3 checkout with its local TypeScript dependency')
}
const ts = require(path.join(repo, 'node_modules/typescript'))
const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const baselineFiles = execFileSync('git', [
  '-C', repo, 'ls-tree', '-r', '--name-only', baseline, '--', 'server', 'index.js'
], { encoding: 'utf8' }).trim().split('\n').filter(name =>
  name.endsWith('.js') && !name.startsWith('server/libs/')
)

function emptyGroup() {
  return { files: 0, nonblankLines: 0, as: 0, doubleUnknownAs: 0, nonNull: 0, explicitAny: 0, tsIgnoreDirectives: 0 }
}
const result = {
  baseline,
  head,
  typescriptVersion: ts.version,
  baselineFirstPartyJsFiles: baselineFiles.length,
  phase2: emptyGroup(),
  stage1: emptyGroup(),
  files: []
}

for (const jsName of baselineFiles) {
  const tsName = jsName.slice(0, -3) + '.ts'
  const abs = path.join(repo, tsName)
  if (!fs.existsSync(abs)) continue
  const source = fs.readFileSync(abs, 'utf8')
  const tree = ts.createSourceFile(tsName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const metrics = emptyGroup()
  metrics.files = 1
  metrics.nonblankLines = source.split(/\r?\n/).filter(line => line.trim()).length
  metrics.tsIgnoreDirectives = (source.match(/@ts-(?:ignore|nocheck|expect-error)/g) || []).length
  function walk(node) {
    if (ts.isAsExpression(node)) {
      metrics.as++
      if (ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) {
        metrics.doubleUnknownAs++
      }
    }
    if (ts.isNonNullExpression(node)) metrics.nonNull++
    if (node.kind === ts.SyntaxKind.AnyKeyword) metrics.explicitAny++
    ts.forEachChild(node, walk)
  }
  walk(tree)
  const groupName = tsName.startsWith('server/utils/') ? 'stage1' : 'phase2'
  for (const key of Object.keys(metrics)) result[groupName][key] += metrics[key]
  result.files.push({ path: tsName, group: groupName, ...metrics })
}

result.total = emptyGroup()
for (const name of ['phase2', 'stage1']) {
  for (const key of Object.keys(result.total)) result.total[key] += result[name][key]
}
console.log(JSON.stringify(result, null, 2))
