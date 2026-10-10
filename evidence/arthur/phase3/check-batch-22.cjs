// Independent fixed-input comparison of compiled scandir utilities.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const calls = []
class LibraryFile {
  constructor() { this.created = calls.length; calls.push(['construct']) }
  async setDataFromPath(fullpath, relative) { calls.push(['setData', fullpath, relative]); this.fullpath = fullpath; this.relative = relative }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/scandir.js') && request === '../objects/files/LibraryFile') return LibraryFile
  return originalLoad.apply(this, arguments)
}
const originalSettings = global.ServerSettings
const originalWin = global.isWin
const run = (fn) => {
  try { return { value: fn() } }
  catch (error) { return { error: { name: error.name, message: error.message } } }
}
async function main() {
  try {
    global.isWin = false
    global.ServerSettings = { scannerParseSubtitle: true }
    const scan = require(path.join(root, 'dist-server/server/utils/scandir'))
    const output = { exports: Object.keys(scan).map((key) => [key, scan[key].length, Object.hasOwn(scan[key], 'prototype')]) }
    const paths = ['root.m4b', 'root.jpg', 'Author/Series/Book 2 - A Tale [B012345678] {Narrator One}/CD1/01.mp3', 'Author/Series/Book 2 - A Tale [B012345678] {Narrator One}/CD2/02.mp3', 'Author/Series/Book 2 - A Tale [B012345678] {Narrator One}/cover.jpg', 'Podcast/Season 1/episode.mp3', 'Podcast/Season 1/readme.txt', 'random/file.txt']
    const files = paths.map((p) => ({ name: path.posix.basename(p), reldirpath: path.posix.dirname(p) === '.' ? '' : path.posix.dirname(p), extension: path.posix.extname(p), deep: p.split('/').length - 1 }))
    output.group = [
      scan.groupFileItemsIntoLibraryItemDirs('book', files, false),
      scan.groupFileItemsIntoLibraryItemDirs('book', files, true, true),
      scan.groupFileItemsIntoLibraryItemDirs('podcast', files, false, true),
      scan.groupFileItemsIntoLibraryItemDirs('book', [], false)
    ]
    output.audio = ['a.mp3', 'a.M4B', 'a.txt', 'none', 'a.wav'].map(scan.checkFilepathIsAudioFile)
    output.book = [
      'Writer/Series/Book 2 - A Tale [B012345678] {Narrator One}',
      'Writer/(2021) - Mystery - Subtitle',
      'Title',
      'A/B/Vol. 3 - The Title'
    ].map((p) => run(() => scan.getBookDataFromDir(p, true)))
    output.bookErrors = [null, 42, ''].map((p) => run(() => scan.getBookDataFromDir(p, true)))
    output.media = [
      scan.getDataFromMediaDir('book', '/lib', 'Writer/Series/Book 2 - A Tale [B012345678] {Narrator One}'),
      scan.getDataFromMediaDir('podcast', '/lib', 'A/Show'),
      scan.getDataFromMediaDir('unknown', '/lib', 'Title')
    ]
    global.ServerSettings.scannerParseSubtitle = false
    output.noSubtitle = scan.getDataFromMediaDir('book', '/lib', 'Writer/Title - Subtitle')
    output.files = await scan.buildLibraryFile('/lib/Book', ['a.mp3', 'CD1/b.m4b'])
    output.calls = calls
    console.log(JSON.stringify(output, null, 2))
  } finally {
    global.ServerSettings = originalSettings
    global.isWin = originalWin
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
