const { expect } = require('chai')
const sinon = require('sinon')
const express = require('express')
const { performance } = require('perf_hooks')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { createLibrary, createBook } = require('./helpers/seed-library')
const Database = require('../../server/Database')
const ApiCacheManager = require('../../server/managers/ApiCacheManager')

const MIN = 60 * 1000

// Characterizes the DEFAULTS of ApiCacheManager (30 minute TTL, which models invalidate which slices, the ?sort=random bypass, per-user keys).
// The harness (helpers/harness.js) builds the real ApiRouter with a default-constructed manager; `describe('through the real ApiRouter')` uses that.
// ApiRouter only mounts the cache middleware on `GET /^\/libraries/`, so /me is never cached by the real router. The other groups therefore mount
// the REAL ApiCacheManager middleware in a small express app in front of counting handlers (the way ApiRouter does: `router.get(regex, manager.middleware)`),
// with req.user set like the harness stub login, and hook the manager to the real Database models (manager.init(Database)).
describe('ApiCacheManager (characterization)', function () {
  let api, server, base, manager, calls, clock

  const ttlKeys = (m) => [...m.cache.keys()].map((k) => JSON.parse(k))
  const urlsLeft = (m) => ttlKeys(m).map((k) => k.url).sort()

  const listen = (app) =>
    new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })

  /** the real manager.middleware on GET /libraries* and GET /me*; the handler counts its invocations and returns the call number */
  const startApp = async (mgr) => {
    calls = {}
    const app = express()
    app.use((req, res, next) => {
      req.user = { username: req.headers['x-user'] }
      next()
    })
    const router = express.Router()
    router.get(/^\/libraries/, mgr.middleware)
    router.get(/^\/me/, mgr.middleware)
    router.all(/.*/, (req, res) => {
      const key = `${req.method} /api${req.url}`
      calls[key] = (calls[key] || 0) + 1
      res.status(req.query.fail ? 404 : 200).json({ n: calls[key], user: req.user.username, url: req.url })
    })
    app.use('/api', router)
    server = await listen(app)
    base = `http://127.0.0.1:${server.address().port}/api`
  }
  const req = async (url, { user = 'alice', method = 'GET' } = {}) => {
    const res = await fetch(base + url, { method, headers: { 'x-user': user } })
    return { status: res.status, body: await res.json() }
  }
  const hits = (url, method = 'GET') => calls[`${method} /api${url}`] || 0

  beforeEach(async () => {
    api = await startApi()
    manager = new ApiCacheManager()
    manager.init(Database)
  })
  afterEach(async () => {
    clock?.restore()
    clock = null
    if (server) await new Promise((resolve) => server.close(resolve))
    server = null
    await api.stop()
  })

  describe('default construction', () => {
    it('uses a 30 minute TTL and the documented LRU limits and invalidation sets', function () {
      const m = new ApiCacheManager()
      expect(m.ttlOptions.ttl).to.equal(30 * MIN)
      expect(m.modelsInvalidatingMe.has('device')).to.equal(true)
      matchSnapshot(this, { ttlOptions: m.ttlOptions, max: m.cache.max, maxSize: m.cache.maxSize, highChurn: [...m.highChurnModels], invalidatesPersonalized: [...m.modelsInvalidatingPersonalized], invalidatesMe: [...m.modelsInvalidatingMe] })
    })

    it('passes the default ttl to the cache for personalized urls only', async () => {
      const set = sinon.spy(manager.cache, 'set')
      await startApp(manager)
      await req('/libraries/lib-1/personalized')
      await req('/libraries/lib-1/items')
      expect(set.callCount).to.equal(2)
      expect(set.firstCall.args[2]).to.deep.equal({ ttl: 1800000 })
      expect(set.secondCall.args.length).to.equal(2)
    })
  })

  describe('ttl through the middleware (fake time)', () => {
    beforeEach(async () => {
      // lru-cache captured the global `performance` object when it was loaded, so sinon's fake timers (which swap the global) do not reach it; stub its now()
      let offset = 0
      const base = performance.now()
      sinon.stub(performance, 'now').callsFake(() => base + offset)
      clock = { tick: (ms) => (offset += ms), restore: () => performance.now.restore() }
      manager = new ApiCacheManager()
      manager.init(Database)
      await startApp(manager)
    })

    it('serves a personalized response from cache at 29 minutes and rebuilds it after 31 minutes', async function () {
      const url = '/libraries/lib-1/personalized'
      const first = await req(url)
      expect(first.status).to.equal(200)
      expect(first.body.n).to.equal(1)
      clock.tick(29 * MIN)
      expect((await req(url)).body.n).to.equal(1)
      expect(hits(url)).to.equal(1)
      clock.tick(2 * MIN)
      const rebuilt = await req(url)
      expect(rebuilt.status).to.equal(200)
      expect(rebuilt.body.n).to.equal(2)
      expect(hits(url)).to.equal(2)
      // the rebuilt entry lives another 30 minutes
      clock.tick(29 * MIN)
      expect((await req(url)).body.n).to.equal(2)
      matchSnapshot(this, { first, rebuilt })
    })

    it('records that only personalized urls expire: every other cached url is served forever (no ttl)', async () => {
      const url = '/libraries/lib-1/items'
      expect((await req(url)).body.n).to.equal(1)
      clock.tick(24 * 60 * MIN)
      const later = await req(url)
      expect(later.status).to.equal(200)
      expect(later.body.n).to.equal(1)
      expect(hits(url)).to.equal(1)
    })
  })

  describe('middleware', () => {
    beforeEach(() => startApp(manager))

    it('serves two identical GETs from one handler call', async function () {
      const a = await req('/libraries/lib-1/items?limit=5')
      const b = await req('/libraries/lib-1/items?limit=5')
      expect(a.status).to.equal(200)
      expect(b.status).to.equal(200)
      expect(a.body).to.deep.equal(b.body)
      expect(hits('/libraries/lib-1/items?limit=5')).to.equal(1)
      matchSnapshot(this, { a, b, keys: ttlKeys(manager) })
    })

    it('treats a different query string as a different entry', async () => {
      await req('/libraries/lib-1/items?limit=5')
      await req('/libraries/lib-1/items?limit=6')
      await req('/libraries/lib-1/items?limit=5')
      expect(hits('/libraries/lib-1/items?limit=5')).to.equal(1)
      expect(hits('/libraries/lib-1/items?limit=6')).to.equal(1)
      expect(manager.cache.size).to.equal(2)
    })

    it('bypasses the cache for ?sort=random: the handler runs every time and nothing is stored', async function () {
      const url = '/libraries/lib-1/items?sort=random'
      const a = await req(url)
      const b = await req(url)
      const c = await req(url)
      expect([a.status, b.status, c.status]).to.deep.equal([200, 200, 200])
      expect([a.body.n, b.body.n, c.body.n]).to.deep.equal([1, 2, 3])
      expect(hits(url)).to.equal(3)
      expect(manager.cache.size).to.equal(0)
      // only the exact value 'random' bypasses
      await req('/libraries/lib-1/items?sort=title')
      await req('/libraries/lib-1/items?sort=title')
      expect(hits('/libraries/lib-1/items?sort=title')).to.equal(1)
      matchSnapshot(this, { a, b, c, keys: ttlKeys(manager) })
    })

    it('keeps one entry per user: users never share cached responses', async function () {
      const url = '/libraries/lib-1/items'
      const alice1 = await req(url, { user: 'alice' })
      const bob1 = await req(url, { user: 'bob' })
      const alice2 = await req(url, { user: 'alice' })
      const bob2 = await req(url, { user: 'bob' })
      expect(alice1.body.user).to.equal('alice')
      expect(bob1.body.user).to.equal('bob')
      expect(alice2.body).to.deep.equal(alice1.body)
      expect(bob2.body).to.deep.equal(bob1.body)
      expect(hits(url)).to.equal(2)
      matchSnapshot(this, { alice1, bob1, alice2, bob2, keys: ttlKeys(manager) })
    })

    it('only caches what it is mounted on: POST requests are not cached, and the GET entry is unaffected', async () => {
      const url = '/libraries/lib-1/items'
      await req(url)
      const p1 = await req(url, { method: 'POST' })
      const p2 = await req(url, { method: 'POST' })
      expect([p1.body.n, p2.body.n]).to.deep.equal([1, 2])
      expect(hits(url, 'POST')).to.equal(2)
      expect(manager.cache.size).to.equal(1)
      await req(url)
      expect(hits(url)).to.equal(1)
    })

    it('records that the manager itself ignores the method: mounted with app.use it caches a POST', async () => {
      await new Promise((resolve) => server.close(resolve))
      let count = 0
      const app = express()
      app.use((req, res, next) => {
        req.user = { username: 'alice' }
        next()
      })
      app.use(manager.middleware)
      app.post('/x', (req, res) => res.json({ n: ++count }))
      server = await listen(app)
      const url = `http://127.0.0.1:${server.address().port}/x`
      const a = await (await fetch(url, { method: 'POST' })).json()
      const b = await (await fetch(url, { method: 'POST' })).json()
      expect(a).to.deep.equal({ n: 1 })
      expect(b).to.deep.equal({ n: 1 })
      expect(count).to.equal(1)
    })

    it('records that error responses are cached too (a 404 is served from cache)', async function () {
      const url = '/libraries/lib-1/items?fail=1'
      const a = await req(url)
      const b = await req(url)
      expect([a.status, b.status]).to.deep.equal([404, 404])
      expect(hits(url)).to.equal(1)
      matchSnapshot(this, { a, b })
    })
  })

  describe('invalidation by model events (real Database hooks)', () => {
    let lf
    const mkUser = (username) => Database.userModel.create({ username, pash: 'x', token: `t-${username}`, type: 'user', isActive: true, permissions: {}, bookmarks: [], extraData: {} })
    const warm = async () => {
      await req('/me')
      await req('/me/listening-stats')
      await req('/libraries/lib-1/personalized')
      await req('/libraries/lib-1/items')
      await req('/me', { user: 'bob' })
    }
    /** which of the warmed urls are served from cache (handler not called again) after the event */
    const survivors = async () => {
      const before = { ...calls }
      const out = {}
      for (const u of ['/me', '/me/listening-stats', '/libraries/lib-1/personalized', '/libraries/lib-1/items']) {
        await req(u)
        out[u] = calls[`GET /api${u}`] === before[`GET /api${u}`] ? 'cached' : 'rebuilt'
      }
      return out
    }
    const MEONLY = { '/me': 'rebuilt', '/me/listening-stats': 'rebuilt', '/libraries/lib-1/personalized': 'cached', '/libraries/lib-1/items': 'cached' }

    beforeEach(async () => {
      await startApp(manager)
      lf = await createLibrary()
    })

    it('a device create, update and destroy each clear cached /me responses (all users) and nothing else', async function () {
      const user = await mkUser('dev-owner')
      await warm()
      expect(manager.cache.size).to.equal(5)
      const device = await Database.deviceModel.create({ deviceId: 'dev-1', clientName: 'Test', ipAddress: '10.0.0.1', extraData: {}, userId: user.id })
      expect(urlsLeft(manager)).to.deep.equal(['/libraries/lib-1/items', '/libraries/lib-1/personalized'])
      await warm()
      await device.update({ clientVersion: '2.0' })
      expect(urlsLeft(manager)).to.deep.equal(['/libraries/lib-1/items', '/libraries/lib-1/personalized'])
      await warm()
      await device.destroy()
      expect(urlsLeft(manager)).to.deep.equal(['/libraries/lib-1/items', '/libraries/lib-1/personalized'])
      await warm()
      // records an oddity: afterBulkCreate hands the hook an array of instances, whose name resolves to 'Array', so a bulk create clears EVERYTHING
      await Database.deviceModel.bulkCreate([{ deviceId: 'dev-2', ipAddress: '10.0.0.2', extraData: {}, userId: user.id }])
      expect(urlsLeft(manager)).to.deep.equal([])
      await warm()
      await Database.deviceModel.update({ clientName: 'Renamed' }, { where: { deviceId: 'dev-2' } })
      const result = await survivors()
      expect(result).to.deep.equal(MEONLY)
      matchSnapshot(this, { result })
    })

    it('a session or playbackSession change clears /me only', async () => {
      await warm()
      manager.clear({ name: 'session' }, 'afterCreate')
      expect(await survivors()).to.deep.equal(MEONLY)
      await warm()
      manager.clear({ name: 'playbackSession' }, 'afterUpdate')
      expect(await survivors()).to.deep.equal(MEONLY)
    })

    it('a mediaProgress change clears /me and personalized urls, not other library urls', async () => {
      const book = await createBook(lf, { title: 'B' })
      const user = await mkUser('p-owner')
      await warm()
      await Database.mediaProgressModel.create({ userId: user.id, mediaItemId: book.book.id, mediaItemType: 'book', duration: 100, currentTime: 10, isFinished: false, extraData: {} })
      expect(await survivors()).to.deep.equal({ '/me': 'rebuilt', '/me/listening-stats': 'rebuilt', '/libraries/lib-1/personalized': 'rebuilt', '/libraries/lib-1/items': 'cached' })
    })

    it('records that any other model change clears the whole cache, /me included (no model leaves /me alone)', async () => {
      await warm()
      await Database.libraryModel.create({ name: 'Other', mediaType: 'book' })
      expect(manager.cache.size).to.equal(0)
      expect(await survivors()).to.deep.equal({ '/me': 'rebuilt', '/me/listening-stats': 'rebuilt', '/libraries/lib-1/personalized': 'rebuilt', '/libraries/lib-1/items': 'rebuilt' })
    })

    it('the /me pattern matches /me, /me/... and /me?... but not /me2 or /memo', async () => {
      await warm()
      await req('/me?x=1')
      await req('/me2')
      await req('/memo')
      manager.clear({ name: 'device' }, 'afterCreate')
      expect(urlsLeft(manager)).to.deep.equal(['/libraries/lib-1/items', '/libraries/lib-1/personalized', '/me2', '/memo'])
    })
  })

  describe('through the real ApiRouter (harness wiring)', () => {
    it('caches GET /api/libraries/* responses in the router manager, per user, and never /api/me', async function () {
      await api.seed.users()
      const lf = await createLibrary()
      await createBook(lf, { title: 'Cached Book' })
      const m = api.apiRouter.apiCacheManager
      m.cache.clear()
      const url = `/api/libraries/${lf.library.id}/items`
      const a = await api.request('GET', url, { as: 'admin' })
      expect(a.status).to.equal(200)
      expect(m.cache.size).to.equal(1)
      const b = await api.request('GET', url, { as: 'admin' })
      expect(b.body).to.deep.equal(a.body)
      expect(m.cache.size).to.equal(1)
      const u = await api.request('GET', url, { as: 'user' })
      expect(u.status).to.equal(200)
      expect(m.cache.size).to.equal(2)
      expect(m.ttlOptions.ttl).to.equal(30 * MIN)
      const me = await api.request('GET', '/api/me', { as: 'admin' })
      expect(me.status).to.equal(200)
      expect(m.cache.size).to.equal(2)
      const keys = ttlKeys(m).map((k) => ({ user: k.user, url: k.url.replace(lf.library.id, '<library>') }))
      expect(keys.map((k) => k.user).sort()).to.deep.equal(['admin', 'user'])
      matchSnapshot(this, { keys })
    })

    it('does not cache ?sort=random, nor a non-GET request on a library route', async () => {
      await api.seed.users()
      const lf = await createLibrary()
      await createBook(lf, { title: 'Cached Book' })
      const m = api.apiRouter.apiCacheManager
      m.cache.clear()
      const r1 = await api.request('GET', `/api/libraries/${lf.library.id}/items?sort=random`, { as: 'admin' })
      const r2 = await api.request('GET', `/api/libraries/${lf.library.id}/items?sort=random`, { as: 'admin' })
      expect([r1.status, r2.status]).to.deep.equal([200, 200])
      expect(m.cache.size).to.equal(0)
      const patch = await api.request('PATCH', `/api/libraries/${lf.library.id}`, { as: 'admin', json: { name: 'Renamed' } })
      expect(patch.status).to.equal(200)
      // the PATCH hooks clear the cache and the PATCH response itself is not cached
      expect(m.cache.size).to.equal(0)
    })
  })
})
