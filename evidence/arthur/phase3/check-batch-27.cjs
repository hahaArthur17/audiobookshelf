// Independent offline baseline for the compiled filesystem helper.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const calls = []
const fs = {
  async stat(file, options) { calls.push(['stat', file, options || null]); return { size: 12n, mtimeMs: 13n, ctimeMs: 14n, birthtimeMs: 15n, ino: 16n, isFile: () => true } },
  async readdir(dir) { calls.push(['readdir', dir]); return ['folder', 'file.txt'] },
  async lstat(file) { calls.push(['lstat', file]); return { isDirectory: () => file.endsWith('folder') } },
  async readFile(file) { calls.push(['readFile', file]); return Buffer.from('hello') },
  async writeFile(...args) { calls.push(['writeFile', ...args]) },
  async remove(...args) { calls.push(['remove', ...args]) },
  async pathExists(file) { calls.push(['pathExists', file]); return true }
}
const entries = [
  { name: 'a.mp3', path: '/books', fullname: '/books/a.mp3', extension: '.mp3', deep: 0 },
  { name: '.hidden', path: '/books', fullname: '/books/.hidden', extension: '', deep: 0 },
  { name: 'b.m4b', path: '/books/author', fullname: '/books/author/b.m4b', extension: '.m4b', deep: 1 }
]
const rra = { LIST: 'LIST', async list(dir, options) { calls.push(['rra.list', dir, options]); return entries.map((item) => ({ ...item })) } }
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((name) => [name, (...args) => calls.push([`log.${name}`, ...args])]))
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/fileUtils.js')) {
    if (request === 'axios') return async () => { throw new Error('network disabled') }
    if (request === 'ssrf-req-filter') return () => 'agent'
    if (request === '../libs/fsExtra') return fs
    if (request === '../libs/recursiveReaddirAsync') return rra
    if (request === '../Logger') return logger
    if (request === './constants') return { AudioMimeType: { MP3: 'audio/mpeg', M4B: 'audio/mp4' } }
  }
  return originalLoad.apply(this, arguments)
}
async function main() {
  try {
    global.isWin = true
    const target = require(path.join(root, 'dist-server/server/utils/fileUtils'))
    const output = {}
    output.exports = Object.keys(target).map((key) => [key, typeof target[key], target[key].length, Object.hasOwn(target[key], 'prototype')])
    output.paths = ['C:\\Books\\One.mp3', '\\\\server\\share\\One.mp3', '', null].map((value) => target.filePathToPOSIX(value))
    output.subpaths = [['/books', '/books/one'], ['/books', '/bookstore'], ['/books', '/books']].map(([parent, child]) => target.isSameOrSubPath(parent, child))
    output.ignore = ['.hidden', '/books/.secret/a.mp3', '/books/@eaDir/a.mp3', '/books/a.TMP', '/books/a.mp3'].map((value) => target.shouldIgnoreFile(value))
    output.sanitize = ['Hello:world?.mp3', 'CON.txt', 'foo  bar.mp3', 'é'.repeat(140) + '.mp3', 42].map((value) => target.sanitizeFilename(value))
    output.mime = ['.mp3', '.m4b', '.xyz', null].map((value) => target.getAudioMimeTypeFromExtname(value))
    output.uri = target.encodeUriPath('/books/a#b?.mp3')
    output.stat = [await target.getFileSize('/books/a.mp3'), await target.getFileMTimeMs('/books/a.mp3'), await target.getFileTimestampsWithIno('/books/a.mp3'), await target.checkPathIsFile('/books/a.mp3'), await target.getIno('/books/a.mp3'), await target.readTextFile('/books/a.mp3')]
    output.pathItem = target.getFilePathItemFromFileUpdate({ relPath: '/author/book.mp3', path: '/books/author/book.mp3' })
    output.recurse = await target.recurseFiles.call({ shouldIgnoreFile: () => 'borrowed' }, '/books')
    output.directories = await target.getDirectoriesInPath.call({ filePathToPOSIX: () => 'borrowed' }, '/books', 2)
    const originalDownload = target.downloadFile
    target.downloadFile = async (...args) => { calls.push(['downloadFile', ...args.slice(0, 2), args[2]('image/png'), args[2]('image/svg+xml')]); return 'downloaded' }
    output.imageDownload = await target.downloadImageFile.call({ downloadFile: () => 'borrowed' }, 'https://cover', '/tmp/cover.png')
    target.downloadFile = originalDownload
    output.calls = calls
    process.stdout.write(JSON.stringify(output, (_, value) => typeof value === 'bigint' ? `${value}n` : value) + '\n')
  } finally {
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
