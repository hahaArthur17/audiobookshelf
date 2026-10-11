// V7 (approved method deviation): declaration output for the three finder files ONLY.
// Builds the same program with the same options as the spec V7 tsc command, then calls program.emit()
// once per finder file, so declarations for the other program files (incl. the vendored archiver file
// that crashes tsc 5.9.3) are never generated. Writes only <outDir>/server/finders/*.d.ts.
// Usage: node dts-emit-finders.js <outDir>
const path = require('path')
const root = 'D:/SEM-2/574/Project/audiobookshelf'
const ts = require(root + '/node_modules/typescript')

const outDir = process.argv[2]
if (!outDir || path.resolve(outDir).toLowerCase().startsWith(path.resolve(root).toLowerCase())) {
  throw new Error('outDir must be outside the repository: ' + outDir)
}

// Same options as: tsc <3 finders> --declaration --emitDeclarationOnly --allowJs --strict --target ES2022
//   --module commonjs --moduleResolution node --esModuleInterop --resolveJsonModule --skipLibCheck --rootDir . --outDir <outDir>
const options = {
  declaration: true,
  emitDeclarationOnly: true,
  allowJs: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  rootDir: root,
  outDir
}

const finders = ['AuthorFinder', 'BookFinder', 'PodcastFinder'].map((n) => root + '/server/finders/' + n + '.ts')
const program = ts.createProgram(finders, options)
console.log('typescript', ts.version, '| program files (non node_modules):', program.getSourceFiles().filter((s) => !s.fileName.includes('/node_modules/')).length)

const written = []
const writeFile = (fileName, text) => {
  if (!path.resolve(fileName).toLowerCase().startsWith(path.resolve(outDir).toLowerCase())) {
    throw new Error('refusing to write outside outDir: ' + fileName)
  }
  ts.sys.writeFile(fileName, text)
  written.push(fileName)
}

for (const f of finders) {
  const sf = program.getSourceFile(f)
  const result = program.emit(sf, writeFile, undefined, /* emitOnlyDtsFiles */ true)
  const diags = [...program.getDeclarationDiagnostics(sf), ...result.diagnostics]
  console.log(path.basename(f) + ': emitSkipped=' + result.emitSkipped + ', declaration diagnostics=' + diags.length)
  for (const d of diags) console.log('  ' + ts.flattenDiagnosticMessageText(d.messageText, ' '))
}
console.log('files written:', written.length)
for (const w of written) console.log('  ' + w)
