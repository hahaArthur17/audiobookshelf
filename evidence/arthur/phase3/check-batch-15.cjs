// Offline ABS metadata migration sample; all file and database operations are mocked.
const path = require('path')
const Module = require('module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')

let state
const record = (...args) => state.actions.push(args)
const logger = {
  info: (...args) => record('info', ...args),
  error: (...args) => record('error', ...args)
}
const fsExtra = {
  pathExists: async (file) => { record('pathExists', file); return state.exists },
  ensureDir: async (dir) => { record('ensureDir', dir) },
  writeFile: async (file, content) => {
    record('writeFile', file, content)
    if (state.writeFails) throw new Error('write failed')
  }
}
const fileUtils = {
  filePathToPOSIX: (file) => { record('posix', file); return file },
  getFileTimestampsWithIno: async (dir) => {
    record('timestamps', dir)
    return state.timestamps ? { mtimeMs: 20, ctimeMs: 30 } : null
  }
}
class LibraryFile {
  async setDataFromPath(file, name) { record('setDataFromPath', file, name); this.file = file }
  toJSON() { record('toJSON'); return { metadata: { path: this.file, size: '5' } } }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith('/utils/migrations/absMetadataMigration.js')) {
    if (request === '../../Logger') return logger
    if (request === '../../libs/fsExtra') return fsExtra
    if (request === '../fileUtils') return fileUtils
    if (request === '../../objects/files/LibraryFile') return LibraryFile
  }
  return originalLoad.apply(this, arguments)
}
let migration
try {
  migration = require(path.join(root, 'dist-server/server/utils/migrations/absMetadataMigration'))
} finally {
  Module._load = originalLoad
}

function item(id, isFile = false) {
  const value = {
    id,
    isFile,
    path: '/virtual/book',
    libraryFiles: [
      { metadata: { path: '/virtual/book/metadata.json', size: '11' } },
      { metadata: { path: '/virtual/book/book.mp3', size: '7' } }
    ],
    media: { getAbsMetadataJson: () => { record('getAbsMetadataJson', id); return { id, title: 'Sample' } } },
    changed: (...args) => record('changed', ...args),
    save: async () => {
      record('save', id)
      if (state.saveFails) throw new Error('save failed')
    }
  }
  return value
}

async function run(name, config) {
  state = { actions: [], ...config }
  global.ServerSettings = { storeMetadataWithItem: Boolean(config.adjacent) }
  global.MetadataPath = '/virtual/meta'
  const selected = item('one', Boolean(config.isFile))
  const database = {
    libraryItemModel: {
      getLibraryItemsIncrement: async (offset, limit, where) => {
        record('fetch', offset, limit, where)
        if (config.empty) return []
        if (config.pagination && offset === 0) return Array.from({ length: 500 }, () => selected)
        if (config.pagination && offset === 500) { state.exists = false; return [selected] }
        if (offset) return []
        return [selected]
      }
    }
  }
  let outcome
  try { outcome = { resolved: await migration.migrate(database) } }
  catch (error) { outcome = { rejected: error.message } }
  const pathExistsCount = state.actions.filter((a) => a[0] === 'pathExists').length
  const actions = config.pagination ? state.actions.filter((a) => a[0] !== 'pathExists' && a[0] !== 'posix') : state.actions
  return {
    name,
    outcome,
    pathExistsCount,
    actions,
    item: {
      libraryFiles: selected.libraryFiles,
      mtime: selected.mtime,
      ctime: selected.ctime,
      size: selected.size
    }
  }
}

async function main() {
  const previousSettings = global.ServerSettings
  const previousPath = global.MetadataPath
  try {
    const output = {
      exports: Object.keys(migration),
      callable: {
        name: migration.migrate.name,
        length: migration.migrate.length,
        prototype: Object.hasOwn(migration.migrate, 'prototype')
      },
      cases: [
        await run('empty', { empty: true }),
        await run('existing', { exists: true }),
        await run('external', { exists: false }),
        await run('adjacent', { exists: false, adjacent: true, timestamps: true }),
        await run('adjacent-no-timestamps', { exists: false, adjacent: true, timestamps: false }),
        await run('write-fails', { exists: false, writeFails: true }),
        await run('save-fails', { exists: false, adjacent: true, timestamps: true, saveFails: true }),
        await run('pagination', { exists: true, pagination: true })
      ]
    }
    console.log('BEHAVIOR_JSON=' + JSON.stringify(output))
  } finally {
    global.ServerSettings = previousSettings
    global.MetadataPath = previousPath
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
