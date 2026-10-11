// Single-file transpile (no type check, writes only to the scratchpad) to compare emitted JS with the baseline copy.
const path = require('path')
const fs = require('fs')
const repo = 'D:/SEM-2/574/Project/audiobookshelf-po'
const ts = require(path.join(repo, 'node_modules/typescript'))
const outDir = process.argv[2]
for (const name of process.argv.slice(3)) {
  const src = fs.readFileSync(path.join(repo, 'server/models', name + '.ts'), 'utf8')
  const res = ts.transpileModule(src, {
    fileName: name + '.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true }
  })
  fs.writeFileSync(path.join(outDir, name + '.js'), res.outputText)
}
