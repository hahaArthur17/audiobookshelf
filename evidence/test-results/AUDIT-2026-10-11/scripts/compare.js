const { execFileSync } = require('child_process')
const repo = process.argv[2]
const git = (...a) => execFileSync('git', ['-c', 'safe.directory=*', '-c', 'core.quotepath=off', '-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1e8 })
const lines = git('diff', '--name-status', '-M30%', '9f4ff460', 'HEAD', '--', 'server').split('\n').filter((l) => l.startsWith('R'))
// map each rename to the run via the commit that introduced the .ts
const runOf = {}
for (const l of lines) {
  const [, from, to] = l.split('\t')
  const c = git('log', '--diff-filter=R', '-M30%', '--format=%s', '9f4ff460..HEAD', '--', to).split('\n')[0]
  const m = c.match(/^\[(PO-S\d+)\]/)
  runOf[to] = m ? m[1] : '?'
}
const isComment = (s) => /^\s*(\/\/|\/\*|\*)/.test(s)
const countRe = (s, re) => (s.match(re) || []).length
const rows = []
for (const l of lines) {
  const [, from, to] = l.split('\t')
  const a = git('show', '9f4ff460:' + from)
  const b = git('show', 'HEAD:' + to)
  const ca = a.split('\n').filter(isComment).length
  const cb = b.split('\n').filter(isComment).length
  const strip = (s) => s.split('\n').filter((x) => !isComment(x)).join('\n')
  const bs = strip(b)
  rows.push({
    run: runOf[to], file: to.replace('server/', ''),
    jsLines: a.split('\n').filter((x) => x.trim()).length, tsLines: b.split('\n').filter((x) => x.trim()).length,
    cJs: ca, cTs: cb,
    todoJs: countRe(a, /TODO|FIXME|XXX|HACK/g), todoTs: countRe(b, /TODO|FIXME|XXX|HACK/g),
    assert: countRe(bs, /\)\s+as\s+(?!const\b)[A-Za-z_{\[(]|[A-Za-z0-9_\]\)]\s+as\s+(?!const\b)[A-Za-z_{\[(]/g) - countRe(bs, /^\s*(import|export)\b.*\bas\b/gm),
    nonnull: countRe(bs, /[A-Za-z0-9_\)\]]!(?=[.\)\[;,\s])/g),
    unknown: countRe(bs, /\bunknown\b/g), declare: countRe(bs, /^\s*declare\s/gm), req: countRe(bs, /\brequire\(/g)
  })
}
const byRun = {}
rows.forEach((r) => { const k = byRun[r.run] = byRun[r.run] || { n: 0, assert: 0, nonnull: 0, unknown: 0, declare: 0, req: 0, cJs: 0, cTs: 0, lost: [] }; k.n++; ['assert', 'nonnull', 'unknown', 'declare', 'req', 'cJs', 'cTs'].forEach((f) => (k[f] += r[f])); if (r.cTs < r.cJs) k.lost.push(r.file + ' (' + r.cJs + '->' + r.cTs + ')') })
console.log('run   files assert nonnull unknown declare require  commentLines(js->ts)')
Object.keys(byRun).sort().forEach((r) => { const k = byRun[r]; console.log(r.padEnd(6), String(k.n).padEnd(5), String(k.assert).padEnd(6), String(k.nonnull).padEnd(7), String(k.unknown).padEnd(7), String(k.declare).padEnd(7), String(k.req).padEnd(7), k.cJs + '->' + k.cTs) })
console.log('\nfiles whose comment-line count dropped:')
rows.filter((r) => r.cTs < r.cJs).forEach((r) => console.log('  ' + r.run + ' ' + r.file + ' ' + r.cJs + '->' + r.cTs))
console.log('\nTODO-type markers: js ' + rows.reduce((a, r) => a + r.todoJs, 0) + ' -> ts ' + rows.reduce((a, r) => a + r.todoTs, 0))
console.log('non-blank lines: js ' + rows.reduce((a, r) => a + r.jsLines, 0) + ' -> ts ' + rows.reduce((a, r) => a + r.tsLines, 0))
require('fs').writeFileSync(process.argv[3], JSON.stringify(rows, null, 1))
