const { expect } = require('chai')
const fs = require('fs')
const path = require('path')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { createLibrary, createBook } = require('./helpers/seed-library')
const { audioBookExtra, createPlaybackSession, createProgress, setRow, createUser } = require('./helpers/seed-users-extra')
const { b64, addPodcast, seedPodcastWorld, seedPodcastProgress, worldIds } = require('./helpers/seed-query-filters-podcast')
const Database = require('../../server/Database')
const podcastFilters = require('../../server/utils/queries/libraryItemsPodcastFilters')
const authorFilters = require('../../server/utils/queries/authorFilters')

// Podcast query filters (libraryItemsPodcastFilters), authorFilters, adminStats and userStats, reached through the real routes
// (library items / personalized / recent-episodes / search / stats / filterdata, author and stats routes) on one deterministic world, see
// helpers/seed-query-filters-podcast.js. Compact "views" (titles instead of full bodies) keep the matrices readable; full bodies are snapshotted too.
describe('QueryFiltersPodcast (characterization)', () => {
  let api, users, world

  beforeEach(async () => {
    api = await startApi()
    users = await api.seed.users()
    world = await seedPodcastWorld(users)
    await seedPodcastProgress(world)
  })

  afterEach(async () => {
    await api.stop()
  })

  const L = () => `/api/libraries/${world.lf.library.id}`
  const get = (url, as = 'admin') => api.request('GET', url, { as })
  const O = (ctx, label) => ({ label, ids: ctx.ids })
  const ids = () => worldIds(world)

  // titles + counts of a library items listing
  const listView = (res) => (res.status === 200 ? { status: res.status, total: res.body.total, limit: res.body.limit, page: res.body.page, titles: res.body.results.map((r) => r.media.metadata.title) } : { status: res.status, body: res.body })
  // shelves: id, type, total and entity titles ("podcast / episode" for episode shelves)
  const shelfView = (res) => (res.status === 200 ? res.body.map((s) => ({ id: s.id, type: s.type, total: s.total, entities: s.entities.map((e) => (e.recentEpisode ? `${e.media.metadata.title} / ${e.recentEpisode.title}` : e.media.metadata.title)) })) : { status: res.status, body: res.body })
  const filters = (group, value) => `filter=${group}.${b64(value)}`

  describe('GET /api/libraries/:id/items (podcast library)', () => {
    it('lists the library with full and minified bodies', async function () {
      this.ids = ids()
      const full = await get(`${L()}/items`)
      expect(full.status).to.equal(200)
      expect(full.body.total).to.equal(6)
      expect(full.body.results).to.have.length(6)
      matchSnapshot(this, { res: full }, O(this, 'admin full'))
      const minified = await get(`${L()}/items?minified=1&limit=2&page=1`)
      expect(minified.body.results).to.have.length(2)
      matchSnapshot(this, { res: minified }, O(this, 'admin minified page 2'))
      expect((await get(`${L()}/items`, 'root')).body.total).to.equal(6)
    })

    it('scopes by library and requires an accessible library', async function () {
      this.ids = ids()
      const other = await get(`/api/libraries/${world.other.library.id}/items`)
      expect(other.body.total).to.equal(1)
      matchSnapshot(this, listView(other), O(this, 'other library'))
      const limited = await createUser({ username: 'limitedLib', type: 'user', permissions: { accessAllLibraries: false, librariesAccessible: [world.other.library.id] } })
      expect(limited.id).to.be.a('string')
      matchSnapshot(this, { forbidden: (await get(`${L()}/items`, 'limitedLib')).status, allowed: listView(await get(`/api/libraries/${world.other.library.id}/items`, 'limitedLib')) }, O(this, 'library restricted user'))
      matchSnapshot(this, { unknown: (await get('/api/libraries/nope/items')).status, anonymous: (await api.request('GET', `${L()}/items`)).status }, O(this, 'unknown and anonymous'))
    })

    it('filters by genres, tags and languages (base64 values)', async function () {
      this.ids = ids()
      const out = {}
      for (const [group, values] of [
        ['genres', ['Tech', 'News', 'Comedy', 'Nope', '']],
        ['tags', ['kids', 'daily', 'adult', 'misc', 'Kids']],
        ['languages', ['en', 'de', 'fr', 'xx']]
      ]) {
        for (const value of values) out[`${group}=${value}`] = listView(await get(`${L()}/items?${filters(group, value)}`))
      }
      expect(out['genres=Tech'].titles).to.deep.equal(['The Alpha Show', 'A Gamma Hour', 'Zeta'])
      expect(out['languages=en'].total).to.equal(3)
      matchSnapshot(this, out, O(this, 'group filters as admin'))
    })

    it('filters by explicit, issues, feed-open, recent and ignores filter groups that do not apply to podcasts', async function () {
      this.ids = ids()
      const out = {}
      for (const f of ['explicit', 'issues', 'feed-open', 'recent', `progress.${b64('finished')}`, `tracks.${b64('multi')}`, `series.${b64('x')}`, `authors.${b64('x')}`, 'missing', 'bogus-filter', 'genres', `missing.${b64('x')}`]) out[f] = listView(await get(`${L()}/items?filter=${f}`))
      expect(out.explicit.titles).to.deep.equal(['beta cast'])
      expect(out.issues.titles).to.deep.equal(['Delta', 'Epsilon'])
      expect(out['feed-open'].titles).to.deep.equal(['A Gamma Hour'])
      expect(out.recent.titles).to.not.include('Delta')
      matchSnapshot(this, out, O(this, 'special filters as admin'))
    })

    it('applies explicit-content and tag permissions to every filter', async function () {
      this.ids = ids()
      const out = {}
      for (const as of ['root', 'user', 'guest', 'kidsOnly', 'noKids']) {
        out[as] = {}
        for (const f of ['', 'filter=explicit', 'filter=issues', 'filter=recent', filters('genres', 'Tech'), filters('tags', 'kids'), filters('tags', 'adult'), filters('languages', 'en')]) out[as][f || 'none'] = listView(await get(`${L()}/items?${f}`, as))
      }
      expect(out.user.none.titles).to.not.include('beta cast')
      expect(out.kidsOnly.none.titles).to.deep.equal(['The Alpha Show', 'Delta'])
      expect(out.noKids.none.titles).to.deep.equal(['beta cast', 'A Gamma Hour', 'Epsilon', 'Zeta'])
      matchSnapshot(this, out, O(this, 'permissions by user and filter'))
    })

    it('sorts by every supported key in both directions', async function () {
      this.ids = ids()
      const out = {}
      for (const sort of ['addedAt', 'size', 'birthtimeMs', 'mtimeMs', 'media.metadata.author', 'media.metadata.title', 'media.numTracks', 'media.duration', 'bogus', '']) {
        for (const desc of ['0', '1']) out[`${sort || 'none'} desc=${desc}`] = listView(await get(`${L()}/items?sort=${sort}&desc=${desc}`)).titles
      }
      expect(out['size desc=1']).to.deep.equal(['A Gamma Hour', 'The Alpha Show', 'Zeta', 'Epsilon', 'beta cast', 'Delta'])
      expect(out['size desc=0']).to.deep.equal(['Delta', 'beta cast', 'Epsilon', 'Zeta', 'The Alpha Show', 'A Gamma Hour'])
      matchSnapshot(this, out, O(this, 'sort matrix'))
    })

    it('sorts by title with and without ignoring prefixes', async function () {
      this.ids = ids()
      const out = {}
      for (const ignore of [false, true]) {
        global.ServerSettings.sortingIgnorePrefix = ignore
        // (the API cache is keyed by url, so the setting change needs a different url)
        for (const desc of ['0', '1']) out[`ignorePrefix=${ignore} desc=${desc}`] = listView(await get(`${L()}/items?sort=media.metadata.title&desc=${desc}&ignore=${ignore}`)).titles
      }
      expect(out['ignorePrefix=false desc=0'][0]).to.equal('A Gamma Hour')
      expect(out['ignorePrefix=true desc=0'][0]).to.equal('The Alpha Show')
      matchSnapshot(this, out, O(this, 'title sort'))
    })

    it('sorts filtered and restricted lists', async function () {
      this.ids = ids()
      const out = {}
      for (const [as, query] of [
        ['admin', `${filters('genres', 'Tech')}&sort=size&desc=1`],
        ['admin', `${filters('languages', 'en')}&sort=media.metadata.author`],
        ['admin', `filter=issues&sort=media.metadata.title&desc=1`],
        ['user', 'sort=size'],
        ['user', 'sort=media.metadata.author&desc=1'],
        ['kidsOnly', 'sort=mtimeMs&desc=1'],
        ['noKids', 'sort=birthtimeMs']
      ]) {
        out[`${as} ${query}`] = listView(await get(`${L()}/items?${query}`, as)).titles
      }
      matchSnapshot(this, out, O(this, 'filtered and restricted sorts'))
    })

    it('random sort returns every item once', async function () {
      const res = await get(`${L()}/items?sort=random`)
      expect(res.body.total).to.equal(6)
      expect(res.body.results.map((r) => r.media.metadata.title).sort()).to.deep.equal(['A Gamma Hour', 'Delta', 'Epsilon', 'The Alpha Show', 'Zeta', 'beta cast'])
      const limited = await get(`${L()}/items?sort=random&limit=2`)
      expect(limited.body.results).to.have.length(2)
      expect(limited.body.total).to.equal(6)
      matchSnapshot(this, { total: res.body.total, limitedCount: limited.body.results.length, limitedTotal: limited.body.total }, { label: 'random' })
    })

    it('paginates with limit and page', async function () {
      this.ids = ids()
      const out = {}
      for (const q of ['limit=2&page=0', 'limit=2&page=1', 'limit=2&page=2', 'limit=2&page=3', 'limit=4&page=1', 'limit=0', 'page=1', 'limit=abc', 'limit=-1', 'limit=1.5', 'page=-1', 'limit=3&page=1&sort=size&desc=1', `limit=1&page=1&${filters('genres', 'Tech')}&sort=media.metadata.title`]) {
        out[q] = listView(await get(`${L()}/items?${q}`))
      }
      expect(out['limit=2&page=1'].titles).to.have.length(2)
      expect(out['limit=2&page=3'].titles).to.have.length(0)
      expect(out['limit=2&page=3'].total).to.equal(6)
      matchSnapshot(this, out, O(this, 'pagination'))
    })

    it('adds rssfeed and numepisodesincomplete when included', async function () {
      this.ids = ids()
      const res = await get(`${L()}/items?include=rssfeed,numepisodesincomplete&sort=media.metadata.title`)
      const gamma = res.body.results.find((r) => r.media.metadata.title === 'A Gamma Hour')
      expect(gamma.rssFeed).to.be.an('object')
      matchSnapshot(this, { res }, O(this, 'admin include both'))
      const out = {}
      for (const as of ['admin', 'user', 'kidsOnly']) {
        const r = await get(`${L()}/items?include=numepisodesincomplete&sort=media.metadata.title`, as)
        out[as] = r.body.results.map((i) => ({ title: i.media.metadata.title, numEpisodesIncomplete: i.numEpisodesIncomplete, numEpisodes: i.media.numEpisodes }))
      }
      const feedOpen = await get(`${L()}/items?filter=feed-open&include=rssfeed`)
      out.feedOpen = feedOpen.body.results.map((i) => ({ title: i.media.metadata.title, rssFeed: i.rssFeed }))
      out.rssfeedOnly = (await get(`${L()}/items?include=rssfeed&sort=media.metadata.title`)).body.results.map((i) => ({ title: i.media.metadata.title, hasFeed: !!i.rssFeed, hasIncomplete: i.numEpisodesIncomplete !== undefined }))
      out.unknownInclude = (await get(`${L()}/items?include=bogus,NUMEPISODESINCOMPLETE`)).body.include
      matchSnapshot(this, out, O(this, 'include variants'))
    })

    it('the count cache is cleared by creating podcasts and episodes but not by moving an item to another library', async function () {
      this.ids = ids()
      const out = {}
      out.first = listView(await get(`${L()}/items?limit=2`)).total
      await addPodcast(world.lf, { n: 40, title: 'Late Addition', author: 'Lena Late', tags: [], genres: ['Tech'], size: 1 })
      out.afterCreate = listView(await get(`${L()}/items?limit=2`)).total
      // a library item update does not clear the count cache (only podcast/episode create and destroy do)
      await Database.libraryItemModel.update({ libraryId: world.other.library.id }, { where: { id: world.zeta.libraryItem.id } })
      const moved = await get(`${L()}/items?limit=2`)
      out.afterMove = { total: moved.body.total, rows: (await get(`${L()}/items`)).body.results.length }
      // a request with a filter never uses the count cache
      out.filteredAfterMove = (await get(`${L()}/items?limit=2&${filters('genres', 'Tech')}`)).body.total
      await world.beta.podcast.destroy()
      out.afterPodcastDestroy = listView(await get(`${L()}/items?limit=2`)).total
      expect(out.first).to.equal(6)
      expect(out.afterCreate).to.equal(7)
      matchSnapshot(this, out, O(this, 'count cache'))
    })
  })

  describe('GET /api/libraries/:id/personalized (podcast library)', () => {
    it('builds the episode shelves for each user', async function () {
      this.ids = ids()
      const out = {}
      for (const as of ['root', 'admin', 'user', 'guest', 'kidsOnly', 'noKids']) out[as] = shelfView(await get(`${L()}/personalized`, as))
      expect(out.admin.map((s) => s.id)).to.deep.equal(['continue-listening', 'newest-episodes', 'recently-added', 'listen-again'])
      matchSnapshot(this, out, O(this, 'compact shelves by user'))
      const full = await get(`${L()}/personalized`)
      matchSnapshot(this, { res: full }, O(this, 'admin full body'))
    })

    it('honours limit and include', async function () {
      this.ids = ids()
      const out = {}
      for (const q of ['limit=1', 'limit=2', 'limit=100', 'limit=0', 'include=rssfeed', 'include=numepisodesincomplete', 'limit=1&include=rssfeed,numepisodesincomplete']) out[q] = shelfView(await get(`${L()}/personalized?${q}`))
      expect(out['limit=1'].find((s) => s.id === 'newest-episodes').entities).to.have.length(1)
      matchSnapshot(this, out, O(this, 'limits and includes'))
      const withFeed = await get(`${L()}/personalized?include=rssfeed,numepisodesincomplete`)
      const recentlyAdded = withFeed.body.find((s) => s.id === 'recently-added')
      matchSnapshot(
        this,
        recentlyAdded.entities.map((e) => ({ title: e.media.metadata.title, rssFeed: !!e.rssFeed, numEpisodesIncomplete: e.numEpisodesIncomplete })),
        O(this, 'recently added with includes')
      )
    })

    it('orders continue listening by progress update time and hides hidden progress', async function () {
      this.ids = ids()
      const admin = (await get(`${L()}/personalized`)).body.find((s) => s.id === 'continue-listening')
      // Beta One is in progress but hidden from continue listening; Delta One (updated later) comes before Alpha One
      expect(admin.entities.map((e) => e.recentEpisode.title)).to.deep.equal(['Delta One', 'Alpha One'])
      expect(admin.total).to.equal(2)
      const user = (await get(`${L()}/personalized`, 'user')).body.find((s) => s.id === 'continue-listening')
      // the only in-progress episode of `user` belongs to an explicit podcast it may not see
      expect(user).to.equal(undefined)
      matchSnapshot(this, { admin: admin.entities.map((e) => ({ title: e.recentEpisode.title, libraryItem: e.id, isMissing: e.isMissing })), user: user ? user.entities.map((e) => e.recentEpisode.title) : null }, O(this, 'continue listening'))
    })

    it('lists newest episodes by created date, skipping episodes older than 60 days and restricted podcasts', async function () {
      this.ids = ids()
      const out = {}
      for (const as of ['admin', 'user', 'kidsOnly', 'noKids']) {
        const shelf = (await get(`${L()}/personalized`, as)).body.find((s) => s.id === 'newest-episodes')
        out[as] = { total: shelf.total, episodes: shelf.entities.map((e) => e.recentEpisode.title) }
      }
      expect(out.admin.episodes).to.not.include('Alpha Three')
      matchSnapshot(this, out, O(this, 'newest episodes'))
    })

    it('shows finished episodes on listen again', async function () {
      this.ids = ids()
      const out = {}
      for (const as of ['admin', 'user', 'kidsOnly', 'guest']) {
        const shelf = (await get(`${L()}/personalized`, as)).body.find((s) => s.id === 'listen-again')
        out[as] = shelf ? { total: shelf.total, episodes: shelf.entities.map((e) => `${e.media.metadata.title} / ${e.recentEpisode.title}`) } : null
      }
      expect(out.guest).to.equal(null)
      matchSnapshot(this, out, O(this, 'listen again'))
    })

    it('returns no shelves for an empty library', async function () {
      const empty = await createLibrary({ name: 'Empty Pods', mediaType: 'podcast', path: '/test/emptypods' })
      const res = await get(`/api/libraries/${empty.library.id}/personalized`)
      expect(res.body).to.deep.equal([])
      matchSnapshot(this, { res }, { label: 'empty library' })
    })
  })

  describe('GET /api/libraries/:id/recent-episodes', () => {
    it('lists unfinished episodes newest published first with pagination', async function () {
      this.ids = ids()
      const out = {}
      const brief = (res) => (res.status === 200 ? { limit: res.body.limit, page: res.body.page, episodes: res.body.episodes.map((e) => `${e.podcast.metadata.title} / ${e.title}`) } : { status: res.status })
      for (const [as, q] of [
        ['admin', 'limit=20'],
        ['admin', 'limit=3&page=0'],
        ['admin', 'limit=3&page=1'],
        ['admin', 'limit=3&page=2'],
        ['admin', 'limit=3&page=9'],
        ['admin', ''],
        ['user', 'limit=20'],
        ['guest', 'limit=20'],
        ['kidsOnly', 'limit=20'],
        ['noKids', 'limit=20']
      ]) {
        out[`${as} ${q}`] = brief(await get(`${L()}/recent-episodes?${q}`, as))
      }
      expect(out['admin limit=20'].episodes[0]).to.equal('Epsilon / Epsilon Two')
      matchSnapshot(this, out, O(this, 'recent episodes'))
      const full = await get(`${L()}/recent-episodes?limit=2`, 'user')
      expect(full.body.episodes).to.have.length(2)
      matchSnapshot(this, { res: full }, O(this, 'user full body'))
    })

    it('is a 404 for book libraries', async function () {
      const books = await createLibrary({ name: 'Books' })
      const res = await get(`/api/libraries/${books.library.id}/recent-episodes`)
      expect(res.status).to.equal(404)
      const ok = await get(`${L()}/recent-episodes?limit=1`)
      expect(ok.status).to.equal(200)
      matchSnapshot(this, { bookLibrary: res.status, podcastLibrary: ok.status }, { label: 'book library' })
    })
  })

  describe('GET /api/libraries/:id/search (podcast library)', () => {
    const searchView = (res) =>
      res.status === 200
        ? {
            podcast: res.body.podcast.map((p) => p.libraryItem.media.metadata.title),
            episodes: res.body.episodes.map((p) => `${p.libraryItem.media.metadata.title} / ${p.libraryItem.recentEpisode.title}`),
            tags: res.body.tags,
            genres: res.body.genres
          }
        : { status: res.status, body: res.body }

    it('matches title, author, itunes ids, episode titles, tags and genres', async function () {
      this.ids = ids()
      const out = {}
      for (const q of ['alpha', 'ALPHA', 'zed', 'Gamma Hour', '1001', '2001', '100', 'one', 'kids', 'tech', 'news', 'comedy', 'ep', 'amy', '200', '001', 'nothing-matches', '%', '_', "o'brien", 'a"b', 'Zeta']) out[q] = searchView(await get(`${L()}/search?q=${encodeURIComponent(q)}`))
      expect(out.alpha.podcast).to.deep.equal(['The Alpha Show'])
      expect(out.alpha.episodes).to.have.length(3)
      expect(out.tech.genres).to.deep.equal([{ name: 'Tech', numItems: 3 }])
      matchSnapshot(this, out, O(this, 'queries as admin'))
    })

    it('limits each result group and checks the query parameter', async function () {
      this.ids = ids()
      const out = {}
      for (const q of ['q=a&limit=1', 'q=a&limit=2', 'q=a&limit=0', 'q=a', 'q=%20alpha%20', 'q=', 'limit=2', 'q=a&q=b', 'q[]=a']) out[q] = searchView(await get(`${L()}/search?${q}`))
      matchSnapshot(this, out, O(this, 'limits and invalid queries'))
    })

    it('applies explicit and tag permissions to titles and episodes', async function () {
      this.ids = ids()
      const out = {}
      for (const as of ['user', 'kidsOnly', 'noKids']) for (const q of ['a', 'beta', 'kids', 'one']) out[`${as} ${q}`] = searchView(await get(`${L()}/search?q=${q}&limit=10`, as))
      matchSnapshot(this, out, O(this, 'restricted users'))
    })

    it('only searches the requested library', async function () {
      this.ids = ids()
      const here = await get(`${L()}/search?q=elsewhere`)
      const there = await get(`/api/libraries/${world.other.library.id}/search?q=elsewhere`)
      expect(searchView(here).podcast).to.deep.equal([])
      expect(searchView(there).podcast).to.deep.equal(['Elsewhere Pod'])
      matchSnapshot(this, { here: searchView(here), there: searchView(there) }, O(this, 'library scoped'))
      matchSnapshot(this, { res: there }, O(this, 'full body in other library'))
    })
  })

  describe('GET /api/libraries/:id/stats and filterdata (podcast library)', () => {
    it('returns totals, genres, longest and largest podcasts', async function () {
      this.ids = ids()
      const res = await get(`${L()}/stats`)
      expect(res.body.totalItems).to.equal(6)
      expect(res.body.totalDuration).to.equal(5550)
      expect(res.body.numAudioTracks).to.equal(8)
      matchSnapshot(this, { res }, O(this, 'podcast library'))
      matchSnapshot(this, { res: await get(`/api/libraries/${world.other.library.id}/stats`, 'user') }, O(this, 'other library as user'))
    })

    it('returns zeros for an empty library and limits the top lists to ten', async function () {
      const empty = await createLibrary({ name: 'Empty Pods', mediaType: 'podcast', path: '/test/emptypods' })
      const emptyRes = await get(`/api/libraries/${empty.library.id}/stats`)
      expect(emptyRes.body.totalItems).to.equal(0)
      matchSnapshot(this, { res: emptyRes }, { label: 'empty library' })

      const big = await createLibrary({ name: 'Many Pods', mediaType: 'podcast', path: '/test/manypods' })
      for (let i = 1; i <= 12; i++) {
        await addPodcast(big, { n: 100 + i, title: `Pod ${String(i).padStart(2, '0')}`, genres: i % 2 ? ['Odd', 'Tech'] : ['Even'], size: i * 100, episodes: [{ n: 200 + i, index: 1, title: `Ep ${i}`, publishedAt: '2024-01-01T00:00:00Z', duration: i * 10 }] })
      }
      const res = await get(`/api/libraries/${big.library.id}/stats`)
      expect(res.body.longestItems).to.have.length(10)
      expect(res.body.largestItems).to.have.length(10)
      matchSnapshot(
        this,
        { totals: { items: res.body.totalItems, size: res.body.totalSize, duration: res.body.totalDuration, tracks: res.body.numAudioTracks, genres: res.body.totalGenres }, genresWithCount: res.body.genresWithCount, longest: res.body.longestItems.map((i) => `${i.title}:${i.duration}`), largest: res.body.largestItems.map((i) => `${i.title}:${i.size}`) },
        { label: 'twelve podcasts' }
      )
    })

    it('stats need library access', async function () {
      await createUser({ username: 'limitedLib', type: 'user', permissions: { accessAllLibraries: false, librariesAccessible: [world.other.library.id] } })
      const res = await get(`${L()}/stats`, 'limitedLib')
      expect(res.status).to.equal(403)
      matchSnapshot(this, { forbidden: res.status, unknown: (await get('/api/libraries/nope/stats')).status, anonymous: (await api.request('GET', `${L()}/stats`)).status }, { label: 'access' })
    })

    it('filterdata lists the genres, tags and languages used in the library', async function () {
      this.ids = ids()
      const res = await get(`${L()}/filterdata`)
      expect(res.body.genres).to.include('Tech')
      matchSnapshot(this, { res }, O(this, 'admin'))
      // the same data for restricted users, and cached for a while: later changes do not show up
      const before = await get(`${L()}/filterdata`, 'user')
      await addPodcast(world.lf, { n: 41, title: 'Brand New', genres: ['Fresh'], tags: ['new-tag'], language: 'it' })
      const after = await get(`${L()}/filterdata`, 'kidsOnly')
      expect(after.body).to.deep.equal(before.body)
      matchSnapshot(this, { user: before.body, kidsOnlyAfterNewPodcast: after.body }, O(this, 'cached for restricted users'))
    })
  })

  describe('libraryItemsPodcastFilters called directly', () => {
    const user = (name) => Database.userModel.getUserById(users[name].id)
    const view = (r) => ({ count: r.count, items: r.libraryItems.map((li) => `${li.media.title} / ${li.recentEpisode?.title}`) })

    it('getFilteredPodcastEpisodes filters by progress and sorts', async function () {
      this.ids = ids()
      const admin = await user('admin')
      const out = {}
      const run = async (label, ...args) => (out[label] = view(await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, admin, ...args)))
      await run('in-progress by progress desc', 'progress', 'in-progress', 'progress', true, 10, 0)
      await run('in-progress by progress asc', 'progress', 'in-progress', 'progress', false, 10, 0)
      await run('in-progress by createdAt desc', 'progress', 'in-progress', 'createdAt', true, 10, 0)
      await run('in-progress by createdAt asc', 'progress', 'in-progress', 'createdAt', false, 10, 0)
      await run('in-progress home page hides hidden', 'progress', 'in-progress', 'progress', true, 10, 0, true)
      await run('finished', 'progress', 'finished', 'progress', true, 10, 0)
      await run('finished home page', 'progress', 'finished', 'progress', true, 10, 0, true)
      await run('progress other value', 'progress', 'other', 'progress', true, 10, 0)
      await run('progress null value', 'progress', null, 'createdAt', false, 10, 0)
      await run('in-progress limit 1 offset 1', 'progress', 'in-progress', 'progress', true, 1, 1)
      await run('recent desc', 'recent', null, 'createdAt', true, 10, 0)
      await run('recent asc limit 2', 'recent', null, 'createdAt', false, 2, 0)
      await run('recent offset 2', 'recent', null, 'createdAt', true, 10, 2)
      await run('no filter createdAt desc', null, null, 'createdAt', true, 20, 0)
      await run('no filter createdAt asc', undefined, undefined, 'createdAt', false, 20, 0)
      await run('no filter unknown sort', null, null, 'bogus', true, 20, 0)
      await run('sort progress without progress filter falls back to createdAt', null, null, 'progress', true, 20, 0)
      await run('sort progress with recent filter falls back to createdAt', 'recent', null, 'progress', false, 20, 0)
      await run('limit 0 means all', null, null, 'createdAt', true, 0, 0)
      expect(out['in-progress by progress desc'].items).to.deep.equal(['beta cast / Beta One', 'Delta / Delta One', 'The Alpha Show / Alpha One'])
      expect(out['in-progress home page hides hidden'].items).to.not.include('beta cast / Beta One')
      matchSnapshot(this, out, O(this, 'episodes admin'))
    })

    it('an unfinished episode with zero progress is not in progress', async function () {
      this.ids = ids()
      // Alpha Three: a progress row exists (e.g. started and reset) but nothing was played
      await createProgress(users.admin, { libraryItem: world.alpha.libraryItem, mediaItemId: world.alpha.episodes[2].id, podcastId: world.alpha.podcast.id, episode: true, duration: 1800, currentTime: 0, updatedAt: '2024-07-01T10:00:00Z' })
      const admin = await user('admin')
      const direct = view(await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, admin, 'progress', 'in-progress', 'progress', true, 10, 0))
      const shelf = (await get(`${L()}/personalized`)).body.find((x) => x.id === 'continue-listening')
      expect(direct.items).to.not.include('The Alpha Show / Alpha Three')
      expect(shelf.entities).to.have.length(2)
      matchSnapshot(this, { direct, shelf: shelf.entities.map((e) => e.recentEpisode.title) }, O(this, 'zero progress'))
    })

    it('getFilteredPodcastEpisodes applies user permissions and the count cache', async function () {
      this.ids = ids()
      const out = {}
      const asUser = await user('user')
      out.user = view(await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, asUser, 'progress', 'in-progress', 'progress', true, 10, 0))
      out.userFinished = view(await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, asUser, 'progress', 'finished', 'progress', false, 10, 0))
      const kids = await Database.userModel.getUserById(world.kidsOnly.id)
      out.kidsOnlyAll = view(await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, kids, null, null, 'createdAt', false, 20, 0))
      const noKids = await Database.userModel.getUserById(world.noKids.id)
      out.noKidsAll = view(await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, noKids, null, null, 'createdAt', false, 20, 0))
      // unfiltered, unrestricted queries use the count cache: it survives limit changes and is cleared when an episode is created
      const admin = await user('admin')
      const first = await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, admin, null, null, 'createdAt', true, 2, 0)
      const second = await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, admin, null, null, 'createdAt', true, 3, 1)
      await Database.podcastEpisodeModel.create({ podcastId: world.gamma.podcast.id, index: 1, title: 'Gamma One', audioFile: { index: 1, metadata: { filename: 'g.mp3' }, duration: 5 } })
      const third = await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, admin, null, null, 'createdAt', true, 2, 0)
      // a restricted user bypasses the cache only for the podcast query; episodes always use it when there is no filter group
      const cachedForRestricted = await podcastFilters.getFilteredPodcastEpisodes(world.lf.library.id, kids, null, null, 'createdAt', true, 2, 0)
      out.counts = { first: first.count, second: second.count, secondRows: second.libraryItems.length, third: third.count, restricted: cachedForRestricted.count }
      expect(out.counts.third).to.equal(first.count + 1)
      matchSnapshot(this, out, O(this, 'episodes restricted and cached'))
    })

    it('getFilteredLibraryItems honours filters, includes and the count cache', async function () {
      this.ids = ids()
      const admin = await user('admin')
      const run = async (u, ...args) => {
        const r = await podcastFilters.getFilteredLibraryItems(world.lf.library.id, u, ...args)
        return { count: r.count, items: r.libraryItems.map((li) => ({ title: li.media.title, incomplete: li.numEpisodesIncomplete, feed: li.rssFeed ? li.rssFeed.slug : undefined })) }
      }
      const out = {}
      out.plain = await run(admin, null, null, 'media.metadata.title', false, [], 3, 1)
      out.feed = await run(admin, 'feed-open', null, null, false, ['rssfeed'], 0, 0)
      out.incomplete = await run(admin, null, null, 'media.metadata.title', false, ['numepisodesincomplete'], 0, 0)
      out.tagsKids = await run(admin, 'tags', 'kids', 'size', true, [], 0, 0)
      out.genreWithPrefix = await run(admin, 'genres', 'Tech', 'media.metadata.author', true, [], 0, 0)
      out.explicitIgnoresValue = await run(admin, 'explicit', 'whatever', 'size', false, [], 0, 0)
      out.languagesNull = await run(admin, 'languages', null, 'size', false, [], 0, 0)
      expect(out.plain.items).to.have.length(3)
      matchSnapshot(this, out, O(this, 'library items'))
    })

    it('getUserPermissionPodcastWhereQuery, getMediaGroupQuery and getOrder build the expected clauses', async function () {
      const clause = (x) => JSON.parse(JSON.stringify(x))
      const perms = {}
      for (const [label, u] of [
        ['explicit allowed, all tags', { canAccessExplicitContent: true, permissions: { accessAllTags: true } }],
        ['explicit denied, all tags', { canAccessExplicitContent: false, permissions: { accessAllTags: true } }],
        ['selected tags accessible', { canAccessExplicitContent: true, permissions: { accessAllTags: false, itemTagsSelected: ['a', 'b'], selectedTagsNotAccessible: false } }],
        ['selected tags not accessible', { canAccessExplicitContent: false, permissions: { accessAllTags: false, itemTagsSelected: ['a'], selectedTagsNotAccessible: true } }],
        ['no tag selection', { canAccessExplicitContent: true, permissions: { accessAllTags: false, itemTagsSelected: [] } }],
        ['no permissions object', { canAccessExplicitContent: true }]
      ]) {
        const r = podcastFilters.getUserPermissionPodcastWhereQuery(u)
        perms[label] = { where: clause(r.podcastWhere), replacements: r.replacements }
      }
      const groups = {}
      for (const [g, v] of [
        ['genres', 'Tech'],
        ['tags', 'kids'],
        ['languages', 'en'],
        ['explicit', 'x'],
        ['progress', 'x'],
        [null, null],
        ['', 'x']
      ])
        groups[`${g}`] = clause(podcastFilters.getMediaGroupQuery(g, v))
      const orders = {}
      for (const sortBy of ['addedAt', 'size', 'birthtimeMs', 'mtimeMs', 'media.metadata.author', 'media.metadata.title', 'media.numTracks', 'bogus']) for (const desc of [false, true]) orders[`${sortBy} ${desc ? 'desc' : 'asc'}`] = clause(podcastFilters.getOrder(sortBy, desc))
      global.ServerSettings.sortingIgnorePrefix = true
      orders['title ignore prefix asc'] = clause(podcastFilters.getOrder('media.metadata.title', false))
      expect(Object.keys(perms)).to.have.length(6)
      matchSnapshot(this, { perms, groups, orders }, { label: 'clauses' })
    })
  })

  describe('authorFilters through the library routes', () => {
    let books, authors, otherBooks
    beforeEach(async () => {
      books = await createLibrary({ name: 'Books' })
      otherBooks = await createLibrary({ name: 'Other Books', path: '/test/otherbooks' })
      authors = []
      // author k (1..12) wrote 13-k books: distinct book counts so the top ten are unambiguous
      for (let k = 1; k <= 12; k++) {
        const name = `Author ${String(k).padStart(2, '0')}`
        authors.push(name)
        for (let b = 1; b <= 13 - k; b++) await createBook(books, { title: `${name} Book ${b}`, authors: [name], extra: { explicit: false, ...audioBookExtra({ duration: 100 }) } })
      }
      await createBook(otherBooks, { title: 'Elsewhere Book', authors: ['Author 01', 'Other Author'], extra: { explicit: false } })
      // a prolific author in another library must not show up in this library's top list
      for (let b = 1; b <= 15; b++) await createBook(otherBooks, { title: `Foreign ${b}`, authors: ['Foreign Author'], extra: { explicit: false } })
      await createBook(books, { title: 'Authorless', extra: { explicit: false } })
    })

    it('library stats list the ten authors with most books, totals and genres', async function () {
      const res = await get(`/api/libraries/${books.library.id}/stats`)
      expect(res.body.authorsWithCount).to.have.length(10)
      expect(res.body.totalAuthors).to.equal(12)
      expect(res.body.authorsWithCount.map((a) => a.count)).to.deep.equal([12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
      matchSnapshot(this, { authorsWithCount: res.body.authorsWithCount.map((a) => `${a.name}:${a.count}`), totalAuthors: res.body.totalAuthors, totalItems: res.body.totalItems }, { label: 'twelve authors' })
    })

    it('authorFilters functions take library, limit and offset', async function () {
      const out = {}
      out.total = [await authorFilters.getAuthorsTotalCount(books.library.id), await authorFilters.getAuthorsTotalCount(otherBooks.library.id), await authorFilters.getAuthorsTotalCount('nope')]
      out.top3 = (await authorFilters.getAuthorsWithCount(books.library.id, 3)).map((a) => `${a.name}:${a.count}`)
      out.otherTop = (await authorFilters.getAuthorsWithCount(otherBooks.library.id, 1)).map((a) => `${a.name}:${a.count}`)
      const query = await Database.createTextSearchQuery('author 0')
      for (const [limit, offset] of [
        [3, 0],
        [3, 3],
        [3, 8],
        [20, 0],
        [2, 1]
      ])
        out[`search limit ${limit} offset ${offset}`] = (await authorFilters.search(books.library.id, query, limit, offset)).map((a) => `${a.name}:${a.numBooks}`)
      out.otherLibrarySearch = (await authorFilters.search(otherBooks.library.id, await Database.createTextSearchQuery('author'), 10, 0)).map((a) => `${a.name}:${a.numBooks}`).sort()
      expect(out.top3).to.have.length(3)
      matchSnapshot(this, out, { label: 'direct' })
    })

    it('searching authors matches names, limits results and counts books', async function () {
      const out = {}
      for (const q of ['Author 01', 'author 1', 'author', 'Other', 'nobody', 'AUTHOR 12']) {
        const res = await get(`/api/libraries/${books.library.id}/search?q=${encodeURIComponent(q)}&limit=3`)
        out[q] = { authors: res.body.authors.map((a) => `${a.name}:${a.numBooks}`), book: res.body.book.length }
      }
      const unlimited = await get(`/api/libraries/${books.library.id}/search?q=author&limit=50`)
      out.unlimited = unlimited.body.authors.length
      expect(out['Author 01'].authors).to.deep.equal(['Author 01:12'])
      matchSnapshot(this, out, { label: 'author search' })
    })
  })

  describe('adminStats and userStats', () => {
    let lf, coverDir, books, mkBook
    const at = (d) => `${d}T12:00:00.000Z`

    beforeEach(async () => {
      lf = await createLibrary({ name: 'Stat Books', path: '/test/statbooks' })
      coverDir = path.join(api.tmp, 'covers')
      fs.mkdirSync(coverDir, { recursive: true })
      books = {}
      mkBook = async (key, o) => {
        const coverPath = o.cover === false ? null : path.join(coverDir, `${key}.png`)
        if (coverPath) fs.writeFileSync(coverPath, 'png')
        const created = await createBook(lf, { title: o.title || key, authors: o.authors || [], extra: { ...audioBookExtra({ duration: o.duration ?? 1000, narrators: o.narrators || [], genres: o.genres || [] }), coverPath } })
        await setRow(Database.libraryItemModel, created.libraryItem.id, { size: o.size ?? 100, createdAt: new Date(o.added) })
        await setRow(Database.bookModel, created.book.id, { createdAt: new Date(o.added) })
        books[key] = created
        return created
      }
      await mkBook('b2023', { added: at('2023-12-31'), size: 10, duration: 100, authors: ['Old Author'] })
      await mkBook('b2024a', { added: '2024-01-01T00:00:00.000Z', size: 1000, duration: 1000.4, authors: ['Ann Author'], narrators: ['Nora'], genres: ['Fantasy', 'Audiobook'] })
      await mkBook('b2024b', { added: at('2024-06-15'), size: 2000, duration: 2000.4, authors: ['Bob Author'], narrators: ['Nick', 'Nora'], genres: ['Mystery', 'Audio Book', 'Fantasy'] })
      await mkBook('b2024c', { added: at('2024-12-31'), size: 3000, duration: 0, authors: ['Cy Author'], genres: ['Horror'], cover: false })
      await mkBook('b2025', { added: '2025-01-01T00:00:00.000Z', size: 40000, duration: 4000, authors: ['New Author'] })
      for (const [name, date] of [
        ['Old Author', '2023-12-31'],
        ['Ann Author', '2024-01-01T00:00:00.000Z'],
        ['Bob Author', '2024-06-15'],
        ['Cy Author', '2024-12-31'],
        ['New Author', '2025-01-01T00:00:00.000Z']
      ]) {
        await setRow(Database.authorModel, (await Database.authorModel.findOne({ where: { name } })).id, { createdAt: new Date(date.includes('T') ? date : at(date)) })
      }
    })

    const session = (key, date, o = {}) => createPlaybackSession({ user: users.user, library: lf.library, ...books[key] }, { at: at(date), ...o })

    it('GET /api/stats/year/:year aggregates books added and listening, with year boundaries and limits', async function () {
      await session('b2024a', '2024-01-15', { timeListening: 100, authors: ['Ann Author'], narrators: ['Nora'], genres: ['Fantasy', 'Audiobook'] })
      await session('b2024a', '2024-02-15', { timeListening: 50, authors: ['Ann Author'], narrators: ['Nora'], genres: ['Fantasy'] })
      await session('b2024b', '2024-03-15', { timeListening: 300, authors: ['Bob Author'], narrators: ['Nick', 'Nora'], genres: ['Mystery', 'Audio Book', 'Fantasy'] })
      await session('b2024c', '2024-04-15', { timeListening: 20, authors: ['Cy Author'], genres: ['Horror'] })
      await session('b2024c', '2024-05-15', { timeListening: 10, authors: ['Dee Author'], narrators: ['Zed'], genres: ['Poetry'] })
      await session('b2023', '2023-12-31', { timeListening: 999, authors: ['Old Author'] })
      await session('b2025', '2025-01-01', { timeListening: 888, authors: ['New Author'] })
      // boundary rows: first and last instants of 2024
      await setRow(Database.playbackSessionModel, (await session('b2024a', '2024-07-15', { timeListening: 1 })).id, { createdAt: new Date('2024-01-01T00:00:00.000Z') })
      await setRow(Database.playbackSessionModel, (await session('b2024a', '2024-07-15', { timeListening: 2 })).id, { createdAt: new Date('2024-12-31T23:59:59.999Z') })
      await setRow(Database.playbackSessionModel, (await session('b2024a', '2024-07-15', { timeListening: 4000 })).id, { createdAt: new Date('2023-12-31T23:59:59.999Z') })
      await setRow(Database.playbackSessionModel, (await session('b2024a', '2024-07-15', { timeListening: 8000 })).id, { createdAt: new Date('2025-01-01T00:00:00.000Z') })
      // a session without time listening and one without metadata
      await Database.playbackSessionModel.update({ timeListening: null, mediaMetadata: null }, { where: { id: (await session('b2024c', '2024-08-15')).id }, silent: true })
      const out = {}
      for (const year of [2023, 2024, 2025, 2026, 2000]) {
        const res = await get(`/api/stats/year/${year}`)
        out[year] = res.body
        // random order of books: only compare stable parts of booksAddedWithCovers
        out[year].booksAddedWithCovers = [...out[year].booksAddedWithCovers].map((id) => Object.keys(books).find((k) => books[k].libraryItem.id === id)).sort()
      }
      expect(out[2024].numBooksAdded).to.equal(3)
      expect(out[2024].numListeningSessions).to.equal(8)
      matchSnapshot(this, out, { label: 'years' })
    })

    it('GET /api/stats/server totals sizes and audio files', async function () {
      const pods = await createLibrary({ name: 'Pods', mediaType: 'podcast', path: '/test/p' })
      await addPodcast(pods, {
        n: 300,
        title: 'Stat Pod',
        size: 5000,
        episodes: [
          { n: 300, index: 1, title: 'E1', duration: 10 },
          { n: 301, index: 2, title: 'E2', duration: 20 }
        ]
      })
      const res = await get('/api/stats/server')
      expect(res.status).to.equal(200)
      matchSnapshot(this, { res }, { label: 'books and podcasts' })
    })

    it('GET /api/stats/year/:year lists at most 25 books with covers', async function () {
      for (let i = 1; i <= 27; i++) await mkBook(`cap${i}`, { added: '2022-05-15T12:00:00.000Z', size: 1, duration: 10 })
      const res = await get('/api/stats/year/2022')
      expect(res.body.numBooksAdded).to.equal(27)
      expect(res.body.booksAddedWithCovers).to.have.length(25)
      expect(new Set(res.body.booksAddedWithCovers).size).to.equal(25)
      matchSnapshot(this, { numBooksAdded: res.body.numBooksAdded, covers: res.body.booksAddedWithCovers.length, totalBooksAddedSize: res.body.totalBooksAddedSize }, { label: 'cover cap' })
    })

    it('GET /api/me/stats/year/:year lists at most 5 finished and 25 other books with covers', async function () {
      for (let i = 1; i <= 32; i++) {
        const b = await mkBook(`cover${i}`, { added: '2022-05-15T12:00:00.000Z', size: 1, duration: 10 })
        if (i <= 7) await createProgress(users.user, { libraryItem: b.libraryItem, mediaItemId: b.book.id, duration: 10 + i, currentTime: 10 + i, isFinished: true, finishedAt: '2022-06-15T12:00:00.000Z', updatedAt: '2022-06-15T12:00:00.000Z' })
        await createPlaybackSession({ user: users.user, library: lf.library, ...b }, { at: '2022-07-15T12:00:00.000Z', timeListening: 10, authors: [] })
      }
      const res = await get('/api/me/stats/year/2022', 'user')
      expect(res.body.finishedBooksWithCovers).to.have.length(5)
      expect(res.body.booksWithCovers).to.have.length(25)
      expect(res.body.booksWithCovers.filter((id) => res.body.finishedBooksWithCovers.includes(id))).to.have.length(0)
      matchSnapshot(this, { finished: res.body.numBooksFinished, finishedCovers: res.body.finishedBooksWithCovers.length, covers: res.body.booksWithCovers.length, sessions: res.body.totalListeningSessions, numBooksListened: res.body.numBooksListened, longest: res.body.longestAudiobookFinished.duration }, { label: 'cover caps' })
    })

    it('GET /api/me/stats/year/:year aggregates a user: books, podcasts, finished books and months', async function () {
      const sess = (key, date, o) => createPlaybackSession({ user: users.user, library: lf.library, ...books[key] }, { at: at(date), ...o })
      await sess('b2024a', '2024-01-15', { timeListening: 600, authors: ['Ann Author'], narrators: ['Nora'], genres: ['Fantasy', 'Audiobook'] })
      await sess('b2024a', '2024-02-15', { timeListening: 100, authors: ['Ann Author'], narrators: ['Nora'], genres: ['Fantasy'] })
      await sess('b2024b', '2024-02-16', { timeListening: 300.4, authors: ['Bob Author'], narrators: ['Nick'], genres: ['Mystery', 'Audio Book'] })
      await sess('b2024c', '2024-05-15', { timeListening: 50, authors: ['Cy Author', 'Dee Author'], narrators: ['Zed', 'Yan'], genres: ['Horror', 'Poetry'] })
      await sess('b2023', '2023-12-31', { timeListening: 777, authors: ['Old Author'] })
      // a session without a title and one without listening time still count as sessions
      await Database.playbackSessionModel.update({ displayTitle: null }, { where: { id: (await sess('b2024a', '2024-09-15', { timeListening: 1 })).id }, silent: true })
      await Database.playbackSessionModel.update({ timeListening: null }, { where: { id: (await sess('b2024b', '2024-10-15', { timeListening: 5 })).id }, silent: true })
      // podcast sessions count as podcast listening only
      for (const [date, time] of [
        ['2024-03-15', 120.6],
        ['2024-07-15', 30]
      ]) {
        await Database.playbackSessionModel.create(
          {
            userId: users.user.id,
            libraryId: lf.library.id,
            mediaItemId: world.alpha.episodes[0].id,
            mediaItemType: 'podcastEpisode',
            displayTitle: 'Alpha One',
            displayAuthor: 'Zed Zimmer',
            duration: 600,
            playMethod: 0,
            mediaPlayer: 'test',
            startTime: 0,
            currentTime: 10,
            serverVersion: '2',
            timeListening: time,
            mediaMetadata: { title: 'The Alpha Show', author: 'Zed Zimmer', genres: ['Tech'] },
            date,
            dayOfWeek: 'Friday',
            extraData: {},
            createdAt: new Date(at(date)),
            updatedAt: new Date(at(date))
          },
          { silent: true }
        )
      }
      // another user's sessions are not counted
      await createPlaybackSession({ user: users.admin, library: lf.library, ...books.b2024a }, { at: at('2024-01-20'), timeListening: 9999, authors: ['Ann Author'] })
      // finished books: the longest is reported, covers are listed once (first five)
      for (const [key, finishedAt, duration] of [
        ['b2024a', '2024-03-01', 1000],
        ['b2024b', '2024-04-01', 2000.6],
        ['b2024c', '2024-12-31', 500],
        ['b2023', '2023-12-31', 99999],
        ['b2025', '2025-01-01', 99999]
      ]) {
        await createProgress(users.user, { libraryItem: books[key].libraryItem, mediaItemId: books[key].book.id, duration, currentTime: duration, isFinished: true, finishedAt: at(finishedAt), updatedAt: at(finishedAt) })
      }
      const res = await get('/api/me/stats/year/2024', 'user')
      const view = { ...res.body, booksWithCovers: res.body.booksWithCovers.map((id) => Object.keys(books).find((k) => books[k].libraryItem.id === id)).sort(), finishedBooksWithCovers: res.body.finishedBooksWithCovers.map((id) => Object.keys(books).find((k) => books[k].libraryItem.id === id)).sort() }
      expect(res.body.totalPodcastListeningTime).to.equal(151)
      expect(res.body.numBooksFinished).to.equal(3)
      matchSnapshot(this, { view, longestFinishedTitle: res.body.longestAudiobookFinished?.title }, { label: 'user 2024' })
      const admin = await get('/api/me/stats/year/2024', 'admin')
      matchSnapshot(this, { admin: admin.body }, { label: 'admin 2024' })
    })
  })
})
