// Offline comic/ebook parser sample with deterministic archive and EPUB mocks.
const path = require('path')
const Module = require('module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const calls = []
const logger = {}
for (const level of ['debug', 'warn', 'error']) {
  logger[level] = (...args) => calls.push([level, ...args.map((arg) => arg instanceof Error ? arg.message : arg)])
}
const epub = {
  parse: async (file) => { calls.push(['epub-parse', file.metadata.path]); return { path: file.metadata.path, ebookFormat: 'epub', metadata: { title: 'EPUB' } } },
  extractCoverImage: async (...args) => { calls.push(['epub-cover', ...args]); return true }
}
function archiveFor(comicPath) {
  return {
    async open() {
      calls.push(['open', comicPath])
      if (comicPath === 'open-fail.cbz') throw new Error('open failed')
    },
    async getFilePaths() {
      calls.push(['list', comicPath])
      if (comicPath === 'bad-list.cbz') throw new Error('list failed')
      if (comicPath === 'missing.cbz') return ['readme.txt']
      return ['page10.JPG', 'ComicInfo.xml', 'page2.png']
    },
    async extractToBuffer(filePath) { calls.push(['buffer', comicPath, filePath]); return Buffer.from('<ComicInfo/>') },
    async extractToFile(filePath, output) {
      calls.push(['file', comicPath, filePath, output])
      if (comicPath === 'cover-fail.cbz') throw new Error('cover failed')
      return true
    },
    close() { calls.push(['close', comicPath]) }
  }
}
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  const fromComic = parent?.filename?.endsWith('/parseComicMetadata.js')
  const fromEbook = parent?.filename?.endsWith('/parseEbookMetadata.js')
  if (fromComic && request === '../../Logger') return logger
  if (fromComic && request === '../globals') return { SupportedImageTypes: ['png', 'jpg'] }
  if (fromComic && request === '../index') return { xmlToJSON: async (text) => {
    calls.push(['xml', text])
    return { ComicInfo: { Series: [' Saga '], Number: [' 2 '], Summary: [' Story '] } }
  } }
  if (fromComic && request === '../comicBookExtractors.js') return { createComicBookExtractor: archiveFor }
  if (fromEbook && request === './parseEpubMetadata') return epub
  return originalLoad.call(this, request, parent, isMain)
}
const load = (name) => require(path.join(root, 'dist-server', 'server', 'utils', 'parsers', name))
let info, comic, ebook
try {
  info = load('parseComicInfoMetadata')
  comic = load('parseComicMetadata')
  ebook = load('parseEbookMetadata')
} finally {
  Module._load = originalLoad
}
const file = (comicPath, ebookFormat = 'cbz') => ({ ebookFormat, metadata: { path: comicPath } })
async function run() {
  const output = {
    exports: {
      info: Object.keys(info), comic: Object.keys(comic), ebook: Object.keys(ebook),
      esModule: [Object.hasOwn(info, '__esModule'), Object.hasOwn(comic, '__esModule'), Object.hasOwn(ebook, '__esModule')],
      infoCallable: { name: info.parse.name, prototype: Object.hasOwn(info.parse, 'prototype') },
      comicCallable: { name: comic.parse.name, prototype: Object.hasOwn(comic.parse, 'prototype') },
      ebookCallable: { name: ebook.parse.name, prototype: Object.hasOwn(ebook.parse, 'prototype') }
    },
    info: [
      info.parse(null),
      info.parse({ ComicInfo: {} }),
      info.parse({ ComicInfo: { Series: [' Saga '], Number: [' 2 '], Summary: [' Story '] } })
    ],
    comic: [
      await comic.parse(file('normal.cbz')),
      await comic.parse(file('missing.cbz')),
      await comic.parse(file('bad-list.cbz')),
      await comic.parse(file('open-fail.cbz'))
    ],
    covers: [
      await comic.extractCoverImage('normal.cbz', 'page2.png', '/tmp/cover.jpg'),
      await comic.extractCoverImage('cover-fail.cbz', 'page2.png', '/tmp/cover.jpg')
    ],
    dispatch: [
      await ebook.parse(null),
      await ebook.parse(file('other.xyz', 'xyz')),
      await ebook.parse(file('book.epub', 'epub')),
      await ebook.parse(file('normal.cbz', 'cbz')),
      await ebook.extractCoverImage(null, '/tmp/cover.jpg'),
      await ebook.extractCoverImage({ path: 'book.epub', ebookFormat: 'epub', ebookCoverPath: 'cover.jpg' }, '/tmp/cover.jpg'),
      await ebook.extractCoverImage({ path: 'normal.cbz', ebookFormat: 'cbz', ebookCoverPath: 'page2.png' }, '/tmp/cover.jpg')
    ],
    calls
  }
  console.log('BEHAVIOR_JSON=' + JSON.stringify(output))
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
