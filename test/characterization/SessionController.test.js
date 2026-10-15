const { expect } = require('chai')
const fs = require('fs')
const path = require('path')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const Database = require('../../server/Database')
const ShareManager = require('../../server/managers/ShareManager')
const PublicRouter = require('../../server/routers/PublicRouter')
const { createLibrary, createBook } = require('./helpers/seed-library')
const { createPlaybackSession, audioBookExtra, setRow } = require('./helpers/seed-users-extra')
const OldPlaybackSession = require('../../server/objects/PlaybackSession')
const { recordingFake, openSession } = require('./helpers/seed-podcast-extra')

describe('SessionController (characterization)', () => {
  let api, users, lf, book, item, manager, openSessions

  // the fake playback session manager records what each route asks of it
  const makeManager = () => {
    openSessions = []
    return recordingFake(
      {
        getSession: (id) => openSessions.find((s) => s.id === id),
        removeSession: async (id) => {
          openSessions = openSessions.filter((s) => s.id !== id)
        },
        syncSessionRequest: (user, session, body, res) => res.json({ fake: 'syncSessionRequest' }),
        closeSessionRequest: (user, session, body, res) => res.json({ fake: 'closeSessionRequest' }),
        syncLocalSessionRequest: (req, res) => res.json({ fake: 'syncLocalSessionRequest' }),
        syncLocalSessionsRequest: (req, res) => res.json({ fake: 'syncLocalSessionsRequest' })
      },
      { get sessions() { return openSessions } }
    )
  }
  // manager calls with the express objects reduced to the facts that matter
  const managerCalls = () =>
    manager.calls.splice(0).map(({ method, args }) => ({
      method,
      args: args.map((a) => {
        if (a && a.headers && a.body !== undefined) return { request: { user: a.user?.username, body: a.body } }
        if (a && typeof a.json === 'function' && typeof a.status === 'function') return '<res>'
        if (a && a.username && a.permissions) return { user: a.username }
        if (a && a.id && a.userId) return { session: a.id }
        return a
      })
    }))

  beforeEach(async () => {
    manager = makeManager()
    api = await startApi({ managers: { playbackSessionManager: manager } })
    users = await api.seed.users()
    lf = await createLibrary({ name: 'Books' })
    const created = await createBook(lf, { title: 'Listened Book', authors: ['Ann Author'], extra: audioBookExtra({ duration: 3600 }) })
    book = created.book
    item = created.libraryItem
  })

  afterEach(async () => {
    await api.stop()
  })

  const snap = (ctx, res, label, extra = {}) => {
    const emitted = api.emitted.splice(0)
    matchSnapshot(ctx, { res, emitted, ...extra }, { label, ids: ctx.ids, tmpDirs: [api.tmp] })
  }
  const dbSession = (user, at, o = {}) => createPlaybackSession({ user, libraryItem: item, book, library: lf.library }, { at, ...o })

  describe('GET /api/sessions', () => {
    let s
    beforeEach(async () => {
      s = []
      s.push(await dbSession(users.admin, '2024-01-01T10:00:00Z', { title: 'Zeta', timeListening: 30, currentTime: 100 }))
      s.push(await dbSession(users.user, '2024-01-02T10:00:00Z', { title: 'Alpha', timeListening: 20, currentTime: 300 }))
      s.push(await dbSession(users.admin, '2024-01-03T10:00:00Z', { title: 'Mid', timeListening: 10, currentTime: 200 }))
      s.push(await dbSession(users.guest, '2024-01-04T10:00:00Z', { title: 'Beta', timeListening: 40, currentTime: 400 }))
      s.push(await dbSession(users.root, '2024-01-05T10:00:00Z', { title: 'Omega', timeListening: 50, currentTime: 500 }))
      await Database.deviceModel.create({ deviceId: 'dev-1', clientName: 'Test Client', clientVersion: '1.0', ipAddress: '10.0.0.1', extraData: { osName: 'Linux' }, userId: users.admin.id }).then((d) => s[0].update({ deviceId: d.id }, { silent: true }))
    })
    const list = (q = '', as = 'admin') => api.request('GET', `/api/sessions${q}`, { as })

    it('requires authentication and an admin', async function () {
      this.ids = new Map()
      snap(this, await api.request('GET', '/api/sessions'), 'unauthenticated')
      snap(this, await list('', 'user'), 'user')
      snap(this, await list('', 'guest'), 'guest')
    })
    it('lists the first page for admin and root', async function () {
      this.ids = new Map()
      snap(this, await list('', 'admin'), 'admin')
      snap(this, await list('', 'root'), 'root')
    })
    it('sorts, filters and paginates', async function () {
      this.ids = new Map()
      snap(this, await list('?sort=displayTitle'), 'sort displayTitle asc')
      snap(this, await list('?sort=displayTitle&desc=1'), 'sort displayTitle desc')
      snap(this, await list('?sort=timeListening&desc=1&itemsPerPage=2'), 'sort timeListening desc, 2 per page')
      snap(this, await list('?sort=currentTime&itemsPerPage=2&page=1'), 'page 1')
      snap(this, await list('?sort=currentTime&itemsPerPage=2&page=2'), 'last page')
      snap(this, await list('?sort=currentTime&itemsPerPage=2&page=9'), 'page beyond the end')
      snap(this, await list(`?user=${users.admin.id}`), 'user filter')
      snap(this, await list('?user=not-a-uuid'), 'invalid user filter is ignored')
    })
    it('falls back for invalid query values', async function () {
      this.ids = new Map()
      snap(this, await list('?sort=bogus'), 'invalid sort')
      snap(this, await list('?itemsPerPage=0'), 'itemsPerPage 0')
      snap(this, await list('?itemsPerPage=-3'), 'negative itemsPerPage')
      snap(this, await list('?itemsPerPage=abc&page=abc'), 'non numeric paging')
      snap(this, await list('?page=-1&itemsPerPage=2'), 'negative page')
    })
  })

  describe('device and media type mapping (podcast episode and device rows)', () => {
    const EP = 'e0000000-0000-4000-8000-0000000000e1'
    let web, android, ios, bookSession, epSession, iosSession, ids
    const mkDevice = (user, o) => Database.deviceModel.create({ userId: user.id, ...o })
    beforeEach(async () => {
      web = await mkDevice(users.admin, { deviceId: 'web-dev', clientName: 'Abs Web', clientVersion: '2.37.0', ipAddress: '10.0.0.2', deviceName: 'Linux Firefox', deviceVersion: '128.0', extraData: { browserName: 'Firefox', osName: 'Linux', osVersion: '6.1' } })
      android = await mkDevice(users.admin, { deviceId: 'android-dev', clientName: 'Abs Android', clientVersion: '0.10.0', ipAddress: '10.0.0.3', deviceName: 'Google Pixel 6', deviceVersion: '34', extraData: { browserName: 'Chrome', osName: 'Android', osVersion: '14', manufacturer: 'Google', model: 'Pixel 6' } })
      ios = await mkDevice(users.admin, { deviceId: 'ios-dev', clientName: 'Abs iOS', clientVersion: '0.9.0', ipAddress: '10.0.0.4', deviceName: 'Apple iPhone 14', deviceVersion: '17.2', extraData: { osName: 'iOS', osVersion: '17.2', manufacturer: 'Apple', model: 'iPhone14,7' } })
      // different createdAt (startedAt) and updatedAt
      bookSession = await dbSession(users.admin, '2024-04-01T08:00:00Z', { title: 'Book On Android', timeListening: 15 })
      await setRow(Database.playbackSessionModel, bookSession.id, { deviceId: android.id, updatedAt: new Date('2024-04-01T09:30:00Z') })
      epSession = await Database.playbackSessionModel.create(
        { userId: users.admin.id, libraryId: lf.library.id, mediaItemId: EP, mediaItemType: 'podcastEpisode', displayTitle: 'Episode One', displayAuthor: 'The Host', duration: 1800, playMethod: 0, mediaPlayer: 'html5', startTime: 5, currentTime: 50, serverVersion: '2.37.0', coverPath: '/c.jpg', timeListening: 45, mediaMetadata: { title: 'Pod' }, date: '2024-04-02', dayOfWeek: 'Tuesday', extraData: { libraryItemId: item.id }, deviceId: web.id, createdAt: new Date('2024-04-02T10:00:00Z'), updatedAt: new Date('2024-04-02T11:15:00Z') },
        { silent: true }
      )
      iosSession = await dbSession(users.admin, '2024-04-03T07:00:00Z', { title: 'Book On iOS', timeListening: 5 })
      await setRow(Database.playbackSessionModel, iosSession.id, { deviceId: ios.id, updatedAt: new Date('2024-04-03T07:45:00Z') })
      ids = new Map([[bookSession.id, '<book-session>'], [epSession.id, '<episode-session>'], [iosSession.id, '<ios-session>'], [web.id, '<dev-web>'], [android.id, '<dev-android>'], [ios.id, '<dev-ios>'], [EP, '<episode>']])
    })

    it('maps media type, startedAt/updatedAt and device info in GET /api/sessions', async function () {
      this.ids = ids
      const res = await api.request('GET', '/api/sessions?sort=createdAt', { as: 'admin' })
      snap(this, res, 'sessions with devices and a podcast episode')
      // snapshots mask timestamps, so pin the raw startedAt (row createdAt) and updatedAt here
      const ep = res.body.sessions.find((x) => x.id === epSession.id)
      expect([ep.mediaType, ep.startedAt, ep.updatedAt]).to.deep.equal(['podcast', new Date('2024-04-02T10:00:00Z').valueOf(), new Date('2024-04-02T11:15:00Z').valueOf()])
      snap(this, await api.request('GET', '/api/sessions?sort=createdAt&user=' + users.admin.id + '&itemsPerPage=1&page=1', { as: 'admin' }), 'podcast episode session alone')
    })
    it('maps the same fields in GET /api/me/listening-sessions', async function () {
      this.ids = ids
      const res = await api.request('GET', '/api/me/listening-sessions', { as: 'admin' })
      snap(this, res, 'admin listening sessions with devices and a podcast episode')
      const b = res.body.sessions.find((x) => x.id === bookSession.id)
      expect([b.mediaType, b.startedAt, b.updatedAt]).to.deep.equal(['book', new Date('2024-04-01T08:00:00Z').valueOf(), new Date('2024-04-01T09:30:00Z').valueOf()])
    })
    it('maps a stored session in GET /api/session/:id (open session)', async function () {
      this.ids = ids
      for (const row of [bookSession, epSession, iosSession]) {
        const full = await Database.playbackSessionModel.getById(row.id)
        openSessions.push(full)
      }
      snap(this, await api.request('GET', `/api/session/${epSession.id}`, { as: 'admin' }), 'podcast episode session with web device')
      snap(this, await api.request('GET', `/api/session/${bookSession.id}`, { as: 'admin' }), 'book session with android device')
      snap(this, await api.request('GET', `/api/session/${iosSession.id}`, { as: 'admin' }), 'book session with ios device')
    })
    it('maps the rows through getOldPlaybackSession', async function () {
      const ep = await Database.playbackSessionModel.getById(epSession.id)
      expect(ep.mediaType).to.equal('podcast')
      expect(ep.episodeId).to.equal(EP)
      expect(ep.bookId).to.equal(null)
      expect(ep.startedAt).to.equal(new Date('2024-04-02T10:00:00Z').valueOf())
      expect(ep.updatedAt).to.equal(new Date('2024-04-02T11:15:00Z').valueOf())
      const b = await Database.playbackSessionModel.getById(bookSession.id)
      expect(b.mediaType).to.equal('book')
      expect(b.bookId).to.equal(book.id)
      expect(b.episodeId).to.equal(null)
      expect(b.startedAt).to.equal(new Date('2024-04-01T08:00:00Z').valueOf())
      expect(b.updatedAt).to.equal(new Date('2024-04-01T09:30:00Z').valueOf())
      expect(b.deviceInfo.sdkVersion).to.equal('34')
      expect(b.deviceInfo.browserVersion).to.equal(null)
      expect(b.deviceInfo.browserName).to.equal('Chrome')
      expect(b.deviceInfo.manufacturer).to.equal('Google')
      const w = (await Database.playbackSessionModel.getById(epSession.id)).deviceInfo
      expect(w.sdkVersion).to.equal('') // odd: DeviceInfo.construct runs stripAllTags on string fields so a null sdkVersion becomes ''
      expect(w.browserVersion).to.equal('128.0')
      expect(w.browserName).to.equal('Firefox')
      expect(w.osName).to.equal('Linux')
    })
    it('stores deviceId, serverVersion and timestamps when created through createFromOld', async function () {
      const old = new OldPlaybackSession({
        id: '77777777-7777-4777-8777-777777777777',
        userId: users.admin.id,
        libraryId: lf.library.id,
        libraryItemId: item.id,
        bookId: book.id,
        mediaType: 'book',
        mediaMetadata: { title: 'Old Path' },
        displayTitle: 'Old Path',
        displayAuthor: 'Someone',
        duration: 3600,
        playMethod: 0,
        mediaPlayer: 'html5',
        deviceInfo: { ...android.getOldDevice() },
        serverVersion: '9.9.9-test',
        date: '2024-05-01',
        dayOfWeek: 'Wednesday',
        timeListening: 12,
        startTime: 1,
        currentTime: 2,
        startedAt: new Date('2024-05-01T10:00:00Z').valueOf(),
        updatedAt: new Date('2024-05-01T10:20:00Z').valueOf()
      })
      await Database.playbackSessionModel.createFromOld(old)
      const row = await Database.playbackSessionModel.findByPk(old.id)
      expect(row.deviceId).to.equal(android.id)
      expect(row.serverVersion).to.equal('9.9.9-test')
      expect(row.mediaItemType).to.equal('book')
      expect(row.mediaItemId).to.equal(book.id)
      expect(row.createdAt.toISOString()).to.equal('2024-05-01T10:00:00.000Z')
      expect(row.updatedAt.toISOString()).to.equal('2024-05-01T10:20:00.000Z')
      expect(row.extraData).to.deep.equal({ libraryItemId: item.id })
      this.ids = new Map([[old.id, '<created>'], ...ids])
      snap(this, { row: row.toJSON() }, 'row created by createFromOld')
      snap(this, await api.request('GET', `/api/sessions?sort=createdAt&desc=1&itemsPerPage=1&page=0`, { as: 'admin' }), 'sessions list newest is the created one')
      // a session without device info or server version stores nulls
      const bare = new OldPlaybackSession({ ...old.toJSON(), id: '88888888-8888-4888-8888-888888888888', deviceInfo: null, serverVersion: null })
      await Database.playbackSessionModel.createFromOld(bare)
      const bareRow = await Database.playbackSessionModel.findByPk(bare.id)
      expect(bareRow.deviceId).to.equal(null)
      expect(bareRow.serverVersion).to.equal(null)
    })
  })

  describe('GET /api/sessions/open', () => {
    it('requires an admin and lists open sessions with their user and share sessions', async function () {
      this.ids = new Map()
      openSessions.push(openSession({ id: '11111111-1111-4111-8111-111111111111', userId: users.user.id, libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id }))
      openSessions.push(openSession({ id: '22222222-2222-4222-8222-222222222222', userId: '99999999-9999-4999-8999-999999999999', libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id, title: 'Orphan' }))
      const savedShare = ShareManager.openSharePlaybackSessions
      ShareManager.openSharePlaybackSessions = [openSession({ id: '33333333-3333-4333-8333-333333333333', userId: null, libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id, title: 'Shared' })]
      try {
        snap(this, await api.request('GET', '/api/sessions/open'), 'unauthenticated')
        snap(this, await api.request('GET', '/api/sessions/open', { as: 'user' }), 'user')
        snap(this, await api.request('GET', '/api/sessions/open', { as: 'admin' }), 'admin')
        snap(this, await api.request('GET', '/api/sessions/open', { as: 'root' }), 'root')
        openSessions.length = 0
        ShareManager.openSharePlaybackSessions = []
        snap(this, await api.request('GET', '/api/sessions/open', { as: 'admin' }), 'none open')
      } finally {
        ShareManager.openSharePlaybackSessions = savedShare
      }
    })
  })

  describe('open session routes (/api/session/:id)', () => {
    const SID = '11111111-1111-4111-8111-111111111111'
    beforeEach(() => {
      const audioTracks = [{ index: 1, startOffset: 0, duration: 3600, title: 'a.mp3', contentUrl: `/public/session/${SID}/track/1`, mimeType: 'audio/mpeg', metadata: null }]
      openSessions.push(openSession({ id: SID, userId: users.user.id, libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id, audioTracks }))
    })

    it('GET returns the open session with its library item', async function () {
      this.ids = new Map([[SID, '<session>']])
      snap(this, await api.request('GET', `/api/session/${SID}`), 'unauthenticated')
      snap(this, await api.request('GET', `/api/session/${SID}`, { as: 'user' }), 'owner')
      snap(this, await api.request('GET', `/api/session/${SID}`, { as: 'admin' }), 'admin may read others')
      snap(this, await api.request('GET', `/api/session/${SID}`, { as: 'guest' }), 'other non-admin')
      snap(this, await api.request('GET', '/api/session/nope', { as: 'user' }), 'unknown id')
    })
    it('POST sync passes the body to the manager', async function () {
      this.ids = new Map([[SID, '<session>']])
      const body = { currentTime: 42, timeListened: 7, duration: 3600 }
      snap(this, await api.request('POST', `/api/session/${SID}/sync`, { json: body }), 'unauthenticated', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/sync`, { as: 'user', json: body }), 'owner', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/sync`, { as: 'admin', json: body }), 'admin on another user session', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/sync`, { as: 'guest', json: body }), 'other non-admin', { calls: managerCalls() })
      snap(this, await api.request('POST', '/api/session/nope/sync', { as: 'user', json: body }), 'unknown id', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/sync`, { as: 'user' }), 'no body', { calls: managerCalls() })
    })
    it('POST close passes the body, or null for an empty body', async function () {
      this.ids = new Map([[SID, '<session>']])
      const body = { currentTime: 99, timeListened: 3, duration: 3600 }
      snap(this, await api.request('POST', `/api/session/${SID}/close`, { json: body }), 'unauthenticated', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/close`, { as: 'user', json: body }), 'owner with sync data', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/close`, { as: 'user', json: {} }), 'owner with empty body', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/close`, { as: 'user' }), 'owner without body', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/close`, { as: 'root', json: body }), 'root', { calls: managerCalls() })
      snap(this, await api.request('POST', `/api/session/${SID}/close`, { as: 'guest', json: body }), 'other non-admin', { calls: managerCalls() })
      snap(this, await api.request('POST', '/api/session/nope/close', { as: 'user', json: body }), 'unknown id', { calls: managerCalls() })
    })
  })

  describe('POST /api/session/local and /api/session/local-all', () => {
    it('hands the request to the manager', async function () {
      snap(this, await api.request('POST', '/api/session/local', { json: {} }), 'local unauthenticated', { calls: managerCalls() })
      snap(this, await api.request('POST', '/api/session/local', { as: 'user', json: { id: 'local_1', libraryItemId: item.id, currentTime: 12 } }), 'local', { calls: managerCalls() })
      snap(this, await api.request('POST', '/api/session/local', { as: 'guest' }), 'local guest without body', { calls: managerCalls() })
      snap(this, await api.request('POST', '/api/session/local-all', { json: {} }), 'local-all unauthenticated', { calls: managerCalls() })
      snap(this, await api.request('POST', '/api/session/local-all', { as: 'admin', json: { sessions: [{ id: 'local_1' }, { id: 'local_2' }], deviceInfo: { deviceId: 'd' } } }), 'local-all', { calls: managerCalls() })
    })
  })

  describe('DELETE /api/sessions/:id', () => {
    it('deletes as root only, closing open sessions first', async function () {
      const a = await dbSession(users.user, '2024-02-01T10:00:00Z', { title: 'A' })
      const b = await dbSession(users.admin, '2024-02-02T10:00:00Z', { title: 'B' })
      openSessions.push(openSession({ id: b.id, userId: users.admin.id, libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id }))
      this.ids = new Map([[a.id, '<A>'], [b.id, '<B>']])
      const del = (id, as) => api.request('DELETE', `/api/sessions/${id}`, { as })
      snap(this, await del(a.id), 'unauthenticated')
      snap(this, await del(a.id, 'admin'), 'admin', { calls: managerCalls() })
      snap(this, await del(a.id, 'user'), 'owner user', { calls: managerCalls() })
      snap(this, await del('not-a-session', 'root'), 'unknown id')
      snap(this, await del(a.id, 'root'), 'root deletes closed session', { calls: managerCalls() })
      snap(this, await del(a.id, 'root'), 'delete again')
      snap(this, await del(b.id, 'root'), 'root deletes an open session', { calls: managerCalls(), openLeft: openSessions.length })
      snap(this, { rows: await Database.playbackSessionModel.count() }, 'rows left')
    })
  })

  describe('POST /api/sessions/batch/delete', () => {
    it('validates, requires an admin and deletes in bulk', async function () {
      const ids = []
      for (const [i, user] of [users.user, users.admin, users.guest, users.root].entries()) ids.push((await dbSession(user, `2024-03-0${i + 1}T10:00:00Z`)).id)
      openSessions.push(openSession({ id: ids[1], userId: users.admin.id, libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id }))
      this.ids = new Map(ids.map((id, i) => [id, `<s${i}>`]))
      const del = (sessions, as = 'admin') => api.request('POST', '/api/sessions/batch/delete', { as, json: { sessions } })
      snap(this, await api.request('POST', '/api/sessions/batch/delete', { json: { sessions: ids } }), 'unauthenticated')
      snap(this, await del(ids, 'user'), 'user')
      snap(this, await del(ids, 'guest'), 'guest')
      snap(this, await del(undefined), 'no sessions')
      snap(this, await del([]), 'empty')
      snap(this, await del('x'), 'not an array')
      snap(this, await del([ids[0], 'nope']), 'invalid id (nothing deleted)')
      snap(this, { rows: await Database.playbackSessionModel.count() }, 'rows before')
      snap(this, await del([ids[0], ids[1], '99999999-9999-4999-8999-999999999999']), 'admin deletes two and an unknown id', { calls: managerCalls(), openLeft: openSessions.length })
      snap(this, { rows: await Database.playbackSessionModel.count() }, 'rows after admin')
      snap(this, await del([ids[2], ids[3]], 'root'), 'root deletes the rest', { calls: managerCalls() })
      snap(this, { rows: await Database.playbackSessionModel.count() }, 'rows after root')
    })
  })

  describe('GET /public/session/:id/track/:index', () => {
    const SID = '11111111-1111-4111-8111-111111111111'
    let trackPath
    const track = (o = {}) => ({ index: 1, contentUrl: `/public/session/${SID}/track/1`, metadata: { path: trackPath }, ...o })
    const getTrack = async (url) => {
      const res = await fetch(api.base + url, { redirect: 'manual' })
      const text = await res.text()
      return { status: res.status, headers: { 'content-type': res.headers.get('content-type'), location: res.headers.get('location'), 'x-accel-redirect': res.headers.get('x-accel-redirect') }, body: text }
    }
    beforeEach(() => {
      api.app.use('/public', new PublicRouter(manager).router)
      trackPath = path.join(api.tmp, 'track.m4b')
      fs.writeFileSync(trackPath, 'fake audio bytes')
    })
    const open = (o = {}) => {
      openSessions.length = 0
      openSessions.push(openSession({ id: SID, userId: users.user.id, libraryId: lf.library.id, libraryItemId: item.id, bookId: book.id, audioTracks: [track(), track({ index: 2, metadata: {} })], ...o }))
    }

    it('validates the session and track', async function () {
      this.ids = new Map([[SID, '<session>']])
      open()
      snap(this, await getTrack(`/public/session/${SID}/track/abc`), 'invalid index')
      snap(this, await getTrack('/public/session/nope/track/1'), 'unknown session')
      snap(this, await getTrack(`/public/session/${SID}/track/7`), 'unknown track')
      snap(this, await getTrack(`/public/session/${SID}/track/2`), 'track without a file path')
      snap(this, await getTrack(`/public/session/${SID}/track/0`), 'index 0 for a book')
    })
    it('streams the file without authentication, with the audio mime type', async function () {
      this.ids = new Map([[SID, '<session>']])
      open()
      snap(this, await getTrack(`/public/session/${SID}/track/1`), 'book track')
      open({ mediaType: 'podcast', bookId: null, episodeId: 'e0000000-0000-4000-8000-000000000001', audioTracks: [track({ index: null })] })
      snap(this, await getTrack(`/public/session/${SID}/track/0`), 'podcast track with null index requested as 0')
    })
    it('redirects transcode sessions and supports X-Accel', async function () {
      this.ids = new Map([[SID, '<session>']])
      open({ playMethod: 2, audioTracks: [track({ contentUrl: '/hls/some-stream/output-0.ts' })] })
      snap(this, await getTrack(`/public/session/${SID}/track/1`), 'transcode redirect')
      open()
      global.XAccel = '/audiobooks'
      snap(this, await getTrack(`/public/session/${SID}/track/1`), 'x-accel')
      global.XAccel = ''
    })
  })
})
