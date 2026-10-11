// Transpile one scratch file (no type check) and print the require lines of the output.
const path = require('path'); const fs = require('fs')
const ts = require('D:/SEM-2/574/Project/audiobookshelf-po/node_modules/typescript')
const src = fs.readFileSync(process.argv[2], 'utf8')
const res = ts.transpileModule(src, { fileName: 'LibraryItem.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true } })
fs.writeFileSync(process.argv[3], res.outputText)
