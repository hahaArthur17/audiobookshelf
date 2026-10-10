// Independent offline comparison for the compiled library query façade.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const calls = []
const item = (id) => ({
  id, size: 12, mediaItemShare: { id: 'share' }, recentEpisode: { id: 'ep' },
  rssFeed: { toOldJSONMinified: () => ({ id: 'feed' }) },
  toOldJSONMinified() { return { id, media: { size: 0, metadata: {} } } }
})
const books = {
  async getFilteredLibraryItems(...args) { calls.push(['book.filtered', args]); return { libraryItems: [item('book')], count: 2 } },
  async getContinueSeriesLibraryItems(...args) { calls.push(['book.continue', args]); return { libraryItems: [item('series')], count: 1 } },
  getLibraryItemsForCollection(collection) { calls.push(['book.collection', collection]); return ['collection-item'] }
}
const podcasts = {
  async getFilteredLibraryItems(...args) { calls.push(['podcast.filtered', args]); return { libraryItems: [item('podcast')], count: 3 } },
  async getFilteredPodcastEpisodes(...args) { calls.push(['podcast.episodes', args]); return { libraryItems: [item('episode')], count: 4 } }
}
const logger = { warn(...args) { calls.push(['warn', ...args]) }, debug(...args) { calls.push(['debug', ...args]) }, error(...args) { calls.push(['error', ...args]) } }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/queries/libraryFilters.js')) {
    if (request === 'sequelize') return { Op: { gte: Symbol('gte'), gt: Symbol('gt') } }
    if (request === '../../Logger') return logger
    if (request === '../../Database') return { libraryFilterData: {} }
    if (request === './libraryItemsBookFilters') return books
    if (request === './libraryItemsPodcastFilters') return podcasts
    if (request === '../../libs/fastSort') return { createNewSortInstance() { return (items) => ({ asc: () => items }) } }
    if (request === '../../utils/profiler') return { profile: (fn) => fn }
  }
  return originalLoad.apply(this, arguments)
}
async function main() {
  try {
    const target = require(path.join(root, 'dist-server/server/utils/queries/libraryFilters'))
    const output = {}
    output.exports = Object.keys(target).map((key) => [key, typeof target[key], target[key].length, Object.hasOwn(target[key], 'prototype')])
    output.decode = ['ZmljdGlvbg==', '%ZZ', ''].map((value) => target.decode(value))
    const options = { filterBy: 'genres.ZmljdGlvbg%3D%3D', sortBy: 'addedAt', sortDesc: true, limit: 3, offset: 1, collapseseries: true, include: ['rssfeed'], mediaType: 'book' }
    output.book = await target.getFilteredLibraryItems('lib', { id: 'u' }, options)
    output.podcast = await target.getFilteredLibraryItems('lib', { id: 'u' }, { ...options, mediaType: 'podcast', filterBy: 'recent' })
    output.borrowed = await target.getFilteredLibraryItems.call({ decode: () => 'borrowed' }, 'lib', null, { ...options, filterBy: 'tags.Zm9v' })
    output.progressBook = await target.getMediaItemsInProgress({ id: 'lib', isBook: true }, { id: 'u' }, ['share'], 4)
    output.progressPodcast = await target.getMediaItemsInProgress({ id: 'lib', isBook: false }, { id: 'u' }, [], 4)
    output.recentBook = await target.getLibraryItemsMostRecentlyAdded({ id: 'lib', isBook: true }, null, ['rssfeed'], 2)
    output.recentPodcast = await target.getLibraryItemsMostRecentlyAdded({ id: 'lib', isBook: false }, null, [], 2)
    output.continueSeries = await target.getLibraryItemsContinueSeries({ id: 'lib', isBook: true }, null, ['rssfeed'], 2)
    output.finishedBook = await target.getMediaFinished({ id: 'lib', isBook: true }, null, [], 2)
    output.finishedPodcast = await target.getMediaFinished({ id: 'lib', isBook: false }, null, [], 2)
    output.collection = target.getLibraryItemsForCollection({ id: 'collection' })
    output.calls = calls
    process.stdout.write(JSON.stringify(output) + '\n')
  } finally {
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
