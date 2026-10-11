// In-memory probe of the B.2 registry declaration on MediaProgress.ts. Nothing in the repo is changed and nothing is emitted.
const { createRequire } = require('module')
const path = require('path')
const fs = require('fs')
const req = createRequire(path.join(process.cwd(), 'package.json'))
const ts = req('typescript')
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(process.cwd(), 'tsconfig.check.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')) } })
const target = path.resolve('server/models/MediaProgress.ts')
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
let text = fs.readFileSync(target, 'utf8')
const swap = (a, b) => { if (!text.includes(a)) throw new Error('pattern not found: ' + a); text = text.replace(a, b) }
swap("type ProgressUpdatePayload = import('./User').ProgressUpdatePayload", "type ProgressUpdatePayload = import('./User').ProgressUpdatePayload\ntype RegisteredModels = { book: typeof import('./Book'); user: typeof import('./User'); libraryItem: typeof import('./LibraryItem') }")
swap('  declare readonly sequelize: Sequelize & { uppercaseFirst<T extends string>(str: T): Capitalize<T> }', '  declare static readonly sequelize: Sequelize & { models: RegisteredModels }\n  declare readonly sequelize: Sequelize & { models: RegisteredModels; uppercaseFirst<T extends string>(str: T): Capitalize<T> }')
swap('  getMediaItem(options?:', `  static async b2StaticProbe() {
    const probeBook = await this.sequelize.models.book.findByPk('x')
    const probeUserStatic = this.sequelize.models.user.mediaProgressRemoved
    const probeVague = this.sequelize.models.podcast
    const probeJsModel = await this.sequelize.models.libraryItem.findByPk('x')
    return { probeBook, probeUserStatic, probeVague, probeJsModel }
  }
  async b2InstanceProbe() {
    const probeInstanceBook = await this.sequelize.models.book.findByPk('x')
    return probeInstanceBook
  }

  getMediaItem(options?:`)
const host = ts.createCompilerHost(cfg.options)
const getSourceFile = host.getSourceFile
host.getSourceFile = (fileName, langOpts, onError, shouldCreate) => (same(fileName, target) ? ts.createSourceFile(fileName, text, langOpts, true) : getSourceFile.call(host, fileName, langOpts, onError, shouldCreate))
const program = ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options, host })
const sf = program.getSourceFiles().find((f) => same(f.fileName, target))
const checker = program.getTypeChecker()
const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
console.log('diagnostics: ' + diags.length)
console.log(ts.formatDiagnostics(diags, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }))
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text.startsWith('probe')) {
    console.log(node.name.text + ': ' + checker.typeToString(checker.getTypeAtLocation(node.name), undefined, ts.TypeFormatFlags.NoTruncation).slice(0, 200))
  }
  ts.forEachChild(node, visit)
}
visit(sf)
