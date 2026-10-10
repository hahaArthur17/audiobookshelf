// Deterministic, offline behavior comparison for the podcast query module.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')

const calls = []
const logger = { debug: (...args) => calls.push(['debug', ...args]), warn: (...args) => calls.push(['warn', ...args]) }
const snapshot = (value, seen = new WeakSet()) => {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'symbol') return value.toString()
  if (typeof value === 'function') return `[function ${value.name}]`
  if (value === undefined) return '[undefined]'
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => snapshot(item, seen))
  const out = {}
  for (const key of Reflect.ownKeys(value)) out[String(key)] = snapshot(value[key], seen)
  return out
}

const makeItem = (id) => ({
  id, libraryId: 'lib', feeds: [{ toOldJSONMinified: () => ({ id: 'feed' }) }],
  toOldJSONMinified() { return { id: this.id, media: { title: this.media?.title }, recentEpisode: this.recentEpisode } },
  toOldJSONExpanded() { return { id: this.id, media: { title: this.media?.title }, recentEpisode: this.recentEpisode } }
})
const makePodcast = (id) => ({
  id, title: 'Episode Test', numEpisodes: 4, libraryItem: makeItem(id), dataValues: { duration: 72 },
  toOldJSON(itemId) { return { id: this.id, itemId } }
})
const makeEpisode = (id) => ({
  podcast: makePodcast(id),
  toOldJSON(itemId) { return { id, itemId } },
  toOldJSONExpanded(itemId) { return { id, itemId } }
})
const models = {
  podcastModel: {
    async count(options) { calls.push(['podcast.count', snapshot(options)]); return 3 },
    async findAll(options) { calls.push(['podcast.findAll', snapshot(options)]); return [makePodcast('pod1')] },
    async findAndCountAll(options) { calls.push(['podcast.findAndCountAll', snapshot(options)]); return { rows: [makePodcast('pod2')], count: 4 } }
  },
  podcastEpisodeModel: {
    async count(options) { calls.push(['episode.count', snapshot(options)]); return 5 },
    async findAll(options) { calls.push(['episode.findAll', snapshot(options)]); return [makeEpisode('ep1')] },
    async findAndCountAll(options) { calls.push(['episode.findAndCountAll', snapshot(options)]); return { rows: [makeEpisode('ep2')], count: 6 } }
  },
  libraryItemModel: { name: 'libraryItemModel' },
  mediaProgressModel: { name: 'mediaProgressModel' },
  feedModel: { name: 'feedModel' },
  sequelize: {
    random() { calls.push(['random']); return 'RANDOM' },
    async query(sql, options) { calls.push(['sql', sql, snapshot(options)]); return [[{ value: 'history', numItems: 2, totalSize: 10, totalDuration: 23, totalItems: 1, numAudioFiles: 2 }], null] }
  },
  async createTextSearchQuery(query) { calls.push(['textQuery', query]); return { matchExpression: (column) => `MATCH(${column})` } }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/queries/libraryItemsPodcastFilters.js')) {
    if (request === '../../Database') return models
    if (request === '../../Logger') return logger
    if (request === '../../utils/profiler') return { profile: (fn) => { calls.push(['profile', fn.name]); return fn } }
    if (request === '../stringifySequelizeQuery') return (options) => { calls.push(['stringify', snapshot(options)]); return JSON.stringify(snapshot(options)) }
  }
  return originalLoad.apply(this, arguments)
}

const priorSettings = global.ServerSettings
const priorDate = global.Date
const priorProfiling = process.env.QUERY_PROFILING
const output = {}
async function main() {
  try {
    global.ServerSettings = { sortingIgnorePrefix: true }
    class FixedDate extends priorDate {
      constructor(...args) { super(...(args.length ? args : [1700000000000])) }
    }
    global.Date = FixedDate
    const target = require(path.join(root, 'dist-server/server/utils/queries/libraryItemsPodcastFilters'))
    output.exports = Object.keys(target).map((key) => [key, typeof target[key], target[key].length, Object.hasOwn(target[key], 'prototype')])
    const user = { id: 'user', canAccessExplicitContent: false, permissions: { accessAllTags: false, itemTagsSelected: ['tag'], selectedTagsNotAccessible: false }, mediaProgresses: [{ podcastId: 'pod2', isFinished: true }] }
    output.permissions = snapshot(target.getUserPermissionPodcastWhereQuery(user))
    output.mediaGroups = ['genres', 'tags', 'languages', 'explicit', 'unknown', null].map((group) => snapshot(target.getMediaGroupQuery(group, 'tag')))
    output.orders = ['addedAt', 'size', 'birthtimeMs', 'mtimeMs', 'media.metadata.author', 'media.metadata.title', 'media.numTracks', 'random', 'other'].map((sort) => snapshot(target.getOrder(sort, true)))
    const cacheUser = { ...user, canAccessExplicitContent: true, permissions: { accessAllTags: true } }
    const options = { where: { libraryId: 'lib' } }
    output.cache = [await target.findAndCountAll(options, models.podcastModel, 2, 0, true), await target.findAndCountAll({ where: { libraryId: 'lib' } }, models.podcastModel, 1, 1, true)]
    target.clearCountCache('podcast', 'afterUpdate')
    output.cache.push(await target.findAndCountAll({ where: { libraryId: 'lib' } }, models.podcastModel, 1, 2, true))
    output.uncached = await target.findAndCountAll({ where: { x: 1 } }, models.podcastModel, 0, 7, false)
    output.items = await target.getFilteredLibraryItems('lib', cacheUser, 'recent', null, 'addedAt', false, ['rssfeed', 'numepisodesincomplete'], 2, 0)
    output.episodes = await target.getFilteredPodcastEpisodes('lib', cacheUser, 'progress', 'in-progress', 'progress', true, 2, 0, true)
    output.recentEpisodes = await target.getRecentEpisodes(cacheUser, { id: 'lib' }, 3, 0)
    output.search = await target.search(cacheUser, { id: 'lib' }, 'hi', 2, 0)
    output.stats = await target.getPodcastLibraryStats('lib')
    output.genres = await target.getGenresWithCount('lib')
    output.longest = await target.getLongestPodcasts('lib', 2)
    process.env.QUERY_PROFILING = '1'
    output.profiled = await target.getFilteredPodcastEpisodes('lib', cacheUser, null, null, 'progress', false, 1, 0)
    output.calls = calls
    console.log(JSON.stringify(snapshot(output), null, 2))
  } finally {
    global.ServerSettings = priorSettings
    global.Date = priorDate
    if (priorProfiling === undefined) delete process.env.QUERY_PROFILING
    else process.env.QUERY_PROFILING = priorProfiling
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
