const fs = require('fs')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { createLibrary } = require('./helpers/seed-library')
const { createFileBook, createFilePodcast } = require('./helpers/seed-items-extra')
const { libraryFolderPath, visibleFileBook } = require('./helpers/seed-delivery-extra')
const Database = require('../../server/Database')
const RssFeedManager = require('../../server/managers/RssFeedManager')

const HOST_PREFIX = 'https://abs.example.test'
const ADDRESS = 'https://abs.example.test'

// The PUBLIC feed routes (GET /feed/:slug, /feed/:slug/item/:episodeId/*, /feed/:slug/cover*) served by RssFeedManager.
// The harness only mounts /api, so these three routes are mounted on api.app exactly as Server.js mounts them (no login),
// with req.originalHostPrefix fixed (Server.js derives it from the request origin / RouterBasePath).
describe('RssFeedPublic (characterization)', () => {
  let api, lf, podLf, itemPng, itemJpg, itemNoCover, pod, collection, series

  const mountFeedRoutes = () => {
    api.app.use((req, res, next) => {
      req.originalHostPrefix = HOST_PREFIX
      next()
    })
    api.app.get('/feed/:slug', (req, res) => RssFeedManager.getFeed(req, res))
    api.app.get('/feed/:slug/cover*', (req, res) => RssFeedManager.getFeedCover(req, res))
    api.app.get('/feed/:slug/item/:episodeId/*', (req, res) => RssFeedManager.getFeedItem(req, res))
  }

  beforeEach(async () => {
    api = await startApi()
    await api.seed.users()
    lf = await createLibrary({ name: 'Books', path: libraryFolderPath(api) })
    podLf = await createLibrary({ name: 'Pods', mediaType: 'podcast', path: libraryFolderPath(api, 'pods') })
    itemPng = await visibleFileBook(lf, { title: 'Book Png', n: 1, authors: ['Ann Author'], series: [{ name: 'Saga', sequence: '1' }], cover: 'cover.png', images: [{ filename: 'cover.png', ino: '190' }] })
    itemJpg = await visibleFileBook(lf, { title: 'Book Jpg', n: 2, authors: ['Bob Writer'], series: [{ name: 'Saga', sequence: '2' }], cover: 'cover.jpg', images: [{ filename: 'cover.jpg', ino: '290' }] })
    itemNoCover = await visibleFileBook(lf, { title: 'Book Plain', n: 3, authors: ['Cy Plain'] })
    pod = await createFilePodcast(podLf, { title: 'Pod', author: 'Pat', episodes: [{ title: 'Ep 1', filename: 'ep1.mp3', ino: '501' }, { title: 'Ep 2', filename: 'ep2.mp3', ino: '502' }] })
    await Database.podcastModel.update({ explicit: false }, { where: { id: pod.podcast.id } })
    collection = (await api.request('POST', '/api/collections', { as: 'admin', json: { libraryId: lf.library.id, name: 'Favourites', description: 'my picks', books: [itemPng.libraryItem.id, itemJpg.libraryItem.id] } })).body
    series = await Database.seriesModel.findOne({ where: { name: 'Saga' } })
    mountFeedRoutes()
    api.emitted.splice(0)
  })

  afterEach(async () => {
    await api.stop()
  })

  const body = (slug, over = {}) => ({ serverAddress: ADDRESS, slug, ...over })
  const open = async (kind, id, json) => {
    const res = await api.request('POST', `/api/feeds/${kind}/${id}/open`, { as: 'admin', json })
    if (res.status !== 200) throw new Error(`open feed failed: ${res.status} ${JSON.stringify(res.body)}`)
    return res.body.feed
  }
  const get = (url, headers) => api.request('GET', url, { responseHeaders: headers })
  // image bodies are binary (not representable in a json snapshot): only status and headers are recorded; content-length pins the size
  const getMeta = async (url, headers) => {
    const { status, headers: h } = await get(url, headers)
    return { status, headers: h }
  }
  const findFeed = (slug) => Database.feedModel.findOne({ where: { slug }, include: Database.feedEpisodeModel })
  const baseName = (p) => p.split('/').pop()

  // Feed episode ids are random UUIDs and the order of feedEpisodes is not stable (no ORDER BY): every episode id is mapped to a
  // label made of its file name, and the <item> blocks of the xml are sorted. Dates (pubDate/lastBuildDate) are masked.
  const idsFor = async (slug, extra = []) => {
    const feed = await findFeed(slug)
    const ids = new Map([[feed.id.toLowerCase(), '<feed>'], ...extra.map(([id, label]) => [id.toLowerCase(), label])])
    for (const ep of feed.feedEpisodes) ids.set(ep.id.toLowerCase(), `<episode ${ep.filePath.split('/').slice(-2).join('/')}>`)
    return ids
  }
  const titleOf = (s) => s.match(/<title>.*?<\/title>/s)?.[0] || ''
  const maskXml = (xml, ids) => {
    // ids are replaced BEFORE sorting: titles can tie (both books have a track called part1) and the uuids are random
    let text = String(xml)
    for (const [id, label] of ids) text = text.split(id).join(label)
    const masked = text
      .replace(/<pubDate>[^<]*<\/pubDate>/g, '<pubDate>[date]</pubDate>')
      .replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>[date]</lastBuildDate>')
      .replace(/></g, '>\n<') // the rss library writes the whole document on one line
    const first = masked.indexOf('<item>')
    if (first === -1) return masked.split('\n')
    const last = masked.lastIndexOf('</item>') + '</item>'.length
    const items = masked
      .slice(first, last)
      .split(/(?=<item>)/)
      .map((s) => s.trim())
      .sort((a, b) => (titleOf(a) + a < titleOf(b) + b ? -1 : 1))
    return [...masked.slice(0, first).split('\n'), ...items.flatMap((i) => i.split('\n')), ...masked.slice(last).split('\n')]
  }
  const snapFeed = (ctx, label, res, ids) => {
    matchSnapshot(ctx, { status: res.status, headers: res.headers, xml: maskXml(res.body, ids) }, { label, ids, tmpDirs: [api.tmp] })
  }
  const feedRows = async () => (await Database.feedModel.findAll({ order: [['slug', 'ASC']] })).map((f) => ({ slug: f.slug, entityType: f.entityType, title: f.title }))
  const entityUpdatedAt = async (slug) => (await Database.feedModel.findOne({ where: { slug } })).entityUpdatedAt.getTime()

  describe('GET /feed/:slug', () => {
    it('serves real xml for a book item feed', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-book', { metadataDetails: { preventIndexing: false, ownerName: 'Ann', ownerEmail: 'ann@example.test' } }))
      const ids = await idsFor('feed-book', [[itemPng.libraryItem.id, '<item-png>']])
      snapFeed(this, 'book', await get('/feed/feed-book', ['content-type']), ids)
    })
    it('serves a podcast feed with its episodes', async function () {
      await open('item', pod.libraryItem.id, body('feed-pod'))
      const ids = await idsFor('feed-pod', [[pod.libraryItem.id, '<pod>']])
      snapFeed(this, 'podcast', await get('/feed/feed-pod', ['content-type']), ids)
    })
    it('serves a collection feed', async function () {
      await open('collection', collection.id, body('feed-collection', { metadataDetails: { preventIndexing: false } }))
      const ids = await idsFor('feed-collection', [[collection.id, '<collection>']])
      snapFeed(this, 'collection', await get('/feed/feed-collection', ['content-type']), ids)
    })
    it('serves a series feed', async function () {
      await open('series', series.id, body('feed-series', { metadataDetails: { ownerName: 'Series Owner' } }))
      const ids = await idsFor('feed-series', [[series.id, '<series>']])
      snapFeed(this, 'series', await get('/feed/feed-series', ['content-type']), ids)
    })
    it('404s for an unknown slug and after the feed is closed', async function () {
      const feed = await open('item', itemPng.libraryItem.id, body('feed-book'))
      matchSnapshot(this, await get('/feed/unknown', ['content-type']), { label: 'unknown slug' })
      await api.request('POST', `/api/feeds/${feed.id}/close`, { as: 'admin' })
      matchSnapshot(this, await get('/feed/feed-book', ['content-type']), { label: 'closed feed' })
    })
    it('does not rewrite an up to date feed on request', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-book'))
      const before = await Database.feedModel.findOne({ where: { slug: 'feed-book' } })
      const first = await get('/feed/feed-book')
      const second = await get('/feed/feed-book')
      const after = await Database.feedModel.findOne({ where: { slug: 'feed-book' } })
      matchSnapshot(this, { bothOk: first.status === 200 && second.status === 200, feedRowUntouched: before.updatedAt.getTime() === after.updatedAt.getTime() })
    })
  })

  describe('stale feed rebuild (checkFeedRequiresUpdate)', () => {
  // The stale check compares updatedAt values and the harness hands out strictly increasing timestamps that can run ahead of the
  // wall clock, so a plain Model.update (which stamps "now") is not reliably newer than the feed. Stamp changed rows one minute ahead.
  const touch = (table, where, replacements) => {
    const updatedAt = new Date(Date.now() + 60 * 1000).toISOString().replace('T', ' ').replace('Z', ' +00:00')
    return Database.sequelize.query(`UPDATE ${table} SET updatedAt = :updatedAt WHERE ${where}`, { replacements: { updatedAt, ...replacements } })
  }

    it('rebuilds a book item feed when the book changed after the feed was opened', async function () {
      await open('item', itemJpg.libraryItem.id, body('feed-book'))
      snapFeed(this, 'before change', await get('/feed/feed-book', ['content-type']), await idsFor('feed-book', [[itemJpg.libraryItem.id, '<item-jpg>']]))
      await Database.bookModel.update({ title: 'Renamed Book' }, { where: { id: itemJpg.book.id } })
      await touch('books', 'id = :id', { id: itemJpg.book.id })
      const res = await get('/feed/feed-book', ['content-type'])
      snapFeed(this, 'after change', res, await idsFor('feed-book', [[itemJpg.libraryItem.id, '<item-jpg>']]))
      matchSnapshot(this, { title: (await Database.feedModel.findOne({ where: { slug: 'feed-book' } })).title }, { label: 'stored feed row follows the rebuild' })
    })
    it('rebuilds a book item feed when only the library item changed', async function () {
      await open('item', itemJpg.libraryItem.id, body('feed-book'))
      const stale = await entityUpdatedAt('feed-book')
      await Database.sequelize.query('UPDATE libraryItems SET updatedAt = :updatedAt WHERE id = :id', { replacements: { updatedAt: new Date(Date.now() + 60 * 1000).toISOString().replace('T', ' ').replace('Z', ' +00:00'), id: itemJpg.libraryItem.id } })
      await get('/feed/feed-book')
      matchSnapshot(this, { entityUpdatedAtAdvanced: (await entityUpdatedAt('feed-book')) > stale })
    })
    it('rebuilds a podcast feed when an episode changed', async function () {
      await open('item', pod.libraryItem.id, body('feed-pod'))
      await Database.podcastEpisodeModel.update({ title: 'Ep 1 renamed' }, { where: { podcastId: pod.podcast.id, index: 1 } })
      await touch('podcastEpisodes', 'podcastId = :id AND `index` = 1', { id: pod.podcast.id })
      const res = await get('/feed/feed-pod', ['content-type'])
      snapFeed(this, 'after episode change', res, await idsFor('feed-pod', [[pod.libraryItem.id, '<pod>']]))
    })
    it('rebuilds a collection feed when a book changed and when the number of tracks changed', async function () {
      await open('collection', collection.id, body('feed-collection'))
      const stale = await entityUpdatedAt('feed-collection')
      await Database.bookModel.update({ title: 'Renamed Jpg' }, { where: { id: itemJpg.book.id } })
      await touch('books', 'id = :id', { id: itemJpg.book.id })
      await get('/feed/feed-collection')
      matchSnapshot(this, { entityUpdatedAtAdvanced: (await entityUpdatedAt('feed-collection')) > stale }, { label: 'book changed' })
      // one audio file excluded -> fewer tracks than feed episodes
      const book = await Database.bookModel.findByPk(itemPng.book.id)
      const audioFiles = JSON.parse(JSON.stringify(book.audioFiles))
      audioFiles[1].exclude = true
      audioFiles[1].index = -1
      // silent: the book's updatedAt stays as it was, so only the track count (not the timestamps) says the feed is stale
      await Database.bookModel.update({ audioFiles }, { where: { id: book.id }, silent: true })
      const res = await get('/feed/feed-collection', ['content-type'])
      snapFeed(this, 'track excluded', res, await idsFor('feed-collection', [[collection.id, '<collection>']]))
      matchSnapshot(this, { episodeRows: await Database.feedEpisodeModel.count() }, { label: 'episode rows after rebuild' })
    })
    it('rebuilds a series feed when a book changed', async function () {
      await open('series', series.id, body('feed-series'))
      const stale = await entityUpdatedAt('feed-series')
      await Database.bookModel.update({ title: 'Renamed Jpg' }, { where: { id: itemJpg.book.id } })
      await touch('books', 'id = :id', { id: itemJpg.book.id })
      await get('/feed/feed-series')
      matchSnapshot(this, { entityUpdatedAtAdvanced: (await entityUpdatedAt('feed-series')) > stale })
    })
  })

  describe('GET /feed/:slug/item/:episodeId/*', () => {
    const itemHeaders = ['content-type', 'content-disposition', 'content-length', 'accept-ranges', 'cache-control', 'etag']
    it('serves the audio file of a book feed episode', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-book'))
      const ids = await idsFor('feed-book')
      const feed = await findFeed('feed-book')
      const out = {}
      for (const ep of [...feed.feedEpisodes].sort((a, b) => (a.filePath < b.filePath ? -1 : 1))) {
        const name = baseName(ep.filePath)
        out[name] = await get(`/feed/feed-book/item/${ep.id}/${name}`, itemHeaders)
      }
      matchSnapshot(this, out, { label: 'both tracks', ids, tmpDirs: [api.tmp] })
    })
    it('serves the audio file of a podcast episode', async function () {
      await open('item', pod.libraryItem.id, body('feed-pod'))
      const ids = await idsFor('feed-pod')
      const ep = (await findFeed('feed-pod')).feedEpisodes.find((e) => e.filePath.endsWith('ep2.mp3'))
      matchSnapshot(this, await get(`/feed/feed-pod/item/${ep.id}/ep2.mp3`, itemHeaders), { label: 'episode 2', ids })
    })
    it('ignores the trailing file name and serves a collection and a series episode', async function () {
      await open('collection', collection.id, body('feed-collection'))
      await open('series', series.id, body('feed-series'))
      const ids = new Map([...(await idsFor('feed-collection')), ...(await idsFor('feed-series'))])
      const collEp = (await findFeed('feed-collection')).feedEpisodes.find((e) => e.filePath.endsWith('Book Jpg/part2.mp3'))
      const serEp = (await findFeed('feed-series')).feedEpisodes.find((e) => e.filePath.endsWith('Book Png/part1.mp3'))
      matchSnapshot(this, { collection: await get(`/feed/feed-collection/item/${collEp.id}/whatever.mp3`, itemHeaders), series: await get(`/feed/feed-series/item/${serEp.id}/x.mp3`, itemHeaders) }, { label: 'any file name', ids })
    })
    it('sets the audio mime type from the file extension (m4b)', async function () {
      const m4b = await createFileBook(lf, { title: 'Book M4b', audio: [{ filename: 'book.m4b', ino: '701', duration: 60 }], explicit: false, extra: { id: 'b0000000-0000-4000-8000-000000000077' } })
      await open('item', m4b.libraryItem.id, body('feed-m4b'))
      const ep = (await findFeed('feed-m4b')).feedEpisodes[0]
      const res = await get(`/feed/feed-m4b/item/${ep.id}/book.m4b`, itemHeaders)
      const xml = await get('/feed/feed-m4b')
      matchSnapshot(this, { item: res, enclosureTypeInFeed: (String(xml.body).match(/<enclosure[^>]*type="[^"]*"/) || [null])[0].replace(/url="[^"]*"/, 'url=<url>') })
    })
    it('404s for an unknown slug, an unknown episode, an episode of another feed and a missing trailing segment', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-book'))
      await open('item', pod.libraryItem.id, body('feed-pod'))
      const podEp = (await findFeed('feed-pod')).feedEpisodes[0]
      const bookEp = (await findFeed('feed-book')).feedEpisodes[0]
      const ids = new Map([[podEp.id.toLowerCase(), '<pod-episode>'], [bookEp.id.toLowerCase(), '<book-episode>']])
      matchSnapshot(
        this,
        {
          unknownSlug: await get(`/feed/unknown/item/${bookEp.id}/a.mp3`, ['content-type']),
          unknownEpisode: await get('/feed/feed-book/item/unknown-episode/a.mp3', ['content-type']),
          episodeOfOtherFeed: await get(`/feed/feed-book/item/${podEp.id}/a.mp3`, ['content-type']),
          noTrailingSegment: await get(`/feed/feed-book/item/${bookEp.id}`, ['content-type'])
        },
        { ids }
      )
    })
    it('404s when the audio file is gone from disk', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-book'))
      const ep = (await findFeed('feed-book')).feedEpisodes.find((e) => e.filePath.endsWith('part1.mp3'))
      fs.rmSync(ep.filePath)
      matchSnapshot(this, await get(`/feed/feed-book/item/${ep.id}/a.mp3`, ['content-type']), { tmpDirs: [api.tmp] })
    })
  })

  describe('GET /feed/:slug/cover*', () => {
    it('serves a .png cover with its mime type', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-png'))
      matchSnapshot(this, await getMeta('/feed/feed-png/cover.png', ['content-type', 'content-length']))
    })
    it('serves a .jpg cover with its mime type', async function () {
      await open('item', itemJpg.libraryItem.id, body('feed-jpg'))
      matchSnapshot(this, await getMeta('/feed/feed-jpg/cover.jpg', ['content-type', 'content-length']))
    })
    it('serves the cover of a collection and a series (first book with a cover)', async function () {
      await open('collection', collection.id, body('feed-collection'))
      await open('series', series.id, body('feed-series'))
      const row = async (slug) => baseName((await Database.feedModel.findOne({ where: { slug } })).coverPath)
      matchSnapshot(this, {
        collection: await getMeta('/feed/feed-collection/cover.png', ['content-type']),
        series: await getMeta('/feed/feed-series/cover.png', ['content-type']),
        collectionCoverFile: await row('feed-collection'),
        seriesCoverFile: await row('feed-series')
      })
    })
    it('derives the mime type from the stored cover path, not from the requested path', async function () {
      await open('item', itemJpg.libraryItem.id, body('feed-jpg'))
      matchSnapshot(this, {
        asPng: await getMeta('/feed/feed-jpg/cover.png', ['content-type']),
        noExtension: await getMeta('/feed/feed-jpg/cover', ['content-type'])
      })
    })
    it('404s without a cover, for an unknown slug and when the cover file is gone', async function () {
      await open('item', itemNoCover.libraryItem.id, body('feed-plain'))
      await open('item', itemJpg.libraryItem.id, body('feed-jpg'))
      const out = { noCover: await getMeta('/feed/feed-plain/cover.jpg', ['content-type']), unknownSlug: await getMeta('/feed/unknown/cover.jpg', ['content-type']) }
      fs.rmSync((await Database.feedModel.findOne({ where: { slug: 'feed-jpg' } })).coverPath)
      out.fileGone = await getMeta('/feed/feed-jpg/cover.jpg', ['content-type'])
      out.plainFeedImageUrl = (await Database.feedModel.findOne({ where: { slug: 'feed-plain' } })).imageURL
      matchSnapshot(this, out)
    })
  })

  describe('RssFeedManager.init()', () => {
    it('removes feeds whose entity no longer exists and keeps valid ones', async function () {
      await open('item', itemPng.libraryItem.id, body('feed-book'))
      await open('item', pod.libraryItem.id, body('feed-pod'))
      await open('collection', collection.id, body('feed-collection'))
      await open('series', series.id, body('feed-series'))
      await open('item', itemNoCover.libraryItem.id, body('feed-gone-item'))
      const userId = (await Database.feedModel.findOne()).userId
      const dangling = (slug, entityType, entityId) => Database.feedModel.create({ slug, entityType, entityId, entityUpdatedAt: new Date(), serverAddress: ADDRESS, feedURL: `/feed/${slug}`, title: slug, userId })
      await dangling('dangling-item', 'libraryItem', 'f0000000-0000-4000-8000-000000000001')
      await dangling('dangling-collection', 'collection', 'f0000000-0000-4000-8000-000000000002')
      await dangling('dangling-series', 'series', 'f0000000-0000-4000-8000-000000000003')
      // entity deleted after the feed was opened
      await Database.libraryItemModel.destroy({ where: { id: itemNoCover.libraryItem.id } })
      matchSnapshot(this, await feedRows(), { label: 'before init' })
      const result = await RssFeedManager.init()
      matchSnapshot(this, { result: result ?? null, rows: await feedRows() }, { label: 'after init' })
      matchSnapshot(this, { removed: (await get('/feed/dangling-item')).status, kept: (await get('/feed/feed-book')).status }, { label: 'served after init' })
    })
    it('keeps every feed when all entities exist, and does nothing without feeds', async function () {
      await RssFeedManager.init()
      await open('item', itemPng.libraryItem.id, body('feed-book'))
      await open('collection', collection.id, body('feed-collection'))
      await RssFeedManager.init()
      matchSnapshot(this, await feedRows())
    })
  })
})
