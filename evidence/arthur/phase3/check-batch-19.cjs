// Offline legacy-database migration sample; no real files are read or removed.
const path = require('path')
const Module = require('module')
const EventEmitter = require('events')
const { Readable } = require('stream')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const base = '/virtual/config'
let state
const trace = (...args) => state.trace.push(args)
const logger = Object.fromEntries(['info', 'warn', 'error', 'debug'].map((level) => [level, (...args) => trace(level, ...args.map((arg) => arg instanceof Error ? arg.message : arg))]))
const fs = {
  pathExistsSync: (file) => { trace('pathExistsSync', file); return !state.missingFiles?.has(file) },
  createReadStream: (file) => {
    trace('createReadStream', file)
    return Readable.from(file.endsWith('a.json') ? ['{"id":1}\n', 'bad json\n', '{}\n', '{"id":2}\n'] : ['{"name":"B"}\n'])
  },
  readdir: async (dir) => {
    trace('readdir', dir)
    if (state.readdirFails) throw new Error('readdir failed')
    return ['a.json', 'ignore.txt', 'b.JSON']
  },
  createWriteStream: (file) => {
    trace('createWriteStream', file)
    state.output = new EventEmitter()
    return state.output
  },
  remove: async (file) => { trace('remove', file); state.existing.delete(file) },
  pathExists: async (file) => { trace('pathExists', file); return state.existing.has(file) }
}
const archiver = (format, options) => {
  trace('archiver', format, options)
  const archive = new EventEmitter()
  archive.pointer = () => 55
  archive.pipe = () => trace('pipe')
  archive.directory = (...args) => trace('directory', ...args)
  archive.finalize = () => trace('finalize')
  state.archive = archive
  return archive
}
const zipLibrary = {
  async: class {
    constructor(options) { trace('zipOpen', options.file) }
    async extract(entry, destination) {
      trace('zipExtract', entry, destination)
      if (entry === null) state.existing.add(path.join(base, 'libraryItems'))
      else if (state.failPartial !== entry) state.existing.add(destination)
    }
    async close() { trace('zipClose') }
  }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith('/utils/migrations/oldDbFiles.js')) {
    if (request === '../../Logger') return logger
    if (request === '../../libs/fsExtra') return fs
    if (request === '../../libs/archiver') return archiver
    if (request === '../../libs/nodeStreamZip') return zipLibrary
  }
  return originalLoad.apply(this, arguments)
}
let oldDb
try {
  oldDb = require(path.join(root, 'dist-server/server/utils/migrations/oldDbFiles'))
} finally {
  Module._load = originalLoad
}
const init = (extra = {}) => { state = { trace: [], existing: new Set(), ...extra }; return state }
const run = async (fn) => {
  try { return { value: await fn() } }
  catch (error) { return { error: error.message || String(error) } }
}
async function sample(name, options, fn) {
  init(options)
  const value = await run(fn)
  return { name, value, trace: state.trace }
}
async function main() {
  const priorPath = global.ConfigPath
  const priorConsole = console.log
  global.ConfigPath = base
  try {
    const output = {
      exports: Object.keys(oldDb),
      callable: Object.fromEntries(Object.entries(oldDb).map(([name, fn]) => [name, { name: fn.name, length: fn.length, prototype: Object.hasOwn(fn, 'prototype') }]))
    }
    console.log = (...args) => trace('console', ...args)
    output.load = await sample('load', {}, () => oldDb.loadOldData('libraryItems'))
    output.loadMissing = await sample('loadMissing', { missingFiles: new Set([path.join(base, 'libraryItems/data/a.json')]) }, () => oldDb.loadOldData('libraryItems'))
    output.loadError = await sample('loadError', { readdirFails: true }, () => oldDb.loadOldData('users'))
    console.log = priorConsole
    output.hasDb = await sample('hasDb', { existing: new Set([path.join(base, 'users')]) }, () => oldDb.checkHasOldDb())
    output.noDb = await sample('noDb', {}, () => oldDb.checkHasOldDb())
    init()
    const zipPending = oldDb.zipWrapOldDb()
    state.output.emit('end')
    state.output.emit('close')
    output.zipSuccess = { value: await run(() => zipPending), trace: state.trace }
    init()
    const failedPending = oldDb.zipWrapOldDb()
    state.archive.emit('error', new Error('archive failed'))
    output.zipFailure = { value: await run(() => failedPending), trace: state.trace }
    output.hasZip = await sample('hasZip', { existing: new Set([path.join(base, 'oldDb.zip')]) }, () => oldDb.checkHasOldDbZip())
    output.noZip = await sample('noZip', {}, () => oldDb.checkHasOldDbZip())
    output.partialSuccess = await sample('partialSuccess', {}, () => oldDb.checkExtractItemsUsersAndLibraries())
    output.partialFirstFail = await sample('partialFirstFail', { failPartial: 'libraryItems/' }, () => oldDb.checkExtractItemsUsersAndLibraries())
    output.partialSecondFail = await sample('partialSecondFail', { failPartial: 'users/' }, () => oldDb.checkExtractItemsUsersAndLibraries())
    output.partialThirdFail = await sample('partialThirdFail', { failPartial: 'libraries/' }, () => oldDb.checkExtractItemsUsersAndLibraries())
    output.remove = await sample('remove', {}, () => oldDb.removeOldItemsUsersAndLibrariesFolders())
    priorConsole('BEHAVIOR_JSON=' + JSON.stringify(output))
  } finally {
    console.log = priorConsole
    global.ConfigPath = priorPath
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
