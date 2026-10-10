// Independent fixed-input comparison for compiled book-series helper.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const events = []
let lastBooks = []
class LibraryItemFixture {
  constructor(id) { this.id = id; this.mediaType = 'book' }
  toOldJSONMinified() { return { id: this.id, media: { duration: this.media?.duration, metadata: {} } } }
}
const makeItem = (id) => new LibraryItemFixture(id)
const makeBook = (id, sequence, inSubseries, duration) => {
  const series = [{ id: 'S', name: 'The Series', bookSeries: { sequence } }]
  if (inSubseries) series.push({ id: 'A', name: 'A Subseries', bookSeries: { sequence } })
  const item = makeItem(id)
  const book = { id: `book-${id}`, title: `Book ${id}`, titleIgnorePrefix: `Book ${id}`, duration, series, libraryItem: item }
  item.media = book
  return book
}
const makeBooks = () => [makeBook('b1', '1', true, 10), makeBook('b2', '2', true, 20), makeBook('b3', '3', false, 30)]
const models = { bookModel: { name: 'book' }, libraryItemModel: { name: 'libraryItem' }, authorModel: { name: 'author' }, seriesModel: { name: 'series', async findByPk(id, options) { events.push(['findByPk', id, JSON.stringify(options)]); lastBooks = id === 'missing' ? [] : makeBooks(); return id === 'missing' ? null : { books: lastBooks } } } }
const Database = { ...models, serverSettings: { sortingIgnorePrefix: false } }
const Logger = { warn: (...args) => events.push(['warn', ...args]) }
const utils = { getTitlePrefixAtEnd: (name) => name.replace(/^The /, '') + ', The', getTitleIgnorePrefix: (name) => name.replace(/^The /, ''), isNullOrNaN: (value) => value === null || isNaN(value) }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/libraryHelpers.js')) {
    if (request === '../Database') return Database
    if (request === '../Logger') return Logger
    if (request === '../utils/index') return utils
  }
  return originalLoad.apply(this, arguments)
}
const summarizeItem = (item) => ({ id: item.id, proto: item instanceof LibraryItemFixture, collapsed: item.collapsedSeries?.id, mediaId: item.media?.id })
const normalize = (value) => JSON.parse(JSON.stringify(value))
async function main() {
  try {
    const target = require(path.join(root, 'dist-server/server/utils/libraryHelpers'))
    const output = { exports: Object.keys(target).map((key) => [key, target[key].length, Object.hasOwn(target[key], 'prototype')]) }
    const books = makeBooks()
    output.grouping = normalize(target.getSeriesFromBooks(books.map((book) => book.libraryItem), 'S', false))
    output.groupingHidden = normalize(target.getSeriesFromBooks(books.map((book) => book.libraryItem), null, true))
    output.collapsed = target.collapseBookSeries(books.map((book) => book.libraryItem), 'S', false).map(summarizeItem)
    const user = { checkCanAccessLibraryItem: (item) => { events.push(['access', item.id]); return item.id !== 'b3' } }
    const library = { settings: { hideSingleBookSeries: false } }
    const payload = { sortBy: 'invalid-sort', sortDesc: false, limit: 2, page: 0 }
    output.handled = normalize(await target.handleCollapseSubseries(payload, 'S', user, library))
    output.payload = normalize(payload)
    output.deletedAssociations = lastBooks.map((book) => [book.id, Object.hasOwn(book, 'libraryItem')])
    const titlePayload = { sortBy: 'media.metadata.title', sortDesc: true, limit: 0, page: 0 }
    Database.serverSettings.sortingIgnorePrefix = true
    output.titleHandled = normalize(await target.handleCollapseSubseries(titlePayload, 'S', user, library))
    output.titlePayload = normalize(titlePayload)
    const missingPayload = { sortBy: 'sequence', sortDesc: false, limit: 0, page: 0 }
    output.missing = await target.handleCollapseSubseries(missingPayload, 'missing', user, library)
    output.missingPayload = normalize(missingPayload)
    output.events = events
    console.log(JSON.stringify(output, null, 2))
  } finally { Module._load = originalLoad }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
