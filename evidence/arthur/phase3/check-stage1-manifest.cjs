// Audit the frozen Stage 1 target list after each integration checkpoint.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../../..')
const manifest = fs.readFileSync(path.join(__dirname, 'stage1-target-manifest.txt'), 'utf8').trim().split('\n')
const converted = []
const remaining = []
const unknown = []
const overlap = []
for (const source of manifest) {
  const target = source.replace(/\.js$/, '.ts')
  const hasJs = fs.existsSync(path.join(root, source))
  const hasTs = fs.existsSync(path.join(root, target))
  if (hasJs && hasTs) overlap.push(source)
  else if (hasTs) converted.push(target)
  else if (hasJs) remaining.push(source)
  else unknown.push(source)
}

const protectedPaths = ['test', 'tsconfig.server.json', 'package.json', 'package-lock.json']
const committed = execFileSync('git', ['diff', '--name-only', '5f37b6a7932ec53ce00d56f2888f6f7c057ae746', 'HEAD', '--', ...protectedPaths], { cwd: root, encoding: 'utf8' }).trim()
const uncommitted = execFileSync('git', ['status', '--porcelain', '--', ...protectedPaths], { cwd: root, encoding: 'utf8' }).trim()
const protectedChanged = [committed, uncommitted].filter(Boolean).join('\n')

process.stdout.write(`targets=${manifest.length} converted=${converted.length} remaining=${remaining.length} unknown=${unknown.length} overlap=${overlap.length}\n`)
process.stdout.write(`protected-files-changed=${protectedChanged || 'none'}\n`)
for (const [name, paths] of [['remaining', remaining], ['unknown', unknown], ['overlap', overlap]]) {
  if (paths.length) process.stdout.write(`${name}:\n${paths.join('\n')}\n`)
}
if (unknown.length || overlap.length || protectedChanged) process.exitCode = 1
