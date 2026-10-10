// Single-file transpile (no type check, no project build): shows what each file emits. Writes only into the scratchpad.
const { createRequire } = require('module')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const req = createRequire(path.join(process.cwd(), 'package.json'))
const ts = req('typescript')
const outDir = process.argv[2]
const opts = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, allowJs: true, strict: true }
for (const name of process.argv.slice(3)) {
  const oldSrc = execFileSync('git', ['show', `HEAD:server/models/${name}.js`], { encoding: 'utf8' })
  const newSrc = fs.readFileSync(`server/models/${name}.ts`, 'utf8')
  const oldOut = ts.transpileModule(oldSrc, { compilerOptions: opts, fileName: `${name}.js` }).outputText
  const newOut = ts.transpileModule(newSrc, { compilerOptions: opts, fileName: `${name}.ts` }).outputText
  fs.writeFileSync(path.join(outDir, `${name}.old.js`), oldOut)
  fs.writeFileSync(path.join(outDir, `${name}.new.js`), newOut)
}
