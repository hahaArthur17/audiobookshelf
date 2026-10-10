// Offline fixed-input query sample; no database connection is opened.
const path = require('path')
const util = require('util')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const Database = load('Database')
const Logger = load('Logger')
const bookFilters = load('utils/queries/libraryItemsBookFilters')
const podcastFilters = load('utils/queries/libraryItemsPodcastFilters')
const seriesFilters = load('utils/queries/seriesFilters')
const itemFilters = load('utils/queries/libraryItemFilters')

const calls = []
const book = { findAll: async (options) => {
  calls.push(['book', util.inspect(options, { depth: 4, sorted: true })])
  return [{ title: 'Book', libraryItem: { id: 'book-item', size: 12 } }]
} }
const podcast = { findAll: async (options) => {
  calls.push(['podcast', util.inspect(options, { depth: 4, sorted: true })])
  return [{ title: 'Podcast', libraryItem: { id: 'podcast-item', size: 8 } }]
} }
const series = { findAndCountAll: async (options) => {
  calls.push(['series', util.inspect(options, { depth: 4, sorted: true })])
  const libraryItem = { id: 'series-book', toOldJSONMinified() { return { id: this.id, mediaTitle: this.media.title } } }
  return { count: 1, rows: [{
    dataValues: { totalDuration: 42 },
    feeds: [{ toOldJSONMinified() { return { id: 'feed' } } }],
    bookSeries: [{ sequence: '2', book: { title: 'Two', libraryItem } }],
    toOldJSON() { return { id: 'series-1' } }
  }] }
} }
const libraryItem = { findAll: async (options) => {
  calls.push(['libraryItem', util.inspect(options, { depth: 4, sorted: true })])
  return [{ id: 'big', size: 100, media: { title: 'Big' } }]
} }
const prior = {
  sequelize: Database.sequelize,
  serverSettings: global.ServerSettings,
  warn: Logger.warn,
  bookSearch: bookFilters.search,
  podcastSearch: podcastFilters.search
}
Database.sequelize = {
  models: { book, podcast, series, libraryItem, author: 'AUTHOR', bookAuthor: 'BOOK_AUTHOR', podcastEpisode: 'PODCAST_EPISODE', bookSeries: 'BOOK_SERIES', feed: 'FEED' },
  random() { return 'RANDOM' }
}
global.ServerSettings = { sortingIgnorePrefix: true }
Logger.warn = (...args) => calls.push(['warn', ...args])
bookFilters.search = async (...args) => ({ via: 'book', args: args.map((arg) => typeof arg === 'object' ? arg.id || null : arg) })
podcastFilters.search = async (...args) => ({ via: 'podcast', args: args.map((arg) => typeof arg === 'object' ? arg.id || null : arg) })

async function run() {
  const user = { id: 'u1', canAccessExplicitContent: false, permissions: { accessAllTags: false, itemTagsSelected: ['safe'], selectedTagsNotAccessible: false } }
  const lib = { id: 'lib1', isBook: true, settings: { hideSingleBookSeries: true } }
  const summarizeItems = (items) => items.map((item) => ({
    id: item.id,
    mediaTitle: item.media?.title,
    mediaHasLibraryItem: Object.hasOwn(item.media || {}, 'libraryItem')
  }))
  const results = {
    exports: { series: Object.keys(seriesFilters), items: Object.keys(itemFilters), defaults: [Object.hasOwn(seriesFilters, 'default'), Object.hasOwn(itemFilters, 'default')] },
    decode: [seriesFilters.decode('YQ=='), seriesFilters.decode('%bad')],
    series: await seriesFilters.getFilteredSeries(lib, user, 'tags.YQ==', 'name', true, ['rssfeed'], 5, 2),
    tags: summarizeItems(await itemFilters.getAllLibraryItemsWithTags(['tag'])),
    genres: summarizeItems(await itemFilters.getAllLibraryItemsWithGenres(['genre'])),
    narrators: summarizeItems(await itemFilters.getAllLibraryItemsWithNarrators(['Narrator'], lib.id)),
    largest: await itemFilters.getLargestItems(lib.id, 2),
    bookSearch: await itemFilters.search(user, lib, 'query', '5'),
    podcastSearch: await itemFilters.search(user, { id: 'lib2', isBook: false }, 'query', 4),
    calls
  }
  console.log('BEHAVIOR_JSON=' + JSON.stringify(results))
}
run().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => {
  Database.sequelize = prior.sequelize
  global.ServerSettings = prior.serverSettings
  Logger.warn = prior.warn
  bookFilters.search = prior.bookSearch
  podcastFilters.search = prior.podcastSearch
})
