// Read-only: builds the program V7 builds (the 3 finders, allowJs) with noEmit and reports whether the two
// vendored archiver files whose declaration emit crashes tsc 5.9.3 are part of it.
const root = 'D:/SEM-2/574/Project/audiobookshelf'
const ts = require(root + '/node_modules/typescript')
const options = {
  allowJs: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  noEmit: true
}
const roots = ['AuthorFinder', 'BookFinder', 'PodcastFinder'].map((n) => root + '/server/finders/' + n + '.ts')
const program = ts.createProgram(roots, options)
const files = program.getSourceFiles().map((s) => s.fileName).filter((f) => !f.includes('/node_modules/'))
console.log('non-node_modules files in the V7 program:', files.length)
const crashers = files.filter((f) => f.endsWith('/libs/archiver/buffer-crc32/index.js') || f.endsWith('/archiverUtils/stringDecoder/index.js'))
console.log('crashing archiver files in the program:', crashers.length)
for (const f of crashers) console.log('  ' + f.slice(root.length + 1))
