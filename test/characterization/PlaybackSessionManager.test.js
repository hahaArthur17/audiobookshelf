const { expect } = require('chai')
const fs = require('fs')
const path = require('path')
const sinon = require('sinon')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { createLibrary } = require('./helpers/seed-library')
const { createFileBook, createFilePodcast } = require('./helpers/seed-items-extra')
const { createProgress } = require('./helpers/seed-users-extra')
const Database = require('../../server/Database')
const PlaybackSessionManager = require('../../server/managers/PlaybackSessionManager')
const Stream = require('../../server/objects/Stream')

/*
 * The REAL PlaybackSessionManager (and PlaybackSession, DeviceInfo, models) behind the real ApiRouter/SessionController/
 * LibraryItemController routes. Only the ffmpeg spawn is replaced: Stream.prototype.start is stubbed so a transcode session
 * is registered, its playlist is generated and its stream directory is created and removed for real, but no ffmpeg runs.
 * Socket emissions are recorded by the harness.
 *
 * Time: nothing here depends on the wall clock. Session updatedAt values are set explicitly, and the stale-session cutoff is
 * tested under a frozen Date. Writes the manager does not await (saveSession) are awaited through the spied model methods.
 */
describe('PlaybackSessionManager (characterization)', function () {
  this.timeout(30000)

  const HOUR = 3600 * 1000
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  let api, users, lf, plf, book, item, podcast, podItem, episodes, manager, startStub, createSpy, updateSpy

  /** poll (bounded) until an async predicate holds; used for DB writes the manager starts without awaiting */
  async function until(fn, what, ms = 5000) {
    const start = Date.now()
    for (;;) {
      const v = await fn()
      if (v) return v
      if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
      await new Promise((r) => setTimeout(r, 5))
    }
  }
  const settled = () => Promise.allSettled([...createSpy.returnValues, ...updateSpy.returnValues])
  const sessionRow = (id) => Database.playbackSessionModel.findByPk(id)
  const progressRow = (user, mediaItemId) => Database.mediaProgressModel.findOne({ where: { userId: user.id, mediaItemId } })

  beforeEach(async function () {
    api = await startApi()
    users = await api.seed.users()
    startStub = sinon.stub(Stream.prototype, 'start').callsFake(function () {
      return Promise.resolve()
    })
    manager = new PlaybackSessionManager()
    api.apiRouter.playbackSessionManager = manager
    // pass-through spies (the real save runs): they count which save path the manager takes and give the pending writes to await
    const sessions = Database.playbackSessionModel
    createSpy = sinon.spy(sessions, 'createFromOld')
    updateSpy = sinon.spy(sessions, 'updateFromOld')
    lf = await createLibrary({ name: 'Books', path: path.join(api.tmp, 'books') })
    plf = await createLibrary({ name: 'Pods', mediaType: 'podcast', path: path.join(api.tmp, 'pods') })
    const b = await createFileBook(lf, { title: 'Played Book', authors: ['Ann Author'], audio: [{ filename: 'part1.mp3', ino: 'ino1', duration: 3600 }] })
    book = b.book
    item = b.libraryItem
    const p = await createFilePodcast(plf, {
      title: 'Played Pod',
      author: 'The Host',
      episodes: [
        { title: 'Ep One', filename: 'ep1.mp3', ino: 'epino1', duration: 1800 },
        { title: 'Ep Two', filename: 'ep2.mp3', ino: 'epino2', duration: 900 }
      ]
    })
    podcast = p.podcast
    podItem = p.libraryItem
    episodes = p.episodes
    // sort columns the scanner fills in; the manager copies them into sessions that arrive without a title or author
    await Database.libraryItemModel.update({ title: 'Played Book', authorNamesFirstLast: 'Ann Author' }, { where: { id: item.id }, silent: true })
    await Database.libraryItemModel.update({ title: 'Played Pod', authorNamesFirstLast: 'The Host' }, { where: { id: podItem.id }, silent: true })
  })

  afterEach(async function () {
    await settled()
    for (const s of manager.sessions) if (s.stream) await s.stream.close()
    await api.stop()
  })

  const MP3 = ['audio/mpeg']
  const play = (as, body = {}, o = {}) => api.request('POST', `/api/items/${o.item || item.id}/play`, { as, headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.9' }, json: { mediaPlayer: 'test-player', supportedMimeTypes: MP3, deviceInfo: { deviceId: 'dev-1', clientVersion: '1.2.3', clientName: 'Abs Web' }, ...body } })
  const playEpisode = (as, epId, body = {}) => api.request('POST', `/api/items/${podItem.id}/play/${epId}`, { as, headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.9' }, json: { mediaPlayer: 'test-player', supportedMimeTypes: MP3, deviceInfo: { deviceId: 'dev-1', clientVersion: '1.2.3', clientName: 'Abs Web' }, ...body } })
  const sync = (as, id, body) => api.request('POST', `/api/session/${id}/sync`, { as, json: body })
  const close = (as, id, body = {}) => api.request('POST', `/api/session/${id}/close`, { as, json: body })

  /** socket emissions reduced to what matters (payloads hold whole library items) */
  const events = () =>
    api.emitted.splice(0).map((e) => {
      if (e.method === 'adminEmitter') return { method: e.method, event: e.args[0], username: e.args[1]?.username, sessionId: e.args[1]?.session?.id ?? null }
      if (e.method === 'clientEmitter') {
        const [userId, event, data] = e.args
        const out = { method: e.method, userId, event }
        if (event === 'user_item_progress_updated') Object.assign(out, { sessionId: data.sessionId, deviceDescription: data.deviceDescription, progress: { id: data.id, libraryItemId: data.data.libraryItemId, episodeId: data.data.episodeId, currentTime: data.data.currentTime, duration: data.data.duration, isFinished: data.data.isFinished } })
        else out.data = data
        return out
      }
      return { method: e.method, args: e.args }
    })
  const snap = (ctx, value, label) => matchSnapshot(ctx, value, { label, ids: ctx.ids, tmpDirs: [api.tmp] })
  /** a client session payload without the (large) expanded library item */
  const clientView = (body) => {
    const { libraryItem, ...rest } = body
    return { ...rest, libraryItem: libraryItem ? { id: libraryItem.id, mediaType: libraryItem.mediaType } : libraryItem }
  }

  describe('startSession: direct play or transcode', () => {
    it('starts a direct play session for a client that supports the file type', async function () {
      this.ids = new Map()
      const res = await play('user', { mediaPlayer: 'html5' })
      expect(res.status).to.equal(200)
      const s = res.body
      expect(s.playMethod).to.equal(0)
      expect([s.mediaType, s.mediaPlayer, s.libraryId, s.libraryItemId, s.bookId, s.episodeId, s.userId]).to.deep.equal(['book', 'html5', lf.library.id, item.id, book.id, null, users.user.id])
      expect([s.startTime, s.currentTime, s.timeListening, s.duration, s.displayTitle, s.displayAuthor]).to.deep.equal([0, 0, 0, 3600, 'Played Book', 'Ann Author'])
      expect(s.startedAt).to.be.a('number')
      expect(s.updatedAt).to.equal(s.startedAt)
      expect(s.audioTracks).to.have.length(1)
      expect([s.audioTracks[0].contentUrl, s.audioTracks[0].mimeType, s.audioTracks[0].startOffset, s.audioTracks[0].duration]).to.deep.equal([`/api/items/${item.id}/file/ino1`, 'audio/mpeg', 0, 3600])
      // the session is open in the manager, found by id, by user and has no stream
      expect(manager.sessions.map((x) => x.id)).to.deep.equal([s.id])
      expect(manager.getSession(s.id)).to.equal(manager.sessions[0])
      expect(manager.getSession('nope')).to.equal(undefined)
      expect(manager.getUserSession(users.user.id)).to.equal(manager.sessions[0])
      expect(manager.getUserSession(users.admin.id)).to.equal(undefined)
      expect(manager.getStream(s.id)).to.equal(null)
      expect(manager.getStream('nope')).to.equal(null)
      expect(startStub.callCount).to.equal(0)
      // nothing is written to the database until listening time is synced
      expect(await Database.playbackSessionModel.count()).to.equal(0)
      expect(await Database.mediaProgressModel.count()).to.equal(0)
      const ev = events()
      expect(ev).to.deep.equal([{ method: 'adminEmitter', event: 'user_stream_update', username: 'user', sessionId: s.id }])
      snap(this, { res: { status: res.status, body: clientView(res.body) }, ev }, 'direct play response and emits')
    })

    it('records the device from the request and the client device info', async function () {
      this.ids = new Map()
      const res = await play('user', { deviceInfo: { deviceId: 'phone-1', clientVersion: '0.10.0', clientName: 'Abs Android', manufacturer: 'Google', model: 'Pixel 6', sdkVersion: 34 } })
      expect(res.body.deviceInfo.deviceId).to.equal('phone-1')
      const rows = await Database.deviceModel.findAll()
      expect(rows).to.have.length(1)
      expect([rows[0].id, rows[0].userId, rows[0].deviceId, rows[0].clientName, rows[0].clientVersion]).to.deep.equal([res.body.deviceInfo.id, users.user.id, 'phone-1', 'Abs Android', '0.10.0'])
      snap(this, { deviceInfo: res.body.deviceInfo, sessionDevice: manager.sessions[0].deviceDescription }, 'device info')
    })

    it('transcodes when the client cannot play the file, when forced, or when it sends no supported types', async function () {
      this.ids = new Map()
      const cases = {
        unsupportedType: { supportedMimeTypes: ['audio/flac'] },
        noSupportedTypes: { supportedMimeTypes: undefined },
        forceTranscode: { forceTranscode: true },
        forceDirectPlayWins: { forceDirectPlay: true, forceTranscode: true, supportedMimeTypes: ['audio/flac'] },
        forceDirectPlay: { forceDirectPlay: true, supportedMimeTypes: ['audio/flac'] }
      }
      const out = {}
      let n = 0
      for (const [label, body] of Object.entries(cases)) {
        const res = await play('user', { ...body, deviceInfo: { deviceId: `dev-${n++}` } })
        expect(res.status, label).to.equal(200)
        out[label] = { playMethod: res.body.playMethod, tracks: res.body.audioTracks.map((t) => ({ contentUrl: t.contentUrl, mimeType: t.mimeType, duration: t.duration, title: t.title })), hasStream: !!manager.getStream(res.body.id) }
      }
      expect(out.unsupportedType.playMethod).to.equal(2)
      expect(out.noSupportedTypes.playMethod).to.equal(2)
      expect(out.forceTranscode.playMethod).to.equal(2)
      expect(out.forceDirectPlayWins.playMethod).to.equal(0)
      expect(out.forceDirectPlay.playMethod).to.equal(0)
      expect(startStub.callCount).to.equal(3)
      snap(this, out, 'play method decisions')
    })

    it('a transcode session owns a Stream with a generated playlist, and closing it removes the stream directory', async function () {
      this.ids = new Map()
      const res = await play('user', { forceTranscode: true, mediaPlayer: undefined })
      const id = res.body.id
      expect(res.body.mediaPlayer).to.equal('unknown')
      const session = manager.getSession(id)
      const stream = manager.getStream(id)
      expect(stream).to.be.instanceOf(Stream)
      expect(session.stream).to.equal(stream)
      expect(startStub.calledOnce).to.equal(true)
      expect(startStub.firstCall.thisValue).to.equal(stream)
      expect([stream.id, stream.user.id, stream.libraryItem.id, stream.episodeId, stream.startTime]).to.deep.equal([id, users.user.id, item.id, null, 0])
      expect(stream.streamPath).to.equal(path.join(manager.StreamsPath, id))
      const playlist = fs.readFileSync(path.join(stream.streamPath, 'output.m3u8'), 'utf8')
      expect(res.body.audioTracks).to.have.length(1)
      expect(res.body.audioTracks[0]).to.include({ contentUrl: `/hls/${id}/output.m3u8`, mimeType: 'application/vnd.apple.mpegurl', duration: 3600, startOffset: 0, index: 1, title: 'Played Book' })
      api.emitted.length = 0
      const closeRes = await close('user', id)
      expect(closeRes.status).to.equal(200)
      expect(fs.existsSync(stream.streamPath)).to.equal(false)
      expect(session.stream, "the stream's closed event clears session.stream").to.equal(null)
      expect(manager.sessions).to.have.length(0)
      const ev = events()
      snap(this, { response: clientView(res.body), playlist, closeEvents: ev }, 'transcode session')
    })

    it('resumes at the stored progress, but restarts a finished item at 0', async function () {
      this.ids = new Map()
      await createProgress(users.user, { libraryItem: item, mediaItemId: book.id, duration: 3600, currentTime: 123.5, updatedAt: '2024-01-01T00:00:00Z' })
      const a = await play('user')
      expect([a.body.startTime, a.body.currentTime]).to.deep.equal([123.5, 123.5])
      // other users have their own progress
      const b = await play('admin', {}, {})
      expect([b.body.startTime, b.body.currentTime]).to.deep.equal([0, 0])
      // (through the API: the server caches users with their progress)
      const fin = await api.request('PATCH', `/api/me/progress/${item.id}`, { as: 'user', json: { isFinished: true } })
      expect(fin.status).to.equal(200)
      const c = await play('user')
      expect([c.body.startTime, c.body.currentTime]).to.deep.equal([0, 0])
      // the stored progress itself is untouched by starting
      const row = await progressRow(users.user, book.id)
      expect([row.currentTime, row.isFinished]).to.deep.equal([123.5, true])
      snap(this, { resumed: [a.body.startTime, a.body.currentTime], otherUser: [b.body.startTime], finished: [c.body.startTime] }, 'start times')
    })

    it('starts a podcast episode session with the episode track, no book id and the episode progress', async function () {
      this.ids = new Map()
      await createProgress(users.user, { libraryItem: podItem, mediaItemId: episodes[1].id, episode: true, podcastId: podcast.id, duration: 900, currentTime: 77, updatedAt: '2024-01-01T00:00:00Z' })
      const res = await playEpisode('user', episodes[1].id)
      expect(res.status).to.equal(200)
      const s = res.body
      expect([s.mediaType, s.bookId, s.episodeId, s.libraryItemId, s.libraryId, s.duration, s.displayTitle, s.displayAuthor, s.startTime, s.currentTime, s.playMethod]).to.deep.equal(['podcast', null, episodes[1].id, podItem.id, plf.library.id, 900, 'Ep Two', 'The Host', 77, 77, 0])
      expect(s.audioTracks.map((t) => t.contentUrl)).to.deep.equal([`/api/items/${podItem.id}/file/epino2`])
      // the other episode has no progress
      const other = await playEpisode('user', episodes[0].id, { deviceInfo: { deviceId: 'dev-2' } })
      expect([other.body.startTime, other.body.duration, other.body.displayTitle]).to.deep.equal([0, 1800, 'Ep One'])
      expect(other.body.audioTracks.map((t) => t.contentUrl)).to.deep.equal([`/api/items/${podItem.id}/file/epino1`])
      // episode transcode
      const tr = await playEpisode('user', episodes[0].id, { forceTranscode: true, deviceInfo: { deviceId: 'dev-3' } })
      expect(tr.body.playMethod).to.equal(2)
      const stream = manager.getStream(tr.body.id)
      expect([stream.episodeId, stream.totalDuration]).to.deep.equal([episodes[0].id, 1800])
      snap(this, { episode: clientView(res.body), other: [other.body.startTime, other.body.duration], transcodeTracks: tr.body.audioTracks }, 'podcast episode')
    })

    it('rejects items that cannot be played, episodes that do not exist and unauthenticated requests', async function () {
      this.ids = new Map()
      const noAudio = await createFileBook(lf, { title: 'No Audio', audio: [] })
      const responses = {
        noAudioTracks: await play('user', {}, { item: noAudio.libraryItem.id }),
        unknownItem: await play('user', {}, { item: '00000000-0000-4000-8000-0000000000ff' }),
        episodeOfBook: await api.request('POST', `/api/items/${item.id}/play/${episodes[0].id}`, { as: 'user', json: {} }),
        unknownEpisode: await playEpisode('user', '00000000-0000-4000-8000-0000000000ff'),
        unauthenticated: await api.request('POST', `/api/items/${item.id}/play`, { json: {} })
      }
      expect(manager.sessions).to.have.length(0)
      snap(this, Object.fromEntries(Object.entries(responses).map(([k, r]) => [k, r.status])), 'rejections')
    })
  })

  describe('startSession: closing sessions already open for the user and device', () => {
    it('closes the open session of the same user and device, and keeps the others', async function () {
      this.ids = new Map()
      const first = await play('user', { deviceInfo: { deviceId: 'dev-A' } })
      const otherDevice = await play('user', { deviceInfo: { deviceId: 'dev-B' } })
      const otherUser = await play('admin', { deviceInfo: { deviceId: 'dev-C' } })
      expect(manager.sessions.map((s) => s.id)).to.deep.equal([first.body.id, otherDevice.body.id, otherUser.body.id])
      api.emitted.length = 0
      const second = await play('user', { deviceInfo: { deviceId: 'dev-A' } })
      expect(manager.sessions.map((s) => s.id)).to.deep.equal([otherDevice.body.id, otherUser.body.id, second.body.id])
      expect(second.body.deviceInfo.id).to.equal(first.body.deviceInfo.id)
      const ev = events()
      expect(ev.map((e) => e.event)).to.deep.equal(['user_stream_update', 'user_session_closed', 'user_stream_update'])
      expect(ev[1]).to.deep.include({ method: 'clientEmitter', userId: users.user.id, data: first.body.id })
      snap(this, { remaining: manager.sessions.map((s) => s.id), ev }, 'same device replaced')
    })

    it('two users on the same device id each keep their own session', async function () {
      this.ids = new Map()
      const a = await play('user', { deviceInfo: { deviceId: 'shared-device' } })
      const b = await play('admin', { deviceInfo: { deviceId: 'shared-device' } })
      expect(a.body.deviceInfo.id).to.equal(b.body.deviceInfo.id)
      expect(manager.sessions.map((s) => s.id)).to.deep.equal([a.body.id, b.body.id])
    })

    it('a client without a device id gets a new device row and a new session each time, none closed', async function () {
      this.ids = new Map()
      const a = await play('user', { deviceInfo: undefined })
      const b = await play('user', { deviceInfo: undefined })
      expect(a.body.deviceInfo.id).to.not.equal(b.body.deviceInfo.id)
      expect(a.body.deviceInfo.deviceId).to.equal(a.body.deviceInfo.id)
      expect(manager.sessions).to.have.length(2)
      expect(await Database.deviceModel.count()).to.equal(2)
    })

    it('closing the replaced session saves its listening time first', async function () {
      this.ids = new Map()
      const first = await play('user')
      await sync('user', first.body.id, { currentTime: 30, timeListened: 30 })
      await settled()
      const second = await play('user')
      await settled()
      expect(manager.sessions.map((s) => s.id)).to.deep.equal([second.body.id])
      const row = await sessionRow(first.body.id)
      expect([row.timeListening, row.currentTime]).to.deep.equal([30, 30])
    })

    it('reuses the stored device and updates it when the client details changed', async function () {
      this.ids = new Map()
      const a = await play('user', { deviceInfo: { deviceId: 'dev-A', clientVersion: '1.0.0', clientName: 'Abs Web' } })
      const before = await Database.deviceModel.findAll()
      const b = await play('user', { deviceInfo: { deviceId: 'dev-A', clientVersion: '2.0.0', clientName: 'Abs Web' } })
      const after = await Database.deviceModel.findAll()
      expect(before).to.have.length(1)
      expect(after).to.have.length(1)
      expect(b.body.deviceInfo.id).to.equal(a.body.deviceInfo.id)
      expect([before[0].clientVersion, after[0].clientVersion]).to.deep.equal(['1.0.0', '2.0.0'])
      expect(after[0].ipAddress).to.be.a('string')
      // unchanged details: still one row, no change
      await play('user', { deviceInfo: { deviceId: 'dev-A', clientVersion: '2.0.0', clientName: 'Abs Web' } })
      expect(await Database.deviceModel.count()).to.equal(1)
      snap(this, { versions: [before[0].clientVersion, after[0].clientVersion], device: b.body.deviceInfo }, 'device update')
    })
  })

  describe('syncSession', () => {
    let s
    beforeEach(async () => {
      s = (await play('user')).body
      api.emitted.length = 0
    })

    it('accumulates listening time, tracks the current time, writes progress and saves the session', async function () {
      this.ids = new Map()
      const session = manager.getSession(s.id)
      const r1 = await sync('user', s.id, { currentTime: 100, timeListened: 10 })
      expect(r1.status).to.equal(200)
      expect([session.currentTime, session.timeListening]).to.deep.equal([100, 10])
      const mp1 = await progressRow(users.user, book.id)
      expect([mp1.currentTime, mp1.duration, mp1.isFinished, mp1.extraData.libraryItemId]).to.deep.equal([100, 3600, false, item.id])
      expect(mp1.extraData.progress).to.be.closeTo(100 / 3600, 1e-9)
      const ev1 = events()
      expect(ev1).to.have.length(1)
      expect(ev1[0]).to.deep.include({ method: 'clientEmitter', userId: users.user.id, event: 'user_item_progress_updated', sessionId: s.id })
      expect(ev1[0].progress).to.deep.equal({ id: mp1.id, libraryItemId: item.id, episodeId: null, currentTime: 100, duration: 3600, isFinished: false })
      expect(ev1[0].deviceDescription).to.equal(session.deviceDescription)

      await until(async () => (await sessionRow(s.id))?.timeListening === 10, 'first session save')
      expect([createSpy.callCount, updateSpy.callCount]).to.deep.equal([1, 0])
      expect(session.lastSave).to.be.a('number').and.greaterThan(0)

      const r2 = await sync('user', s.id, { currentTime: 250, timeListened: '5.5' })
      expect(r2.status).to.equal(200)
      expect([session.currentTime, session.timeListening]).to.deep.equal([250, 15.5])
      await until(async () => (await sessionRow(s.id)).timeListening === 15.5, 'second session save')
      expect([createSpy.callCount, updateSpy.callCount]).to.deep.equal([1, 1])

      // no listening time (0, missing, non numeric) still moves the position
      for (const [i, tl] of [[300, 0], [310, undefined], [320, 'abc'], [330, null]]) {
        expect((await sync('user', s.id, { currentTime: i, timeListened: tl })).status).to.equal(200)
      }
      expect([session.currentTime, session.timeListening]).to.deep.equal([330, 15.5])
      await settled()
      const row = await sessionRow(s.id)
      expect([row.currentTime, row.timeListening, row.playMethod, row.mediaItemType, row.mediaItemId, row.userId, row.deviceId, row.mediaPlayer, row.duration]).to.deep.equal([330, 15.5, 0, 'book', book.id, users.user.id, s.deviceInfo.id, 'test-player', 3600])
      expect(row.extraData.libraryItemId).to.equal(item.id)
      expect(row.createdAt.valueOf()).to.equal(s.startedAt)
      expect(row.updatedAt.valueOf()).to.equal(session.updatedAt)
      const mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.duration]).to.deep.equal([330, 3600])
      expect(await Database.mediaProgressModel.count()).to.equal(1)
      snap(this, { final: { currentTime: row.currentTime, timeListening: row.timeListening }, events: events(), session: session.toJSON() }, 'several syncs')
    })

    it('the sync updates the session activity time', async function () {
      const session = manager.getSession(s.id)
      const clock = sinon.useFakeTimers({ now: s.startedAt + 5000, toFake: ['Date'] })
      try {
        await sync('user', s.id, { currentTime: 10, timeListened: 5 })
        expect(session.updatedAt).to.equal(s.startedAt + 5000)
        clock.tick(7000)
        await sync('user', s.id, { currentTime: 20, timeListened: 0 })
        expect(session.updatedAt, 'no listening time, no activity').to.equal(s.startedAt + 5000)
        await sync('user', s.id, { currentTime: 30, timeListened: 2 })
        expect(session.updatedAt).to.equal(s.startedAt + 12000)
      } finally {
        clock.restore()
      }
    })

    it('uses the duration sent by the client for the progress and the session duration otherwise', async function () {
      this.ids = new Map()
      await sync('user', s.id, { currentTime: 100, timeListened: 1, duration: 7200 })
      expect((await progressRow(users.user, book.id)).duration).to.equal(7200)
      expect(manager.getSession(s.id).duration).to.equal(3600)
      await sync('user', s.id, { currentTime: 200, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).duration).to.equal(3600)
      expect(events().map((e) => e.progress.duration)).to.deep.equal([7200, 3600])
    })

    it('does not fall back to a zero duration: the progress uses the session progress ratio', async function () {
      this.ids = new Map()
      await sync('user', s.id, { currentTime: 1800, timeListened: 1 })
      const mp = await progressRow(users.user, book.id)
      expect(mp.extraData.progress).to.equal(0.5)
    })

    it('marks the book finished by remaining time (library default 10 seconds)', async function () {
      this.ids = new Map()
      await sync('user', s.id, { currentTime: 3589, timeListened: 10 })
      let mp = await progressRow(users.user, book.id)
      expect([mp.isFinished, mp.finishedAt]).to.deep.equal([false, null])
      await sync('user', s.id, { currentTime: 3595, timeListened: 6 })
      mp = await progressRow(users.user, book.id)
      expect(mp.isFinished).to.equal(true)
      expect(mp.finishedAt).to.be.instanceOf(Date)
      expect(mp.extraData.progress).to.equal(1)
      const ev = events()
      expect(ev.map((e) => e.progress.isFinished)).to.deep.equal([false, true])
      // going back before the end un-finishes
      await sync('user', s.id, { currentTime: 100, timeListened: 1 })
      mp = await progressRow(users.user, book.id)
      expect([mp.isFinished, mp.finishedAt]).to.deep.equal([false, null])
      snap(this, { finishedEvents: ev.map((e) => e.progress) }, 'finish by remaining time')
    })

    it('uses the library markAsFinishedTimeRemaining setting', async function () {
      await lf.library.update({ settings: { ...lf.library.librarySettings, markAsFinishedTimeRemaining: 120 } })
      await sync('user', s.id, { currentTime: 100, timeListened: 1 }) // a progress created by a sync is never marked finished, see below
      await sync('user', s.id, { currentTime: 3500, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).isFinished).to.equal(true)
    })

    it('uses the library markAsFinishedPercentComplete setting over the remaining time', async function () {
      await lf.library.update({ settings: { ...lf.library.librarySettings, markAsFinishedPercentComplete: 50, markAsFinishedTimeRemaining: 10 } })
      await sync('user', s.id, { currentTime: 100, timeListened: 1 })
      await sync('user', s.id, { currentTime: 1700, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).isFinished, '47% < 50%').to.equal(false)
      await sync('user', s.id, { currentTime: 1900, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).isFinished, '52% > 50%').to.equal(true)
      // 50% setting: even 3595 is "finished", and nothing but percent is looked at
      await lf.library.update({ settings: { ...lf.library.librarySettings, markAsFinishedPercentComplete: 99, markAsFinishedTimeRemaining: 3000 } })
      await sync('user', s.id, { currentTime: 2000, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).isFinished, '55% < 99% even though 1600s remain < 3000s').to.equal(false)
    })

    it('a progress created by the sync itself is not checked against the finish thresholds (only later syncs finish the book)', async function () {
      this.ids = new Map()
      await sync('user', s.id, { currentTime: 3599, timeListened: 1 })
      let mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.isFinished, mp.finishedAt]).to.deep.equal([3599, false, null])
      await sync('user', s.id, { currentTime: 3599, timeListened: 1 })
      mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.isFinished]).to.deep.equal([3599, true])
      snap(this, events().map((e) => e.progress), 'progress events')
    })

    it('clamps the progress ratio of a new progress between 0 and 1', async function () {
      await sync('user', s.id, { currentTime: 7200, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).extraData.progress).to.equal(1)
      await Database.mediaProgressModel.destroy({ where: { userId: users.user.id } })
      const other = (await play('user', { deviceInfo: { deviceId: 'dev-neg' } })).body
      await sync('user', other.id, { currentTime: -50, timeListened: 1 })
      expect((await progressRow(users.user, book.id)).extraData.progress).to.equal(0)
    })

    it('still answers 200 and saves the session when the progress cannot be written (episode deleted), without emitting', async function () {
      this.ids = new Map()
      const ep = (await playEpisode('user', episodes[0].id, { deviceInfo: { deviceId: 'dev-ep' } })).body
      await Database.podcastEpisodeModel.destroy({ where: { id: episodes[0].id } })
      api.emitted.length = 0
      const res = await sync('user', ep.id, { currentTime: 100, timeListened: 8 })
      expect(res.status).to.equal(200)
      expect(events()).to.deep.equal([])
      expect(await Database.mediaProgressModel.count()).to.equal(0)
      await until(async () => (await sessionRow(ep.id))?.timeListening === 8, 'session save')
    })

    it('syncs a podcast episode session against the episode progress', async function () {
      this.ids = new Map()
      const ep = (await playEpisode('user', episodes[0].id, { deviceInfo: { deviceId: 'dev-ep' } })).body
      api.emitted.length = 0
      expect((await sync('user', ep.id, { currentTime: 900, timeListened: 20 })).status).to.equal(200)
      const mp = await progressRow(users.user, episodes[0].id)
      expect([mp.mediaItemType, mp.mediaItemId, mp.podcastId, mp.currentTime, mp.duration]).to.deep.equal(['podcastEpisode', episodes[0].id, podcast.id, 900, 1800])
      expect(await progressRow(users.user, podcast.id)).to.equal(null)
      const ev = events()
      expect(ev[0].progress).to.deep.equal({ id: mp.id, libraryItemId: podItem.id, episodeId: episodes[0].id, currentTime: 900, duration: 1800, isFinished: false })
      await until(async () => (await sessionRow(ep.id))?.timeListening === 20, 'episode session save')
      const row = await sessionRow(ep.id)
      expect([row.mediaItemType, row.mediaItemId, row.libraryId]).to.deep.equal(['podcastEpisode', episodes[0].id, plf.library.id])
      snap(this, { ev }, 'episode sync')
    })

    it('answers 500 when the library item no longer exists, and 404/403 for unknown or foreign sessions', async function () {
      this.ids = new Map()
      const unknown = await sync('user', '00000000-0000-4000-8000-0000000000aa', { currentTime: 1, timeListened: 1 })
      const foreign = await sync('guest', s.id, { currentTime: 1, timeListened: 1 })
      expect([unknown.status, foreign.status]).to.deep.equal([404, 403])
      expect(manager.getSession(s.id).timeListening).to.equal(0)
      await Database.sequelize.query('PRAGMA foreign_keys = OFF')
      await Database.libraryItemModel.destroy({ where: { id: item.id } })
      const gone = await sync('user', s.id, { currentTime: 50, timeListened: 5 })
      expect(gone.status).to.equal(500)
      // nothing changed or emitted
      expect(manager.getSession(s.id).timeListening).to.equal(0)
      expect(manager.getSession(s.id).currentTime).to.equal(0)
      expect(api.emitted).to.deep.equal([])
      expect(createSpy.callCount + updateSpy.callCount).to.equal(0)
    })

    it('answers 500 when the library of the item no longer exists', async function () {
      await Database.sequelize.query('PRAGMA foreign_keys = OFF')
      await Database.libraryModel.destroy({ where: { id: lf.library.id } })
      const res = await sync('user', s.id, { currentTime: 50, timeListened: 5 })
      expect(res.status).to.equal(500)
      expect(manager.getSession(s.id).timeListening).to.equal(0)
      expect(api.emitted).to.deep.equal([])
    })

    it('an admin syncing another user\'s open session writes the progress for the admin, not for the session owner', async function () {
      this.ids = new Map()
      const res = await sync('admin', s.id, { currentTime: 40, timeListened: 4 })
      expect(res.status).to.equal(200)
      expect(await progressRow(users.user, book.id)).to.equal(null)
      expect((await progressRow(users.admin, book.id)).currentTime).to.equal(40)
      const ev = events()
      expect(ev[0]).to.deep.include({ userId: users.admin.id, event: 'user_item_progress_updated', sessionId: s.id })
      // the session itself (owned by the user) did accumulate the time
      expect(manager.getSession(s.id).timeListening).to.equal(4)
      await settled()
      expect((await sessionRow(s.id)).userId).to.equal(users.user.id)
    })
  })

  describe('closeSession', () => {
    it('with sync data does a final sync, saves, emits and removes the session', async function () {
      this.ids = new Map()
      const s = (await play('user')).body
      await sync('user', s.id, { currentTime: 100, timeListened: 10 })
      await settled()
      api.emitted.length = 0
      const session = manager.getSession(s.id)
      const res = await close('user', s.id, { currentTime: 400, timeListened: 20 })
      expect(res.status).to.equal(200)
      expect([session.currentTime, session.timeListening]).to.deep.equal([400, 30])
      expect(manager.sessions).to.have.length(0)
      expect(manager.getSession(s.id)).to.equal(undefined)
      await settled()
      const row = await sessionRow(s.id)
      expect([row.currentTime, row.timeListening]).to.deep.equal([400, 30])
      expect((await progressRow(users.user, book.id)).currentTime).to.equal(400)
      const ev = events()
      // order: progress update, admin stream update (still lists the closing session), session closed
      expect(ev.map((e) => e.event)).to.deep.equal(['user_item_progress_updated', 'user_stream_update', 'user_session_closed'])
      expect(ev[1]).to.deep.equal({ method: 'adminEmitter', event: 'user_stream_update', username: 'user', sessionId: s.id })
      expect(ev[2]).to.deep.equal({ method: 'clientEmitter', userId: users.user.id, event: 'user_session_closed', data: s.id })
      snap(this, { ev, finalRow: { currentTime: row.currentTime, timeListening: row.timeListening } }, 'close with sync data')
    })

    it('without sync data saves what was already listened and does not touch the progress', async function () {
      this.ids = new Map()
      const s = (await play('user')).body
      await sync('user', s.id, { currentTime: 100, timeListened: 10 })
      await settled()
      const session = manager.getSession(s.id)
      session.currentTime = 150
      session.timeListening = 12
      api.emitted.length = 0
      const before = updateSpy.callCount
      expect((await close('user', s.id)).status).to.equal(200)
      expect(updateSpy.callCount).to.equal(before + 1)
      const row = await sessionRow(s.id)
      expect([row.currentTime, row.timeListening]).to.deep.equal([150, 12])
      expect((await progressRow(users.user, book.id)).currentTime).to.equal(100)
      expect(manager.sessions).to.have.length(0)
      expect(events().map((e) => e.event)).to.deep.equal(['user_stream_update', 'user_session_closed'])
    })

    it('a session without any listening time is removed without being saved', async function () {
      this.ids = new Map()
      const s = (await play('user')).body
      api.emitted.length = 0
      expect((await close('user', s.id)).status).to.equal(200)
      expect(createSpy.callCount + updateSpy.callCount).to.equal(0)
      expect(await Database.playbackSessionModel.count()).to.equal(0)
      expect(manager.sessions).to.have.length(0)
      expect(events().map((e) => e.event)).to.deep.equal(['user_stream_update', 'user_session_closed'])
    })

    it('closing with sync data but no listening time still updates the progress without saving the session', async function () {
      const s = (await play('user')).body
      expect((await close('user', s.id, { currentTime: 77, timeListened: 0 })).status).to.equal(200)
      expect((await progressRow(users.user, book.id)).currentTime).to.equal(77)
      expect(createSpy.callCount + updateSpy.callCount).to.equal(0)
    })

    it('a failing final sync (item deleted) does not stop the session being closed', async function () {
      this.ids = new Map()
      const s = (await play('user')).body
      await Database.sequelize.query('PRAGMA foreign_keys = OFF')
      await Database.libraryItemModel.destroy({ where: { id: item.id } })
      api.emitted.length = 0
      expect((await close('user', s.id, { currentTime: 10, timeListened: 5 })).status).to.equal(200)
      expect(manager.sessions).to.have.length(0)
      expect(events().map((e) => e.event)).to.deep.equal(['user_stream_update', 'user_session_closed'])
    })

    it('closes only the requested session', async function () {
      const a = (await play('user', { deviceInfo: { deviceId: 'dev-A' } })).body
      const b = (await play('user', { deviceInfo: { deviceId: 'dev-B' } })).body
      await close('user', a.id)
      expect(manager.sessions.map((x) => x.id)).to.deep.equal([b.id])
      expect((await close('user', a.id)).status, 'already closed').to.equal(404)
    })
  })

  describe('open session lookup through the API', () => {
    it('GET /api/session/:id and /api/sessions/open expose the open sessions of the manager', async function () {
      this.ids = new Map()
      const a = (await play('user', { deviceInfo: { deviceId: 'dev-A' } })).body
      const b = (await playEpisode('admin', episodes[0].id, { deviceInfo: { deviceId: 'dev-B' } })).body
      const one = await api.request('GET', `/api/session/${a.id}`, { as: 'user' })
      const foreign = await api.request('GET', `/api/session/${a.id}`, { as: 'guest' })
      const unknown = await api.request('GET', '/api/session/00000000-0000-4000-8000-0000000000aa', { as: 'user' })
      const list = await api.request('GET', '/api/sessions/open', { as: 'admin' })
      expect([one.status, foreign.status, unknown.status, list.status]).to.deep.equal([200, 403, 404, 200])
      expect(one.body.id).to.equal(a.id)
      expect(list.body.sessions.map((x) => x.id)).to.deep.equal([a.id, b.id])
      snap(this, { one: clientView(one.body), list: list.body.sessions.map(clientView) }, 'open sessions')
      await close('user', a.id)
      const after = await api.request('GET', '/api/sessions/open', { as: 'admin' })
      expect(after.body.sessions.map((x) => x.id)).to.deep.equal([b.id])
    })

    it('DELETE /api/sessions/:id removes an open session from the manager and the database row', async function () {
      const s = (await play('user')).body
      await sync('user', s.id, { currentTime: 10, timeListened: 3 })
      await until(async () => !!(await sessionRow(s.id)), 'session row')
      await settled()
      const res = await api.request('DELETE', `/api/sessions/${s.id}`, { as: 'root' })
      expect(res.status).to.equal(200)
      expect(manager.sessions).to.have.length(0)
      expect(await sessionRow(s.id)).to.equal(null)
    })

    it('POST /api/sessions/batch/delete removes open sessions from the manager', async function () {
      const a = (await play('user', { deviceInfo: { deviceId: 'dev-A' } })).body
      const b = (await play('user', { deviceInfo: { deviceId: 'dev-B' } })).body
      const res = await api.request('POST', '/api/sessions/batch/delete', { as: 'admin', json: { sessions: [a.id] } })
      expect(res.status).to.equal(200)
      expect(manager.sessions.map((x) => x.id)).to.deep.equal([b.id])
    })
  })

  describe('removeSession', () => {
    it('closes the stream of a transcode session, ignores unknown ids and keeps the other sessions', async function () {
      const a = (await play('user', { forceTranscode: true, deviceInfo: { deviceId: 'dev-A' } })).body
      const b = (await play('user', { deviceInfo: { deviceId: 'dev-B' } })).body
      const streamA = manager.getStream(a.id)
      expect(fs.existsSync(streamA.streamPath)).to.equal(true)
      api.emitted.length = 0
      await manager.removeSession('unknown-id')
      expect(manager.sessions).to.have.length(2)
      expect(api.emitted).to.deep.equal([])
      await manager.removeSession(a.id)
      expect(manager.sessions.map((s) => s.id)).to.deep.equal([b.id])
      expect(fs.existsSync(streamA.streamPath)).to.equal(false)
      expect(api.emitted.map((e) => e.args.slice(1))).to.deep.equal([['stream_closed', a.id]])
      expect(manager.getStream(a.id)).to.equal(null)
    })
  })

  describe('closeStaleOpenSessions (36 hour cutoff)', () => {
    it('removes open sessions last updated more than 36 hours ago, keeps a session exactly at the cutoff, and does not save or emit for them', async function () {
      this.ids = new Map()
      const mk = async (deviceId, body = {}) => (await play('user', { deviceInfo: { deviceId }, ...body })).body.id
      const stale = await mk('dev-1', { forceTranscode: true })
      const justStale = await mk('dev-2')
      const atCutoff = await mk('dev-3')
      const justFresh = await mk('dev-4')
      const fresh = await mk('dev-5')
      const NOW = Date.UTC(2025, 5, 1, 12, 0, 0)
      const cutoff = NOW - 36 * HOUR
      const set = (id, updatedAt) => (manager.getSession(id).updatedAt = updatedAt)
      set(stale, NOW - 100 * HOUR)
      set(justStale, cutoff - 1)
      set(atCutoff, cutoff)
      set(justFresh, cutoff + 1)
      set(fresh, NOW)
      // unsaved listening time of a stale session is lost: stale sessions are only removed
      manager.getSession(stale).timeListening = 99
      const streamPath = manager.getStream(stale).streamPath
      api.emitted.length = 0
      const clock = sinon.useFakeTimers({ now: NOW, toFake: ['Date'] })
      try {
        await manager.closeStaleOpenSessions()
      } finally {
        clock.restore()
      }
      expect(manager.sessions.map((s) => s.id)).to.deep.equal([atCutoff, justFresh, fresh])
      expect(fs.existsSync(streamPath)).to.equal(false)
      expect(createSpy.callCount + updateSpy.callCount).to.equal(0)
      expect(await Database.playbackSessionModel.count()).to.equal(0)
      // only the stream of the transcode session announces itself; no user_session_closed / user_stream_update
      expect(api.emitted.map((e) => e.args.slice(1))).to.deep.equal([['stream_closed', stale]])
      snap(this, { remaining: manager.sessions.map((s) => s.id), emitted: events() }, 'stale cleanup')
    })

    it('does nothing when there are no stale sessions or no sessions at all', async function () {
      await manager.closeStaleOpenSessions()
      const s = (await play('user')).body
      await manager.closeStaleOpenSessions()
      expect(manager.sessions.map((x) => x.id)).to.deep.equal([s.id])
    })
  })

  describe('syncLocalSession (offline listening from the apps)', () => {
    // far in the future: a progress row created by a sync is stamped with the server clock, so later syncs must be newer than that
    const NOW = Date.UTC(2100, 2, 5, 12, 0, 0)
    const local = (o = {}) => ({
      id: 'play_local_abc',
      libraryItemId: item.id,
      displayTitle: 'Local Title',
      displayAuthor: 'Local Author',
      duration: 3600,
      playMethod: 3,
      mediaPlayer: 'abs-android',
      startTime: 10,
      currentTime: 500,
      timeListening: 60,
      startedAt: NOW - 600000,
      updatedAt: NOW,
      date: '2100-03-05',
      dayOfWeek: 'Friday',
      mediaMetadata: { title: 'Client Title' },
      ...o
    })
    const postLocal = (as, body) => api.request('POST', '/api/session/local', { as, headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.9' }, json: body })
    const postAll = (as, sessions) => api.request('POST', '/api/session/local-all', { as, headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.9' }, json: { sessions, deviceInfo: { deviceId: 'local-dev', clientVersion: '9.9.9', clientName: 'Abs Android' } } })

    it('inserts a new session, fills missing details from the library item and creates the progress', async function () {
      this.ids = new Map()
      const res = await postLocal('user', local({ displayTitle: '', displayAuthor: null, mediaMetadata: null, libraryId: 'lib_old' }))
      expect(res.status).to.equal(200)
      const rows = await Database.playbackSessionModel.findAll()
      expect(rows).to.have.length(1)
      const row = rows[0]
      // the old style play_local_ id was replaced by a uuid
      expect(row.id).to.match(/^[0-9a-f-]{36}$/)
      expect(row.id).to.not.equal('play_local_abc')
      expect([row.userId, row.libraryId, row.mediaItemId, row.mediaItemType, row.displayTitle, row.displayAuthor, row.duration, row.currentTime, row.startTime, row.timeListening, row.playMethod, row.mediaPlayer, row.date, row.dayOfWeek]).to.deep.equal([users.user.id, lf.library.id, book.id, 'book', 'Played Book', 'Ann Author', 3600, 500, 10, 60, 3, 'abs-android', '2100-03-05', 'Friday'])
      expect(row.extraData.libraryItemId).to.equal(item.id)
      expect(row.createdAt.valueOf()).to.equal(NOW - 600000)
      expect(row.updatedAt.valueOf()).to.equal(NOW)
      expect(row.deviceId).to.be.a('string')
      expect(row.mediaMetadata.title).to.equal('Played Book')
      expect(row.mediaMetadata.authors.map((a) => a.name)).to.deep.equal(['Ann Author'])
      const mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.duration, mp.isFinished]).to.deep.equal([500, 3600, false])
      const ev = events()
      expect(ev).to.have.length(1)
      expect(ev[0]).to.deep.include({ method: 'clientEmitter', userId: users.user.id, event: 'user_item_progress_updated', sessionId: row.id })
      expect(ev[0].progress).to.deep.equal({ id: mp.id, libraryItemId: item.id, episodeId: null, currentTime: 500, duration: 3600, isFinished: false })
      // local sessions never become open sessions
      expect(manager.sessions).to.have.length(0)
      snap(this, { row: row.toJSON(), ev, mp: { currentTime: mp.currentTime, duration: mp.duration } }, 'new local session')
    })

    it('keeps the details the client sent', async function () {
      this.ids = new Map()
      await postLocal('user', local({ mediaMetadata: { title: 'Client Title', subtitle: 'Client Sub' } }))
      const row = (await Database.playbackSessionModel.findAll())[0]
      expect([row.displayTitle, row.displayAuthor, row.mediaMetadata.title, row.mediaMetadata.subtitle]).to.deep.equal(['Local Title', 'Local Author', 'Client Title', 'Client Sub'])
      expect(row.mediaMetadata.authors.map((a) => a.name), 'missing keys are filled from the item').to.deep.equal(['Ann Author'])
    })

    it('syncing the same local session again updates the stored session; the progress follows when it is not newer', async function () {
      this.ids = new Map()
      await postLocal('user', local())
      api.emitted.length = 0
      const res = await postLocal('user', local({ currentTime: 900, timeListening: 130, updatedAt: NOW + 60000 }))
      expect(res.status).to.equal(200)
      const rows = await Database.playbackSessionModel.findAll()
      expect(rows).to.have.length(1)
      expect([rows[0].currentTime, rows[0].timeListening, rows[0].updatedAt.valueOf(), rows[0].date, rows[0].dayOfWeek]).to.deep.equal([900, 130, NOW + 60000, '2100-03-05', 'Friday'])
      const mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.updatedAt.valueOf()]).to.deep.equal([900, NOW + 60000])
      expect(events()).to.have.length(1)
    })

    it('an existing session takes its date and weekday from the new updatedAt', async function () {
      await postLocal('user', local())
      await postLocal('user', local({ updatedAt: Date.UTC(2100, 6, 9, 12, 0, 0) }))
      const row = (await Database.playbackSessionModel.findAll())[0]
      expect([row.date, row.dayOfWeek]).to.deep.equal(['2100-07-09', 'Friday'])
      await postLocal('user', local({ updatedAt: Date.UTC(2100, 6, 12, 12, 0, 0) }))
      expect((await Database.playbackSessionModel.findAll())[0].dayOfWeek).to.equal('Monday')
    })

    it('does not overwrite progress that was updated after the session', async function () {
      this.ids = new Map()
      await createProgress(users.user, { libraryItem: item, mediaItemId: book.id, duration: 3600, currentTime: 2000, updatedAt: new Date(NOW + 1).toISOString() })
      api.emitted.length = 0
      const res = await postLocal('user', local())
      expect(res.status).to.equal(200)
      const mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.updatedAt.valueOf()]).to.deep.equal([2000, NOW + 1])
      expect(events()).to.deep.equal([])
      // the session itself is stored
      expect((await Database.playbackSessionModel.findAll())[0].currentTime).to.equal(500)
    })

    it('overwrites progress that is older than, or exactly as old as, the session', async function () {
      this.ids = new Map()
      await createProgress(users.user, { libraryItem: item, mediaItemId: book.id, duration: 3600, currentTime: 2000, updatedAt: new Date(NOW).toISOString() })
      const res = await postLocal('user', local())
      expect(res.status).to.equal(200)
      let mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.updatedAt.valueOf()]).to.deep.equal([500, NOW])
      await Database.mediaProgressModel.update({ updatedAt: new Date(NOW - 1) }, { where: { id: mp.id }, silent: true })
      await postLocal('user', local({ currentTime: 700 }))
      mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.updatedAt.valueOf()]).to.deep.equal([700, NOW])
      expect(events().map((e) => e.progress.currentTime)).to.deep.equal([500, 700])
    })

    it('a progress created by a local sync is stamped with the server time, so an older session cannot update it afterwards', async function () {
      this.ids = new Map()
      const old = Date.UTC(2024, 2, 5, 12, 0, 0)
      await postLocal('user', local({ updatedAt: old, currentTime: 100 }))
      const mp = await progressRow(users.user, book.id)
      expect(mp.updatedAt.valueOf(), 'created with the server clock, not the session time').to.be.greaterThan(old)
      api.emitted.length = 0
      const res = await postLocal('user', local({ updatedAt: old + 1000, currentTime: 900 }))
      expect(res.status).to.equal(200)
      expect((await progressRow(users.user, book.id)).currentTime).to.equal(100)
      expect((await Database.playbackSessionModel.findAll())[0].currentTime).to.equal(900)
      expect(events()).to.deep.equal([])
    })

    it('marks the item finished from the session position using the library settings', async function () {
      await postLocal('user', local({ currentTime: 100 }))
      await postLocal('user', local({ currentTime: 3595, updatedAt: NOW + 1 }))
      expect((await progressRow(users.user, book.id)).isFinished).to.equal(true)
    })

    it('syncs a podcast episode session, mapping the ids and taking the duration from the episode', async function () {
      this.ids = new Map()
      const res = await postLocal('user', { id: 'play_local_ep', libraryItemId: podItem.id, episodeId: episodes[0].id, displayTitle: '', displayAuthor: '', playMethod: 3, mediaPlayer: 'abs-android', duration: 1, currentTime: 600, timeListening: 40, startedAt: NOW - 1000, updatedAt: NOW })
      expect(res.status).to.equal(200)
      const row = (await Database.playbackSessionModel.findAll())[0]
      expect([row.mediaItemType, row.mediaItemId, row.libraryId, row.displayTitle, row.displayAuthor, row.duration, row.currentTime]).to.deep.equal(['podcastEpisode', episodes[0].id, plf.library.id, 'Played Pod', 'The Host', 1800, 600])
      expect(row.extraData.libraryItemId).to.equal(podItem.id)
      const mp = await progressRow(users.user, episodes[0].id)
      expect([mp.mediaItemType, mp.podcastId, mp.currentTime, mp.duration]).to.deep.equal(['podcastEpisode', podcast.id, 600, 1800])
      expect(events()[0].progress).to.deep.equal({ id: mp.id, libraryItemId: podItem.id, episodeId: episodes[0].id, currentTime: 600, duration: 1800, isFinished: false })
      snap(this, { row: row.toJSON() }, 'local episode session')
    })

    it('reports unknown items, unknown episodes and podcast items without episode as errors', async function () {
      this.ids = new Map()
      const unknown = await postLocal('user', local({ libraryItemId: '00000000-0000-4000-8000-0000000000ff' }))
      const unknownEp = await postLocal('user', { ...local({ libraryItemId: podItem.id }), episodeId: '00000000-0000-4000-8000-0000000000ff' })
      const noEp = await postLocal('user', local({ libraryItemId: podItem.id }))
      expect([unknown.status, unknown.body]).to.deep.equal([500, 'Media item not found'])
      expect([unknownEp.status, unknownEp.body]).to.deep.equal([500, 'Media item not found'])
      expect([noEp.status, noEp.body]).to.deep.equal([500, 'Media item not found'])
      expect(await Database.playbackSessionModel.count()).to.equal(0)
      expect(events()).to.deep.equal([])
    })

    it('reports a missing library as an error', async function () {
      await Database.sequelize.query('PRAGMA foreign_keys = OFF')
      await Database.libraryModel.destroy({ where: { id: lf.library.id } })
      const res = await postLocal('user', local())
      expect([res.status, res.body]).to.deep.equal([500, 'Library not found'])
      expect(await Database.playbackSessionModel.count()).to.equal(0)
    })

    it('local-all syncs several sessions in order and reports a result for each', async function () {
      this.ids = new Map()
      const res = await postAll('user', [local(), local({ id: 'play_local_missing', libraryItemId: '00000000-0000-4000-8000-0000000000ff' }), local({ id: 'play_local_second', currentTime: 800, updatedAt: NOW + 5 }), local()])
      expect(res.status).to.equal(200)
      expect(res.body.results.map((r) => [r.success, r.progressSynced ?? null, r.error ?? null])).to.deep.equal([
        [true, true, null],
        [false, null, 'Media item not found'],
        [true, true, null],
        [true, false, null]
      ])
      expect(res.body.results[1].id).to.equal('play_local_missing')
      // the same play_local_ id maps to the same uuid, the second id to another one
      expect(res.body.results[0].id).to.equal(res.body.results[3].id)
      expect(res.body.results[2].id).to.not.equal(res.body.results[0].id)
      expect(await Database.playbackSessionModel.count()).to.equal(2)
      expect(Object.keys(manager.oldPlaybackSessionMap)).to.deep.equal(['play_local_abc', 'play_local_second'])
      // one device row for the whole upload, with the client's details
      const devices = await Database.deviceModel.findAll()
      expect(devices.map((d) => [d.deviceId, d.clientVersion, d.clientName])).to.deep.equal([['local-dev', '9.9.9', 'Abs Android']])
      // the last sync of play_local_abc was older than the progress written by play_local_second: progress is kept
      const mp = await progressRow(users.user, book.id)
      expect([mp.currentTime, mp.updatedAt.valueOf()]).to.deep.equal([800, NOW + 5])
      expect(res.body.results[3].progressSynced).to.equal(false)
      snap(this, { results: res.body.results, events: events() }, 'local-all')
    })

    it('does not rewrite a stored uuid session id', async function () {
      const id = '11111111-2222-4333-8444-555555555555'
      await postLocal('user', local({ id }))
      await postLocal('user', local({ id, currentTime: 900 }))
      const rows = await Database.playbackSessionModel.findAll()
      expect(rows.map((r) => [r.id, r.currentTime])).to.deep.equal([[id, 900]])
      expect(manager.oldPlaybackSessionMap).to.deep.equal({})
    })
  })

  describe('removeOrphanStreams', () => {
    const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const UUID_B = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb'
    const UUID_V1 = 'cccccccc-cccc-1ccc-8ccc-cccccccccccc'

    it('removes stream directories that have no open session and keeps the others', async function () {
      this.ids = new Map()
      const s = (await play('user', { forceTranscode: true })).body
      for (const name of [UUID_A, UUID_B, UUID_V1, 'not-a-session', 'misc.txt']) {
        const p = path.join(manager.StreamsPath, name)
        fs.mkdirSync(p, { recursive: true })
        fs.writeFileSync(path.join(p, 'x.ts'), 'x')
      }
      await manager.removeOrphanStreams()
      expect(fs.readdirSync(manager.StreamsPath).sort()).to.deep.equal([UUID_V1, 'misc.txt', 'not-a-session', s.id].sort())
      expect(fs.existsSync(manager.getStream(s.id).streamPath)).to.equal(true)
    })

    it('creates the streams directory when missing', async function () {
      expect(fs.existsSync(manager.StreamsPath)).to.equal(false)
      await manager.removeOrphanStreams()
      expect(fs.statSync(manager.StreamsPath).isDirectory()).to.equal(true)
    })

    it('throws when the streams path cannot be created', async function () {
      fs.writeFileSync(manager.StreamsPath, 'a file where the directory should be')
      let error
      try {
        await manager.removeOrphanStreams()
      } catch (e) {
        error = e
      }
      expect(error).to.be.instanceOf(Error)
      expect(error.message).to.equal(`[PlaybackSessionManager] Failed to create streams directory at "${manager.StreamsPath}"`)
      expect(error.cause).to.be.instanceOf(Error)
    })
  })

  describe('getDeviceInfo', () => {
    it('builds the device from the request headers when the client sends no details', async function () {
      this.ids = new Map()
      const req = { headers: { 'user-agent': UA, 'x-forwarded-for': '203.0.113.7' }, user: { id: users.user.id } }
      const device = await manager.getDeviceInfo(req, null)
      expect(device.userId).to.equal(users.user.id)
      expect(device.ipAddress).to.equal('203.0.113.7')
      expect([device.browserName, device.osName, device.clientName, device.deviceName, device.deviceId]).to.deep.equal(['Chrome', 'Linux', 'Abs Web', 'Linux x86_64 Chrome', device.id])
      expect(device.clientVersion).to.equal(require('../../package.json').version)
      expect(await Database.deviceModel.count()).to.equal(1)
      snap(this, device.toJSON(), 'device from headers')
    })
  })
})
