// Independent offline comparison of compiled comic extractor behavior.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const events = []
let writable = true
let zipFail = false
const record = (...args) => events.push(args.map((arg) => arg instanceof Error ? { name: arg.name, message: arg.message } : Buffer.isBuffer(arg) ? arg.toString() : arg))
const logger = { debug: (...args) => record('debug', ...args), error: (...args) => record('error', ...args) }
const fs = {
  async pathExists(file) { record('exists', file); return !file.includes('missing') },
  async readFile(file) { record('read', file); return Buffer.from('comic bytes') },
  async ensureDir(dir) { record('mkdir', dir) },
  async readdir(dir) { record('readdir', dir); return [] },
  async remove(file) { record('remove', file) },
  async move(source, destination, options) { record('move', source, destination, options) },
  async writeFile(file, data) { record('write', file, data) }
}
const unrar = {
  async createExtractorFromFile(options) {
    record('unrar', options.filepath, options.targetPath)
    for (const name of ['cover.jpg', '../bad.jpg', '/root/bad.jpg', 'a/../b.jpg']) {
      try { record('sanitize', name, options.filenameTransform(name)) }
      catch (error) { record('sanitizeError', name, error.message) }
    }
    return {
      getFileList() { record('rarFiles'); return { fileHeaders: [{ name: 'images/cover.jpg', flags: { directory: false } }, { name: 'images', flags: { directory: true } }] } },
      extract({ files }) { record('rarExtract', files); return { files: [{ fileHeader: { name: 'images/cover.jpg' } }] } }
    }
  }
}
class StreamZip {
  constructor(options) { record('zipNew', options) }
  async entries() { record('zipEntries'); return { 'a.jpg': { isDirectory: false }, 'folder/': { isDirectory: true }, 'b.jpg': { isDirectory: false } } }
  async entryData(file) { record('zipData', file); return Buffer.from('image') }
  async extract(file, output) { record('zipExtract', file, output); if (zipFail) throw new Error('zip failed') }
  async close() { record('zipClose') }
}
const stubs = {
  '../Logger': logger,
  '../libs/fsExtra': fs,
  '../libs/nodeStreamZip': { async: StreamZip },
  '../libs/libarchive/archive': { open: async () => { record('legacyOpen'); return null } },
  './fileUtils': { isWritable: async (dir) => { record('writable', dir); return writable } },
  '../libs/archiver/archiverUtils': { sanitizePath: (name) => name },
  'node-unrar-js': unrar
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/comicBookExtractors.js') && Object.hasOwn(stubs, request)) return stubs[request]
  return originalLoad.apply(this, arguments)
}
const oldMetadataPath = global.MetadataPath
const run = async (fn) => {
  try { return { value: await fn() } }
  catch (error) { return { error: { name: error.name, message: error.message } } }
}
async function main() {
  try {
    global.MetadataPath = '/metadata'
    const mod = require(path.join(root, 'dist-server/server/utils/comicBookExtractors'))
    const output = { exports: Object.keys(mod), factory: {} }
    for (const extension of ['.CBR', '.CbZ', '.pdf']) {
      output.factory[extension] = await run(async () => {
        const instance = mod.createComicBookExtractor(`/books/book${extension}`)
        return { className: instance.constructor.name, keys: Object.keys(instance), methods: Object.getOwnPropertyNames(Object.getPrototypeOf(instance)), path: instance.comicPath }
      })
    }
    const rar = mod.createComicBookExtractor('/books/book.cbr')
    output.rarBefore = [await rar.getFilePaths(), await rar.extractToBuffer('x'), await rar.extractToFile('x', '/output')]
    output.rarOpen = await run(() => rar.open())
    output.rarFiles = await rar.getFilePaths()
    output.rarBuffer = (await rar.extractToBuffer('images/cover.jpg')).toString()
    output.rarFile = await rar.extractToFile('images/cover.jpg', '/output/cover.jpg')
    output.rarClose = rar.close()
    writable = false
    output.rarNotWritable = await run(() => mod.createComicBookExtractor('/books/other.cbr').open())
    const zip = mod.createComicBookExtractor('/books/book.cbz')
    output.zipBefore = [await zip.getFilePaths(), await zip.extractToBuffer('x'), await zip.extractToFile('x', '/output')]
    output.zipOpen = await run(() => zip.open())
    output.zipFiles = await zip.getFilePaths()
    output.zipBuffer = (await zip.extractToBuffer('a.jpg')).toString()
    output.zipFile = await zip.extractToFile('a.jpg', '/output/a.jpg')
    zipFail = true
    output.zipFailure = await zip.extractToFile('b.jpg', '/output/b.jpg')
    output.zipClose = zip.close()
    await new Promise((resolve) => setImmediate(resolve))
    output.events = events
    console.log(JSON.stringify(output, null, 2))
  } finally {
    global.MetadataPath = oldMetadataPath
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
