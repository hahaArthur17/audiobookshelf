// Offline stream/SSRF/error sample for the compiled file downloader.
const path = require('node:path')
const Module = require('node:module')
const { EventEmitter } = require('node:events')

const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const targetPath = path.resolve(root, 'dist-server/server/utils/fileUtils.js')
const originalLoad = Module._load
const originalFilter = global.DisableSsrfRequestFilter
let mode
let calls

const fs = {
  createWriteStream(filepath) {
    calls.push(['writer.create', filepath])
    const writer = new EventEmitter()
    const originalOn = writer.on
    writer.on = function (event, listener) { calls.push(['writer.on', event]); return originalOn.call(this, event, listener) }
    return writer
  }
}
const axios = (config) => {
  calls.push(['axios', { ...config, httpAgent: config.httpAgent, httpsAgent: config.httpsAgent }])
  if (mode === 'request-error') return Promise.reject(new Error('request failed'))
  const data = new EventEmitter()
  const originalOn = data.on
  data.on = function (event, listener) { calls.push(['data.on', event]); return originalOn.call(this, event, listener) }
  data.pipe = (writer) => {
    calls.push(['data.pipe'])
    setImmediate(() => {
      if (mode === 'writer-error') writer.emit('error', new Error('disk failed'))
      else {
        data.emit('data', { length: 5 })
        writer.emit('finish')
      }
    })
    return writer
  }
  return Promise.resolve({ headers: { 'content-type': mode === 'bad-type' ? 'text/html' : 'image/png', 'content-length': '10' }, data })
}
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...values) => calls.push([`log.${level}`, ...values.map((value) => value instanceof Error ? value.message : value)])]))
Module._load = function (request, parent, isMain) {
  if (parent?.filename === targetPath) {
    if (request === 'axios') return axios
    if (request === 'ssrf-req-filter') return (url) => { calls.push(['ssrf', url]); return 'filtered-agent' }
    if (request === '../libs/fsExtra') return fs
    if (request === '../libs/recursiveReaddirAsync') return { LIST: 'LIST' }
    if (request === '../Logger') return logger
    if (request === './constants') return { AudioMimeType: {} }
  }
  return originalLoad.apply(this, arguments)
}

async function sample(target, nextMode) {
  mode = nextMode
  calls = []
  global.DisableSsrfRequestFilter = (url) => { calls.push(['allowPrivate', url]); return nextMode === 'allowed' }
  try {
    const value = await target.downloadFile('https://fixture.test/image', '/tmp/fixture-image', (contentType) => { calls.push(['filter', contentType]); return contentType === 'image/png' })
    return { result: String(value), calls }
  } catch (error) {
    return { error: error.message, calls }
  }
}

async function main() {
  try {
    const target = require(targetPath)
    const results = {}
    for (const nextMode of ['ok', 'allowed', 'bad-type', 'writer-error', 'request-error']) {
      results[nextMode] = await sample(target, nextMode)
    }
    process.stdout.write(JSON.stringify(results) + '\n')
  } finally {
    Module._load = originalLoad
    global.DisableSsrfRequestFilter = originalFilter
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
