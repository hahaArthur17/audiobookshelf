// Fixed, offline event sample for the compiled zip response helpers.
const path = require('path')
const EventEmitter = require('events')
const Module = require('module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')

const log = []
const archives = []
const fakeLogger = Object.fromEntries(['info', 'debug', 'warn', 'error'].map((level) => [level, (...args) => log.push([level, ...args])]))
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === '../Logger' && parent?.filename.endsWith('/utils/zipHelpers.js')) return fakeLogger
  if (request === '../libs/archiver' && parent?.filename.endsWith('/utils/zipHelpers.js')) {
    return (format, options) => {
      const actions = [['create', format, options]]
      const archive = new EventEmitter()
      archive.pointer = () => 123
      archive.pipe = (res) => actions.push(['pipe', res.id])
      archive.directory = (...args) => actions.push(['directory', ...args])
      archive.file = (...args) => actions.push(['file', ...args])
      archive.finalize = () => actions.push(['finalize'])
      archives.push({ archive, actions })
      return archive
    }
  }
  return originalLoad.apply(this, arguments)
}
let zip
try {
  zip = require(path.join(root, 'dist-server/server/utils/zipHelpers'))
} finally {
  Module._load = originalLoad
}

class Response extends EventEmitter {
  constructor(id, headersSent = false) {
    super()
    this.id = id
    this.headersSent = headersSent
    this.actions = []
  }
  attachment(name) { this.actions.push(['attachment', name]); return this }
  status(code) { this.actions.push(['status', code]); return this }
  send(body) { this.actions.push(['send', body]); return this }
}

async function pipe(method, input, event) {
  const res = new Response(method)
  const before = log.length
  const pending = zip[method](input, 'archive.zip', res)
  const { archive, actions } = archives.at(-1)
  let result
  if (event === 'warning') {
    archive.emit('warning', Object.assign(new Error('missing'), { code: 'ENOENT' }))
    res.emit('end')
    res.emit('close')
  } else if (event === 'error') {
    archive.emit('error', Object.assign(new Error('broken'), { code: 'EIO' }))
  } else if (event === 'badWarning') {
    archive.emit('warning', Object.assign(new Error('denied'), { code: 'EACCES' }))
  } else {
    res.emit('end')
    res.emit('close')
  }
  try { result = { status: 'resolved', value: await pending } }
  catch (error) { result = { status: 'rejected', message: error.message, code: error.code } }
  return { response: res.actions, archive: actions, result, log: log.slice(before) }
}

function downloadError(error, headersSent) {
  const res = new Response('error', headersSent)
  const returned = zip.handleDownloadError(error, res)
  return { response: res.actions, returnedSelf: returned === res, returnedUndefined: returned === undefined }
}

async function main() {
  const output = {
    exports: Object.keys(zip),
    callable: Object.fromEntries(Object.keys(zip).map((key) => [key, {
      name: zip[key].name,
      length: zip[key].length,
      prototype: Object.hasOwn(zip[key], 'prototype')
    }])),
    single: await pipe('zipDirectoryPipe', '/a/books', 'close'),
    multi: await pipe('zipDirectoriesPipe', [
      { path: '/a/books', isFile: false },
      { path: '/a/song.mp3', isFile: true }
    ], 'close'),
    missingWarning: await pipe('zipDirectoryPipe', '/a/missing', 'warning'),
    archiveError: await pipe('zipDirectoryPipe', '/a/books', 'error'),
    badWarning: await pipe('zipDirectoryPipe', '/a/books', 'badWarning'),
    downloadErrors: [
      downloadError({ code: 'ENOENT' }, false),
      downloadError({ code: 'EIO' }, false),
      downloadError({ code: 'ENOENT' }, true)
    ]
  }
  console.log('BEHAVIOR_JSON=' + JSON.stringify(output))
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
