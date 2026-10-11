// In-memory "what if" check: type-checks MediaProgress.ts with the two ! and the cast taken out, without touching the repo and without emitting.
const { createRequire } = require('module')
const path = require('path')
const fs = require('fs')
const req = createRequire(path.join(process.cwd(), 'package.json'))
const ts = req('typescript')
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(process.cwd(), 'tsconfig.check.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')) } })
const target = path.resolve('server/models/MediaProgress.ts')
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
let text = fs.readFileSync(target, 'utf8')
const swaps = [
  ['progressPayload.progress!))', 'progressPayload.progress))'],
  ['markAsFinishedPercentComplete! > 0', 'markAsFinishedPercentComplete > 0'],
  ["(user as typeof user & typeof import('./User')).mediaProgressRemoved", 'user.mediaProgressRemoved']
]
for (const [a, b] of swaps) {
  if (!text.includes(a)) throw new Error('pattern not found: ' + a)
  text = text.replace(a, b)
}
const host = ts.createCompilerHost(cfg.options)
const getSourceFile = host.getSourceFile
host.getSourceFile = (fileName, langOpts, onError, shouldCreate) => (same(fileName, target) ? ts.createSourceFile(fileName, text, langOpts, true) : getSourceFile.call(host, fileName, langOpts, onError, shouldCreate))
const program = ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options, host })
const sf = program.getSourceFiles().find((f) => same(f.fileName, target))
const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
console.log('diagnostics: ' + diags.length)
console.log(ts.formatDiagnostics(diags, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }))
