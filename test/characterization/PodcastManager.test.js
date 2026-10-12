const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { rssXml, recordingFake, createPodcastLibrary, createFeedPodcast, fixedId } = require('./helpers/seed-podcast-extra')
const { createProgress } = require('./helpers/seed-users-extra')
const { stubAxiosPost } = require('./helpers/seed-delivery-extra')
const media = require('./helpers/seed-scanner-media')
const Database = require('../../server/Database')
const Watcher = require('../../server/Watcher')
const Logger = require('../../server/Logger')
const LibraryFile = require('../../server/objects/files/LibraryFile')
const ffprobeLib = require('../../server/libs/nodeFfprobe')
const NotificationManager = require('../../server/managers/NotificationManager')
const TaskManager = require('../../server/managers/TaskManager')
const PodcastManager = require('../../server/managers/PodcastManager')

/*
 * The REAL PodcastManager runs: download queue, episode download through the real ffmpeg (tagging) and the plain-download retry,
 * ffprobe, the episode/library item rows and the files on disk, the new-episode check against an RSS feed, the auto download
 * bookkeeping and the OPML import. Only true boundaries are replaced: axios' adapter (RSS feeds, episode audio, cover images are
 * served from memory, nothing leaves the process) and axios.post (the apprise call of the real NotificationManager).
 * Everything the code emits over sockets is recorded by the harness; waits are bounded polls on that state, never fixed sleeps.
 * Times that the tests compare are stamped explicitly (SQL), never relied upon from "now".
 */
describe('PodcastManager (characterization)', function () {
  this.timeout(90000)

  const FEED = 'https://feeds.test/pod.xml'
  const EP_URL = (n) => `https://cdn.test/ep${n}.mp3`
  const D = (iso) => Date.parse(iso)
  const OLD = '2001-01-01 00:00:00.000 +00:00' // sqlite DATE format used by sequelize

  let api, users, lf, pod, manager, cronManager, net, posts, audio, workDir
  let savedGlobals
  let gates = []

  before(function () {
    if (!media.hasFfmpeg()) this.skip()
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abs-podmgr-'))
    media.makeAudio(path.join(workDir, 'tone.mp3'), { seconds: 1 })
    media.makeAudio(path.join(workDir, 'tone.m4a'), { seconds: 1 })
    audio = { mp3: fs.readFileSync(path.join(workDir, 'tone.mp3')), m4a: fs.readFileSync(path.join(workDir, 'tone.m4a')) }
  })
  after(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true })
  })

  /**
   * In-memory network. `routes[url]` is a Buffer/string (200), `{ status }` (axios-style rejection), or a function(req, n) returning
   * one of those or a promise of one. Unknown urls fail with 404. Every request is recorded with its user agent.
   */
  function stubNetwork(routes) {
    const original = axios.defaults.adapter
    const requests = []
    axios.defaults.adapter = async (config) => {
      const headers = config.headers
      const req = { url: config.url, responseType: config.responseType, ua: (headers.get ? headers.get('User-Agent') : headers['User-Agent']) || null }
      requests.push(req)
      let r = routes[config.url]
      if (typeof r === 'function') r = await r(req, requests.length)
      const fail = (status) => {
        const err = new Error(`Request failed with status code ${status}`)
        err.response = { status }
        throw err
      }
      if (r === undefined) fail(404)
      if (r && r.status && r.status >= 400) fail(r.status)
      const body = r && r.body !== undefined ? r.body : r
      const type = (r && r.type) || (typeof body === 'string' ? 'application/rss+xml' : 'audio/mpeg')
      const data = config.responseType === 'stream' ? Readable.from([Buffer.from(body)]) : Buffer.from(body)
      return { data, status: 200, statusText: 'OK', headers: { 'content-type': type, 'content-length': String(Buffer.from(body).length) }, config, request: {} }
    }
    return { requests, routes, restore: () => (axios.defaults.adapter = original) }
  }
  const deferred = () => {
    let resolve
    const promise = new Promise((r) => (resolve = r))
    return { promise, resolve }
  }
  // poll (bounded) until cond() holds; the work being awaited is real ffmpeg/ffprobe/sqlite, so this has to be wall time bounded
  const waitUntil = async (cond, what = 'condition', ms = 45000) => {
    const start = Date.now()
    while (!cond()) {
      if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  const names = () => api.emitted.map((e) => (e.method === 'emitter' ? e.args[0] : `${e.method}:${e.args[0]}`))
  const events = (name) => api.emitted.filter((e) => (e.method === 'emitter' ? e.args[0] : `${e.method}:${e.args[0]}`) === name).map((e) => e.args[1])
  const finishedCount = () => events('episode_download_finished').length
  const waitFinished = (n) => waitUntil(() => finishedCount() >= n, `${n} finished downloads`)
  const dl = (name, body = {}) => api.request('POST', `/api/podcasts/${pod.libraryItem.id}/${name}`, { as: 'admin', json: body })
  const get = (name, as = 'admin', id = pod.libraryItem.id) => api.request('GET', `/api/podcasts/${id}/${name}`, { as })
  const expanded = (id = pod.libraryItem.id) => Database.libraryItemModel.getExpandedById(id)
  const rows = async () => (await Database.podcastEpisodeModel.findAll({ where: { podcastId: pod.podcast.id }, order: [['title', 'ASC']] })).map((e) => e.toJSON())
  const folderFiles = () => fs.readdirSync(pod.itemPath).sort()

  // an episode as the client (or the RSS parser) hands it to the manager
  const rssEp = (o = {}) => ({
    title: o.title ?? 'New Ep',
    subtitle: o.subtitle ?? 'A subtitle',
    description: o.description ?? 'A description',
    pubDate: o.pubDate ?? 'Wed, 15 Jan 2020 10:00:00 GMT',
    publishedAt: o.publishedAt ?? D('2020-01-15T10:00:00Z'),
    season: o.season ?? '2',
    episode: o.episode ?? '5',
    episodeType: o.episodeType ?? 'full',
    guid: o.guid ?? 'guid-new',
    enclosure: { url: o.url ?? EP_URL(9), length: o.length ?? '1234', type: o.type ?? 'audio/mpeg' }
  })
  const feedEp = (n, over = {}) => ({ title: `Feed Ep ${n}`, guid: `feed-guid-${n}`, pubDate: `Wed, ${String(n).padStart(2, '0')} Jan 2020 10:00:00 GMT`, url: EP_URL(n), ...over })
  const serveFeed = (episodes, over = {}) => (net.routes[FEED] = rssXml({ title: 'Feed Podcast', episodes, ...over }))
  const serveAll = (urls, buf = audio.mp3) => urls.forEach((u) => (net.routes[u] = buf))

  // real NotificationManager + notification settings through the real routes; only the apprise call (axios.post) is recorded
  const configureNotifications = async (events) => {
    expect((await api.request('PATCH', '/api/notifications', { as: 'admin', json: { appriseApiUrl: 'http://apprise.example.test/notify' } })).status).to.equal(200)
    Database.notificationSettings.notificationDelay = 1
    for (const [eventName, bodyTemplate] of events) {
      const res = await api.request('POST', '/api/notifications', { as: 'admin', json: { eventName, urls: ['json://hooks.example.test/a'], titleTemplate: eventName, bodyTemplate, enabled: true, type: 'info' } })
      expect(res.status).to.equal(200)
    }
    stubAxiosPost(async (url, payload) => {
      posts.push(payload)
      return { data: { ok: true } }
    })
    api.emitted.splice(0)
  }
  const settleNotifications = () => waitUntil(() => !NotificationManager.sendingNotification && NotificationManager.notificationQueue.length === 0, 'notifications sent')
  const snap = (ctx, value, label) => matchSnapshot(ctx, value, { label, ids: ctx.ids, tmpDirs: [api.tmp] })
  // inode numbers, byte sizes and ffmpeg-dependent values differ per machine
  const scrubAudio = (a) => {
    if (!a) return a
    const { ino, metadata, bitRate, timeBase, duration, format, channelLayout, metaTags, ...rest } = a
    const { tagEncoder, ...tags } = metaTags || {}
    return { ...rest, metaTags: tags, duration: Math.round(duration), metadata: metadata && { ...metadata, ino: undefined, size: undefined, mtimeMs: undefined, ctimeMs: undefined, birthtimeMs: undefined } }
  }

  beforeEach(async function () {
    savedGlobals = { MaxFailedEpisodeChecks: global.MaxFailedEpisodeChecks, PodcastDownloadTimeout: global.PodcastDownloadTimeout, DisableSsrfRequestFilter: global.DisableSsrfRequestFilter }
    global.MaxFailedEpisodeChecks = 3
    global.PodcastDownloadTimeout = 30000
    TaskManager.tasks = []
    manager = new PodcastManager()
    cronManager = recordingFake()
    api = await startApi({ managers: { podcastManager: manager, cronManager } })
    this.ids = new Map()
    users = await api.seed.users()
    net = stubNetwork({})
    lf = await createPodcastLibrary(api.tmp)
    pod = await createFeedPodcast(lf, {
      title: 'Local Pod',
      feedURL: FEED,
      episodes: [
        { title: 'Old 1', filename: 'old1.mp3', ino: 'ino-1' },
        { title: 'Old 2', filename: 'old2.mp3', ino: 'ino-2' },
        { title: 'Old 3', filename: 'old3.mp3', ino: 'ino-3' }
      ]
    })
    // explicit false so user accounts could see it; a known genre/language/itunes id so the tags written by ffmpeg are visible
    await pod.podcast.update({ explicit: false, genres: ['Tech', 'News'], language: 'en', itunesId: '12345', podcastType: 'episodic' })
    // oldest first: the seeded publishedAt values are tiny (1970); give them real, distinct dates (ep ids ascend with the title number)
    for (const [i, e] of pod.episodes.entries()) await Database.podcastEpisodeModel.update({ publishedAt: new Date(D('2019-06-01T00:00:00Z') + i * 86400000), extraData: { guid: `old-guid-${i + 1}` }, enclosureURL: `https://cdn.test/old${i + 1}.mp3` }, { where: { id: e.id } })
    api.emitted.splice(0)
    api.watcherCalls.splice(0)
    posts = []
    NotificationManager.sendingNotification = false
    NotificationManager.notificationQueue = []
  })

  afterEach(async () => {
    // a test that failed before opening its gate must not leave a download hanging
    gates.splice(0).forEach((g) => g.resolve())
    // let a download that is still running finish so it does not touch a deleted database
    await waitUntil(() => !manager.currentDownload, 'idle manager', 20000).catch(() => {})
    net.restore()
    sinon.restore()
    TaskManager.tasks = []
    for (const [k, v] of Object.entries(savedGlobals)) {
      if (v === undefined) delete global[k]
      else global[k] = v
    }
    Watcher.ignoreFilePathsDownloading.clear()
    await api.stop()
  })

  describe('episode download through POST /download-episodes', () => {
    it('downloads, tags, probes and adds an episode', async function () {
      serveAll([EP_URL(9)])
      const res = await dl('download-episodes', [rssEp()])
      expect(res.status).to.equal(200)
      await waitFinished(1)

      // the file is at <item folder>/<title>.mp3
      expect(folderFiles()).to.deep.equal(['New Ep.mp3', 'old1.mp3', 'old2.mp3', 'old3.mp3'])
      expect(manager.currentDownload?.episodeTitle ?? null).to.equal(null)
      expect(manager.downloadQueue.map((d) => d.episodeTitle)).to.deep.equal([])

      // episode row mapped from the RSS episode
      const all = await rows()
      expect(all.map((e) => e.title)).to.deep.equal(['New Ep', 'Old 1', 'Old 2', 'Old 3'])
      const added = all[0]
      expect(added).to.include({ title: 'New Ep', subtitle: 'A subtitle', description: 'A description', pubDate: 'Wed, 15 Jan 2020 10:00:00 GMT', season: '2', episode: '5', episodeType: 'full', enclosureURL: EP_URL(9), enclosureSize: 1234, enclosureType: 'audio/mpeg' })
      expect(added.publishedAt.valueOf()).to.equal(D('2020-01-15T10:00:00Z'))
      expect(added.extraData).to.deep.equal({ guid: 'guid-new' })
      expect(added.audioFile.index).to.equal(1)
      expect(added.audioFile.metadata.filename).to.equal('New Ep.mp3')
      expect(added.audioFile.metadata.relPath).to.equal('New Ep.mp3')
      expect(added.audioFile.metadata.path).to.equal(path.join(pod.itemPath, 'New Ep.mp3'))
      expect(Math.round(added.audioFile.duration)).to.equal(1)
      // tags that ffmpeg wrote while copying the stream
      const tags = added.audioFile.metaTags
      expect(tags).to.include({ tagAlbum: 'Local Pod', tagArtist: 'Pod Author', tagTitle: 'New Ep', tagTrack: '5', tagDisc: '2', tagGenre: 'Tech;News', tagPodcastType: 'episodic' })

      // library item: file list, size and episode count updated
      const item = await Database.libraryItemModel.findByPk(pod.libraryItem.id)
      const added_lf = item.libraryFiles.find((f) => f.metadata.filename === 'New Ep.mp3')
      expect(item.libraryFiles).to.have.length(4)
      expect(added_lf.metadata.relPath).to.equal('New Ep.mp3')
      expect(item.size).to.equal(item.libraryFiles.reduce((s, f) => s + f.metadata.size, 0))
      expect(item.size).to.equal(folderFiles().reduce((s, f) => s + fs.statSync(path.join(pod.itemPath, f)).size, 0))
      expect((await Database.podcastModel.findByPk(pod.podcast.id)).numEpisodes).to.equal(4)

      // events, in order: task, started, item_updated, episode_added, finished, task finished
      expect(names()).to.deep.equal(['task_started', 'episode_download_started', 'libraryItemEmitter:item_updated', 'episode_added', 'task_finished', 'episode_download_finished'])
      const [started] = events('episode_download_started')
      const [finished] = events('episode_download_finished')
      expect(started).to.include({ episodeDisplayTitle: 'New Ep', url: EP_URL(9), libraryItemId: pod.libraryItem.id, libraryId: lf.library.id, isFinished: false, failed: false, appendRandomId: false, podcastTitle: 'Local Pod', podcastExplicit: false, season: '2', episode: '5', episodeType: 'full', guid: 'guid-new' })
      expect(finished).to.include({ isFinished: true, failed: false })
      expect(finished.finishedAt).to.be.a('number')
      const [task] = events('task_started')
      expect(task).to.include({ action: 'download-podcast-episode', title: 'Downloading episode', isFinished: false, isFailed: false, showSuccess: false })
      expect(task.data).to.deep.equal({ libraryId: lf.library.id, libraryItemId: pod.libraryItem.id })
      expect(task.description).to.equal('Downloading episode "New Ep".')
      expect(events('task_finished')[0]).to.include({ isFinished: true, isFailed: false, id: task.id })
      expect(TaskManager.tasks).to.deep.equal([])
      const [addedEvent] = events('episode_added')
      expect(addedEvent).to.include({ title: 'New Ep', libraryItemId: pod.libraryItem.id })
      expect(addedEvent.libraryItem.id).to.equal(pod.libraryItem.id)

      // the watcher is told to ignore the folder while downloading, then released
      expect(api.watcherCalls.map((c) => [c.method, c.args[0]])).to.deep.equal([
        ['addIgnoreDir', pod.itemPath],
        ['removeIgnoreDir', pod.itemPath]
      ])
      expect(Watcher.ignoreFilePathsDownloading.size).to.equal(0)
      // one request, with the first user agent
      expect(net.requests).to.deep.equal([{ url: EP_URL(9), responseType: 'stream', ua: 'audiobookshelf (+https://audiobookshelf.org; like iTMS)' }])
      snap(this, { emitted: names(), episode: { ...added, id: undefined, podcastId: undefined, audioFile: scrubAudio(added.audioFile) }, files: folderFiles() }, 'downloaded episode')
    })
  })

  describe('target file name and location', () => {
    it('takes the extension from the url (query string ignored, lower case) and falls back to mp3', async function () {
      net.routes['https://cdn.test/upper.MP3?token=a&b=c'] = audio.mp3
      net.routes['https://cdn.test/audio.m4a?sig=1'] = audio.m4a
      net.routes['https://cdn.test/up.M4A'] = audio.m4a
      net.routes['https://cdn.test/page.php?id=1'] = audio.mp3
      net.routes['https://cdn.test/download?id=2'] = audio.mp3
      net.routes['https://cdn.test/my%20file.mp3'] = audio.mp3
      const urls = ['https://cdn.test/upper.MP3?token=a&b=c', 'https://cdn.test/audio.m4a?sig=1', 'https://cdn.test/page.php?id=1', 'https://cdn.test/download?id=2', 'https://cdn.test/my file.mp3', 'https://cdn.test/up.M4A']
      const titles = ['Upper', 'M4a', 'Php', 'None', 'Space', 'Caps']
      await dl(
        'download-episodes',
        urls.map((url, i) => rssEp({ title: titles[i], url, guid: `g${i}` }))
      )
      await waitFinished(6)
      expect(folderFiles().filter((f) => !f.startsWith('old'))).to.deep.equal(['Caps.m4a', 'M4a.m4a', 'None.mp3', 'Php.mp3', 'Space.mp3', 'Upper.mp3'])
      // downloads run strictly one after the other, in the order given
      expect(events('episode_download_finished').map((e) => [e.episodeDisplayTitle, e.failed])).to.deep.equal(titles.map((t) => [t, false]))
      // a url that is not encoded yet is encoded for the request, the query string is kept as it is
      expect(net.requests.map((r) => r.url)).to.deep.equal(['https://cdn.test/upper.MP3?token=a&b=c', 'https://cdn.test/audio.m4a?sig=1', 'https://cdn.test/page.php?id=1', 'https://cdn.test/download?id=2', 'https://cdn.test/my%20file.mp3', 'https://cdn.test/up.M4A'])
      // the episode keeps the url from the feed
      const byTitle = Object.fromEntries((await rows()).map((e) => [e.title, e]))
      expect(byTitle.Space.enclosureURL).to.equal('https://cdn.test/my file.mp3')
      expect(byTitle.M4a.audioFile.codec).to.equal('aac')
      expect(byTitle.M4a.audioFile.metadata.ext).to.equal('.m4a')
    })

    it('reports defaults and the podcast flags to clients', async () => {
      await pod.podcast.update({ explicit: true })
      serveAll([EP_URL(9)])
      const { season, episode, episodeType, ...bare } = rssEp()
      await dl('download-episodes', [bare])
      await waitFinished(1)
      const [started] = events('episode_download_started')
      expect(started).to.include({ podcastExplicit: true, season: null, episode: null, episodeType: 'full' })
      // ffmpeg marks the file as a podcast
      const probed = JSON.parse(require('child_process').execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path.join(pod.itemPath, 'New Ep.mp3')], { encoding: 'utf8' }))
      expect(probed.format.tags).to.include({ podcast: '1' })
    })

    it('does not encode an already encoded url again', async function () {
      net.routes['https://cdn.test/a%20b.mp3'] = audio.mp3
      await dl('download-episodes', [rssEp({ title: 'Encoded', url: 'https://cdn.test/a%20b.mp3' })])
      await waitFinished(1)
      expect(net.requests.map((r) => r.url)).to.deep.equal(['https://cdn.test/a%20b.mp3'])
      expect(events('episode_download_started')[0].url).to.equal('https://cdn.test/a%20b.mp3')
    })

    it('sanitises the title for the file name', async function () {
      serveAll([EP_URL(1), EP_URL(2), EP_URL(3), EP_URL(4)])
      const titles = ['Ep: One/Two? "Q"', '   Padded   ', 'Trailing dots...', 'A  <b>  |  c']
      await dl(
        'download-episodes',
        titles.map((title, i) => rssEp({ title, url: EP_URL(i + 1), guid: `g${i}` }))
      )
      await waitFinished(4)
      const files = folderFiles().filter((f) => !f.startsWith('old'))
      snap(this, files, 'sanitised file names')
      expect(files).to.have.length(4)
      // the title in the database is untouched
      expect((await rows()).map((e) => e.title).filter((t) => !t.startsWith('Old'))).to.have.members(titles)
    })

    it('appends the download id when a file with that name exists already, and leaves the existing file alone', async function () {
      fs.writeFileSync(path.join(pod.itemPath, 'New Ep.mp3'), 'precious')
      serveAll([EP_URL(9)])
      await dl('download-episodes', [rssEp()])
      await waitFinished(1)
      const [finished] = events('episode_download_finished')
      expect(finished.appendRandomId).to.equal(true)
      expect(finished.failed).to.equal(false)
      expect(folderFiles()).to.deep.equal(['New Ep (' + finished.id + ').mp3', 'New Ep.mp3', 'old1.mp3', 'old2.mp3', 'old3.mp3'])
      expect(fs.readFileSync(path.join(pod.itemPath, 'New Ep.mp3'), 'utf8')).to.equal('precious')
      const added = (await rows()).find((e) => e.title === 'New Ep')
      expect(added.audioFile.metadata.filename).to.equal(`New Ep (${finished.id}).mp3`)
      expect(added.audioFile.metadata.relPath).to.equal(`New Ep (${finished.id}).mp3`)
      // the ignore list entry for the file is gone afterwards
      expect(Watcher.ignoreFilePathsDownloading.size).to.equal(0)
    })

    it('creates the podcast folder again when it was removed', async function () {
      fs.rmSync(pod.itemPath, { recursive: true, force: true })
      serveAll([EP_URL(9)])
      await dl('download-episodes', [rssEp()])
      await waitFinished(1)
      expect(events('episode_download_finished')[0].failed).to.equal(false)
      expect(folderFiles()).to.deep.equal(['New Ep.mp3'])
      const warned = Logger.warn.getCalls().map((c) => c.args[0])
      expect(warned).to.include(`[PodcastManager] Podcast episode download: Podcast folder no longer exists at "${pod.itemPath}" - Creating it`)
    })

    it('does not trim old episodes or notify for a manual download, even with maxEpisodesToKeep set', async function () {
      await pod.podcast.update({ maxEpisodesToKeep: 1 })
      await configureNotifications([['onPodcastEpisodeDownloaded', '{{episodeTitle}}']])
      serveAll([EP_URL(9)])
      await dl('download-episodes', [rssEp()])
      await waitFinished(1)
      expect((await rows()).map((e) => e.title)).to.deep.equal(['New Ep', 'Old 1', 'Old 2', 'Old 3'])
      expect(folderFiles()).to.have.length(4)
      await settleNotifications()
      expect(posts).to.deep.equal([])
    })
  })

  describe('download queue', () => {
    // First stays "in progress" until the gate opens, so everything after it has to wait in the queue
    const gateFirst = () => {
      const gate = deferred()
      gates.push(gate)
      net.routes[EP_URL(1)] = async () => {
        await gate.promise
        return audio.mp3
      }
      serveAll([EP_URL(2), EP_URL(3), EP_URL(4)])
      return gate
    }
    const four = [rssEp({ title: 'First', url: EP_URL(1), guid: 'g1' }), rssEp({ title: 'Second', url: EP_URL(2), guid: 'g2' }), rssEp({ title: 'Third', url: EP_URL(3), guid: 'g3' })]

    it('runs one download at a time, queues the rest in order and drops duplicates', async function () {
      const gate = gateFirst()
      const dupes = [...four, rssEp({ title: 'Second dup', url: EP_URL(2), guid: 'g2b' }), rssEp({ title: 'First dup', url: EP_URL(1), guid: 'g1b' })]
      expect((await dl('download-episodes', dupes)).status).to.equal(200)

      expect(manager.currentDownload.episodeTitle).to.equal('First')
      expect(manager.downloadQueue.map((d) => d.episodeTitle)).to.deep.equal(['Second', 'Third'])
      // only one task and one started event: the others are only queued
      expect(names()).to.deep.equal(['task_started', 'episode_download_started', 'episode_download_queued', 'episode_download_queued'])
      expect(events('episode_download_queued').map((e) => [e.episodeDisplayTitle, e.url, e.isFinished, e.failed, e.libraryItemId])).to.deep.equal([
        ['Second', EP_URL(2), false, false, pod.libraryItem.id],
        ['Third', EP_URL(3), false, false, pod.libraryItem.id]
      ])
      const warned = Logger.warn.getCalls().map((c) => c.args[0])
      // the queue message names the current download (as written), the in-progress message names the new episode
      expect(warned).to.include('[PodcastManager] Episode already in queue: "First"')
      expect(warned).to.include('[PodcastManager] Episode download already in progress for "First dup"')
      // nothing but the first request has been made while the first download is running
      await waitUntil(() => net.requests.length >= 1, 'the first request')
      expect(net.requests.map((r) => r.url)).to.deep.equal([EP_URL(1)])
      // while a download runs the watcher ignores the folder and the target file (released again afterwards)
      expect(api.watcherCalls.map((c) => [c.method, c.args[0]])).to.deep.equal([['addIgnoreDir', pod.itemPath]])
      expect([...Watcher.ignoreFilePathsDownloading]).to.deep.equal([path.join(pod.itemPath, 'First.mp3')])

      // GET /downloads shows the queue (not the running download)
      const listed = await get('downloads')
      expect(listed.body.downloads.map((d) => d.episodeDisplayTitle)).to.deep.equal(['Second', 'Third'])
      snap(this, listed.body.downloads.map((d) => ({ ...d, id: undefined })), 'downloads route')

      gate.resolve()
      await waitFinished(3)
      expect(events('episode_download_finished').map((e) => [e.episodeDisplayTitle, e.failed])).to.deep.equal([
        ['First', false],
        ['Second', false],
        ['Third', false]
      ])
      expect(net.requests.map((r) => r.url)).to.deep.equal([EP_URL(1), EP_URL(2), EP_URL(3)])
      expect(manager.downloadQueue.map((d) => d.episodeTitle)).to.deep.equal([])
      expect(manager.currentDownload?.episodeTitle ?? null).to.equal(null)
      // each download got its own task; the watcher ignore is added and released per download
      expect(events('task_started')).to.have.length(3)
      expect(events('task_finished')).to.have.length(3)
      expect(api.watcherCalls.map((c) => c.method)).to.deep.equal(['addIgnoreDir', 'removeIgnoreDir', 'addIgnoreDir', 'removeIgnoreDir', 'addIgnoreDir', 'removeIgnoreDir'])
      expect(folderFiles().filter((f) => !f.startsWith('old'))).to.deep.equal(['First.mp3', 'Second.mp3', 'Third.mp3'])
    })

    it('allows the same url for another library item, and a different url for the same item', async function () {
      const gate = gateFirst()
      const other = await createFeedPodcast(lf, { title: 'Other Pod', feedURL: 'https://feeds.test/other.xml', episodes: [] })
      await dl('download-episodes', [four[0]])
      await dl('download-episodes', [four[1]])
      await api.request('POST', `/api/podcasts/${other.libraryItem.id}/download-episodes`, { as: 'admin', json: [four[0], four[1]] })
      expect(manager.currentDownload.libraryItemId).to.equal(pod.libraryItem.id)
      expect(manager.downloadQueue.map((d) => [d.libraryItemId === pod.libraryItem.id ? 'pod' : 'other', d.episodeTitle])).to.deep.equal([
        ['pod', 'Second'],
        ['other', 'First'],
        ['other', 'Second']
      ])
      // the other item's own listing
      const listed = await get('downloads', 'admin', other.libraryItem.id)
      expect(listed.body.downloads.map((d) => d.episodeDisplayTitle)).to.deep.equal(['First', 'Second'])

      // queue details: unfiltered and per library
      const all = manager.getDownloadQueueDetails()
      expect(all.currentDownload.episodeDisplayTitle).to.equal('First')
      expect(all.queue.map((q) => q.episodeDisplayTitle)).to.deep.equal(['Second', 'First', 'Second'])
      const ofLibrary = manager.getDownloadQueueDetails(lf.library.id)
      expect(ofLibrary.currentDownload.episodeDisplayTitle).to.equal('First')
      expect(ofLibrary.queue).to.have.length(3)
      const ofOther = manager.getDownloadQueueDetails('another-library')
      expect(ofOther.currentDownload).to.equal(undefined)
      expect(ofOther.queue).to.deep.equal([])

      gate.resolve()
      await waitFinished(4)
      // one download after the other: pod First, pod Second, other First, other Second
      expect(events('episode_download_finished').map((e) => [e.libraryItemId === pod.libraryItem.id ? 'pod' : 'other', e.episodeDisplayTitle, e.failed])).to.deep.equal([
        ['pod', 'First', false],
        ['pod', 'Second', false],
        ['other', 'First', false],
        ['other', 'Second', false]
      ])
      expect(fs.readdirSync(other.itemPath).sort()).to.deep.equal(['First.mp3', 'Second.mp3'])
    })

    it('clears the queue of one library item (admin only) and keeps the running download and other items', async function () {
      const gate = gateFirst()
      const other = await createFeedPodcast(lf, { title: 'Other Pod', feedURL: 'https://feeds.test/other.xml', episodes: [] })
      await dl('download-episodes', four)
      await api.request('POST', `/api/podcasts/${other.libraryItem.id}/download-episodes`, { as: 'admin', json: [four[2]] })
      expect(manager.downloadQueue).to.have.length(3)
      api.emitted.splice(0)

      expect((await get('clear-queue', 'user')).status).to.equal(403)
      expect(manager.downloadQueue).to.have.length(3)
      expect((await get('clear-queue')).status).to.equal(200)
      expect(manager.downloadQueue.map((d) => d.libraryItemId)).to.deep.equal([other.libraryItem.id])
      expect(api.emitted.map((e) => [e.method, e.args])).to.deep.equal([['emitter', ['episode_download_queue_cleared', pod.libraryItem.id]]])
      expect(manager.currentDownload.episodeTitle).to.equal('First')

      gate.resolve()
      await waitFinished(2)
      expect(events('episode_download_finished').map((e) => e.episodeDisplayTitle)).to.deep.equal(['First', 'Third'])
      expect(folderFiles().filter((f) => !f.startsWith('old'))).to.deep.equal(['First.mp3'])
      expect(fs.readdirSync(other.itemPath)).to.deep.equal(['Third.mp3'])
    })

    it('clearing with nothing queued does nothing, clearing everything emits nothing', async function () {
      expect(manager.clearDownloadQueue(pod.libraryItem.id)).to.equal(undefined)
      expect(manager.clearDownloadQueue()).to.equal(undefined)
      expect(api.emitted).to.deep.equal([])

      const gate = gateFirst()
      await dl('download-episodes', four)
      expect(manager.downloadQueue).to.have.length(2)
      api.emitted.splice(0)
      manager.clearDownloadQueue()
      expect(manager.downloadQueue.map((d) => d.episodeTitle)).to.deep.equal([])
      expect(api.emitted).to.deep.equal([])
      expect(manager.currentDownload.episodeTitle).to.equal('First')
      gate.resolve()
      await waitFinished(1)
      expect(manager.currentDownload?.episodeTitle ?? null).to.equal(null)
    })

    it('getEpisodeDownloadsInQueue filters by library item', async function () {
      const gate = gateFirst()
      const other = await createFeedPodcast(lf, { title: 'Other Pod', episodes: [] })
      await dl('download-episodes', four)
      await api.request('POST', `/api/podcasts/${other.libraryItem.id}/download-episodes`, { as: 'admin', json: [four[2]] })
      expect(manager.getEpisodeDownloadsInQueue(pod.libraryItem.id).map((d) => d.episodeTitle)).to.deep.equal(['Second', 'Third'])
      expect(manager.getEpisodeDownloadsInQueue(other.libraryItem.id).map((d) => d.episodeTitle)).to.deep.equal(['Third'])
      expect(manager.getEpisodeDownloadsInQueue('nope')).to.deep.equal([])
      gate.resolve()
      await waitFinished(4)
    })
  })

  describe('failed downloads', () => {
    const lastTask = () => events('task_finished').pop()

    it('fails without a retry when the request itself fails, cleans up, and carries on with the queue', async function () {
      serveAll([EP_URL(2)])
      await dl('download-episodes', [rssEp({ title: 'Broken', url: EP_URL(1), guid: 'b' }), rssEp({ title: 'Fine', url: EP_URL(2), guid: 'f' })])
      await waitFinished(2)
      const [bad, good] = events('episode_download_finished')
      expect(bad).to.include({ episodeDisplayTitle: 'Broken', isFinished: true, failed: true })
      expect(bad.finishedAt).to.be.a('number')
      expect(good).to.include({ episodeDisplayTitle: 'Fine', isFinished: true, failed: false })
      // both user agents were tried for the failing url, and there was no plain-download retry (that would be a third request)
      expect(net.requests.map((r) => [r.url, r.ua])).to.deep.equal([
        [EP_URL(1), 'audiobookshelf (+https://audiobookshelf.org; like iTMS)'],
        [EP_URL(1), 'audiobookshelf (+https://audiobookshelf.org)'],
        [EP_URL(2), 'audiobookshelf (+https://audiobookshelf.org; like iTMS)']
      ])
      expect(folderFiles()).to.deep.equal(['Fine.mp3', 'old1.mp3', 'old2.mp3', 'old3.mp3'])
      expect((await rows()).map((e) => e.title)).to.deep.equal(['Fine', 'Old 1', 'Old 2', 'Old 3'])
      // events of the failed one: task started, started, task failed, finished (no item_updated / episode_added)
      expect(names()).to.deep.equal([
        'task_started',
        'episode_download_started',
        'episode_download_queued',
        'task_finished',
        'episode_download_finished',
        'task_started',
        'episode_download_started',
        'libraryItemEmitter:item_updated',
        'episode_added',
        'task_finished',
        'episode_download_finished'
      ])
      const [failedTask, okTask] = events('task_finished')
      expect(failedTask).to.include({ isFailed: true, isFinished: true, error: 'Failed', errorKey: 'MessageTaskFailed' })
      expect(okTask).to.include({ isFailed: false, isFinished: true, error: null })
      expect(TaskManager.tasks).to.deep.equal([])
      // the watcher ignore is released for both
      expect(api.watcherCalls.map((c) => c.method)).to.deep.equal(['addIgnoreDir', 'removeIgnoreDir', 'addIgnoreDir', 'removeIgnoreDir'])
      expect(Watcher.ignoreFilePathsDownloading.size).to.equal(0)
      expect((await Database.libraryItemModel.findByPk(pod.libraryItem.id)).libraryFiles).to.have.length(4)
    })

    it('tries the second user agent when the first is refused', async function () {
      net.routes[EP_URL(9)] = (req) => (req.ua.includes('like iTMS') ? { status: 403 } : audio.mp3)
      await dl('download-episodes', [rssEp()])
      await waitFinished(1)
      expect(events('episode_download_finished')[0].failed).to.equal(false)
      expect(net.requests.map((r) => r.ua)).to.deep.equal(['audiobookshelf (+https://audiobookshelf.org; like iTMS)', 'audiobookshelf (+https://audiobookshelf.org)'])
      expect(folderFiles()).to.include('New Ep.mp3')
      // tagged by ffmpeg like any other download
      expect((await rows())[0].audioFile.metaTags.tagTitle).to.equal('New Ep')
    })

    it('retries without tagging when ffmpeg rejects the data, then fails and removes the file when it cannot be probed', async function () {
      net.routes[EP_URL(9)] = Buffer.from('this is not audio at all')
      await dl('download-episodes', [rssEp()])
      await waitFinished(1)
      expect(events('episode_download_finished')[0].failed).to.equal(true)
      // request 1: ffmpeg download (iTMS agent), request 2: plain retry (plain agent)
      expect(net.requests.map((r) => [r.responseType, r.ua])).to.deep.equal([
        ['stream', 'audiobookshelf (+https://audiobookshelf.org; like iTMS)'],
        ['stream', 'audiobookshelf (+https://audiobookshelf.org)']
      ])
      expect(folderFiles()).to.deep.equal(['old1.mp3', 'old2.mp3', 'old3.mp3'])
      expect((await rows()).map((e) => e.title)).to.deep.equal(['Old 1', 'Old 2', 'Old 3'])
      expect(lastTask()).to.include({ isFailed: true })
      expect(names()).to.not.include('episode_added')
      expect((await Database.podcastModel.findByPk(pod.podcast.id)).numEpisodes).to.equal(3)
    })

    it('succeeds on the retry without tagging when only the tagged download failed', async function () {
      net.routes[EP_URL(9)] = (req, n) => (n === 1 ? Buffer.from('garbage first') : audio.mp3)
      await dl('download-episodes', [rssEp()])
      await waitFinished(1)
      expect(events('episode_download_finished')[0]).to.include({ failed: false, isFinished: true })
      expect(net.requests).to.have.length(2)
      expect(folderFiles()).to.include('New Ep.mp3')
      const added = (await rows()).find((e) => e.title === 'New Ep')
      // the row has the RSS data, but the file carries none of the tags ffmpeg would have written
      expect(added.season).to.equal('2')
      expect(added.audioFile.metaTags.tagTitle).to.not.exist
      expect(added.audioFile.metaTags.tagAlbum).to.not.exist
      expect(names()).to.include('episode_added')
      expect(lastTask()).to.include({ isFailed: false })
    })

    it('removes the tagged file when it cannot be probed, even if the retry cannot connect', async () => {
      // ffmpeg downloads fine but ffprobe cannot be run (real prober, its binary path points nowhere); the retry cannot connect
      const savedProbePath = ffprobeLib.FFPROBE_PATH
      const savedEnv = process.env.FFPROBE_PATH
      process.env.FFPROBE_PATH = path.join(workDir, 'no-such-ffprobe')
      net.routes[EP_URL(9)] = (req, n) => (n === 1 ? audio.mp3 : { status: 500 })
      try {
        await dl('download-episodes', [rssEp()])
        await waitFinished(1)
      } finally {
        if (savedEnv === undefined) delete process.env.FFPROBE_PATH
        else process.env.FFPROBE_PATH = savedEnv
        ffprobeLib.FFPROBE_PATH = savedProbePath
      }
      expect(events('episode_download_finished')[0].failed).to.equal(true)
      expect(net.requests.length).to.be.greaterThan(1)
      expect(folderFiles()).to.deep.equal(['old1.mp3', 'old2.mp3', 'old3.mp3'])
      expect(Logger.error.getCalls().map((c) => c.args[0])).to.include('[PodcastManager] Failed to scan and add podcast episode audio file - removing file')
    })

    it('fails and removes the file when the library item was deleted during the download', async function () {
      const gate = deferred()
      gates.push(gate)
      net.routes[EP_URL(9)] = async (req, n) => {
        if (n === 1) await gate.promise
        return audio.mp3
      }
      await dl('download-episodes', [rssEp()])
      await waitUntil(() => net.requests.length === 1, 'the request')
      await Database.sequelize.query('DELETE FROM libraryItems WHERE id = ?', { replacements: [pod.libraryItem.id] })
      gate.resolve()
      await waitFinished(1)
      expect(events('episode_download_finished')[0].failed).to.equal(true)
      // the tagged attempt probed fine but found no item, then the retry found none either: two requests, file removed both times
      expect(net.requests).to.have.length(2)
      expect(folderFiles()).to.deep.equal(['old1.mp3', 'old2.mp3', 'old3.mp3'])
      expect(await Database.podcastEpisodeModel.count({ where: { title: 'New Ep' } })).to.equal(0)
      expect(names()).to.not.include('episode_added')
      const errors = Logger.error.getCalls().map((c) => c.args[0])
      expect(errors).to.include(`[PodcastManager] Podcast Episode finished but library item was not found ${pod.libraryItem.id}`)
    })
  })

  describe('probeAudioFile and getRemoveOldestEpisode', () => {
    it('probeAudioFile returns an audio file with index 1, or null for an unreadable file', async () => {
      const good = path.join(pod.itemPath, 'probe.mp3')
      fs.writeFileSync(good, audio.mp3)
      const lib = new LibraryFile()
      await lib.setDataFromPath(good, 'probe.mp3')
      const af = await manager.probeAudioFile(lib)
      expect(af.index).to.equal(1)
      expect(af.codec).to.equal('mp3')
      expect(Math.round(af.duration)).to.equal(1)
      expect(af.metadata.filename).to.equal('probe.mp3')

      const bad = path.join(pod.itemPath, 'bad.mp3')
      fs.writeFileSync(bad, 'not audio')
      const badLib = new LibraryFile()
      await badLib.setDataFromPath(bad, 'bad.mp3')
      expect(await manager.probeAudioFile(badLib)).to.equal(null)
    })

    it('picks the oldest dated episode other than the one just downloaded and deletes its file', async () => {
      const item = await expanded()
      const [o1, o2] = item.media.podcastEpisodes.sort((a, b) => a.title.localeCompare(b.title))
      // Old 1 is the oldest, but it was "just downloaded": the next oldest goes
      const removed = await manager.getRemoveOldestEpisode(item, o1.id)
      expect(removed.id).to.equal(o2.id)
      expect(fs.existsSync(path.join(pod.itemPath, 'old2.mp3'))).to.equal(false)
      expect(fs.existsSync(path.join(pod.itemPath, 'old1.mp3'))).to.equal(true)
      expect(fs.existsSync(path.join(pod.itemPath, 'old3.mp3'))).to.equal(true)
    })

    it('ignores episodes without a publish date and returns null when none is left', async () => {
      const item = await expanded()
      for (const e of item.media.podcastEpisodes) e.publishedAt = null
      expect(await manager.getRemoveOldestEpisode(item, 'x')).to.equal(null)
      expect(folderFiles()).to.have.length(3)
      const [first, second] = item.media.podcastEpisodes
      second.publishedAt = new Date(D('2019-01-01T00:00:00Z'))
      first.publishedAt = new Date(D('2018-01-01T00:00:00Z'))
      expect((await manager.getRemoveOldestEpisode(item, second.id)).id).to.equal(first.id)
    })

    it('returns null and keeps the episode when the file cannot be removed', async () => {
      const item = await expanded()
      const oldest = item.media.podcastEpisodes.find((e) => e.title === 'Old 1')
      oldest.audioFile.metadata.path = 'invalid\0path'
      expect(await manager.getRemoveOldestEpisode(item, 'x')).to.equal(null)
      const warned = Logger.warn.getCalls().map((c) => c.args[0])
      expect(warned).to.include('[PodcastManager] Failed to remove oldest episode "Old 1"')
    })
  })

  describe('checkPodcastForNewEpisodes', () => {
    const day = (n) => new Date(Date.UTC(2020, 0, n, 10)).toUTCString()
    const fe = (n, over = {}) => feedEp(n, { pubDate: day(n), ...over })
    const check = async (after, max, item) => manager.checkPodcastForNewEpisodes(item || (await expanded()), after, max)
    const titles = (eps) => eps.map((e) => e.title)

    it('returns null without a feed url, when the feed cannot be fetched and when it holds no episodes', async () => {
      const item = await expanded()
      item.media.feedURL = null
      expect(await manager.checkPodcastForNewEpisodes(item, 0, 3)).to.equal(null)
      expect(net.requests).to.deep.equal([])
      expect(Logger.error.getCalls().map((c) => c.args[0])).to.include(`[PodcastManager] checkPodcastForNewEpisodes no feed url for Local Pod (ID: ${pod.libraryItem.id})`)

      // 404
      expect(await check(0, 3)).to.equal(null)
      expect(net.requests.map((r) => r.url)).to.deep.equal([FEED])
      // a feed without items is not a valid podcast feed
      net.routes[FEED] = rssXml({ episodes: [] })
      expect(await check(0, 3)).to.equal(null)
      expect(Logger.error.getCalls().map((c) => c.args[0])).to.include(`[PodcastManager] checkPodcastForNewEpisodes invalid feed payload for Local Pod (ID: ${pod.libraryItem.id})`)
    })

    it('only returns episodes published after the given time, keeping feed order', async () => {
      serveFeed([fe(5), fe(3), fe(4), fe(2), fe(1)])
      expect(titles(await check(0, 0))).to.deep.equal(['Feed Ep 5', 'Feed Ep 3', 'Feed Ep 4', 'Feed Ep 2', 'Feed Ep 1'])
      // strictly after: an episode published exactly at the cutoff is not new
      expect(titles(await check(D('2020-01-03T10:00:00Z'), 0))).to.deep.equal(['Feed Ep 5', 'Feed Ep 4'])
      expect(titles(await check(D('2020-01-03T09:59:59Z'), 0))).to.deep.equal(['Feed Ep 5', 'Feed Ep 3', 'Feed Ep 4'])
      expect(await check(D('2020-01-05T10:00:00Z'), 0)).to.deep.equal([])
    })

    it('limits the number of new episodes: default 3, 0 or negative or null for all', async () => {
      serveFeed([fe(5), fe(4), fe(3), fe(2), fe(1)])
      expect(titles(await check(0))).to.deep.equal(['Feed Ep 5', 'Feed Ep 4', 'Feed Ep 3'])
      expect(titles(await check(0, undefined))).to.have.length(3)
      expect(titles(await check(0, 1))).to.deep.equal(['Feed Ep 5'])
      expect(titles(await check(0, 4))).to.have.length(4)
      expect(titles(await check(0, 5))).to.have.length(5)
      expect(titles(await check(0, 6))).to.have.length(5)
      expect(titles(await check(0, 0))).to.have.length(5)
      expect(titles(await check(0, -1))).to.have.length(5)
      expect(titles(await check(0, null))).to.have.length(5)
    })

    it('skips episodes the podcast has already, by guid or by enclosure url', async () => {
      serveFeed([fe(5), fe(4, { guid: 'old-guid-2' }), fe(3, { url: 'https://cdn.test/old1.mp3' }), fe(2, { guid: 'unrelated', url: EP_URL(7) }), fe(1, { guid: 'old-guid-1', url: 'https://cdn.test/other.mp3' })])
      expect(titles(await check(0, 0))).to.deep.equal(['Feed Ep 5', 'Feed Ep 2'])
    })

    it('does not treat a missing guid as a match', async () => {
      // episodes without a guid on either side must not match each other; matching is by guid when both have one, else by url
      await Database.podcastEpisodeModel.update({ extraData: {} }, { where: { podcastId: pod.podcast.id } })
      serveFeed([fe(5, { guid: 'old-guid-1' }), fe(4, { url: 'https://cdn.test/old3.mp3' })])
      expect(titles(await check(0, 0))).to.deep.equal(['Feed Ep 5'])
    })

    it('gives up when the feed does not answer in time (timeout +1s fallback)', async () => {
      const item = await expanded()
      global.PodcastDownloadTimeout = 5000
      net.routes[FEED] = () => new Promise(() => {})
      const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        let result
        const p = manager.checkPodcastForNewEpisodes(item, 0, 3).then((r) => (result = r === null ? 'null' : r))
        await clock.tickAsync(5999)
        expect(result).to.equal(undefined)
        await clock.tickAsync(1)
        await p
        expect(result).to.equal('null')
      } finally {
        clock.restore()
      }
      const errorArgs = Logger.error.getCalls().map((c) => c.args)
      const timeoutCall = errorArgs.find((a) => typeof a[0] === 'string' && a[0].includes('failed to fetch feed'))
      expect(timeoutCall[0]).to.equal(`[PodcastManager] checkPodcastForNewEpisodes failed to fetch feed for Local Pod (ID: ${pod.libraryItem.id}):`)
      expect(timeoutCall[1].message).to.equal('Timeout. getPodcastFeed seemed to timeout but not triggering the timeout.')
    })
  })

  describe('runEpisodeCheck (scheduled auto download)', () => {
    const day = (n) => new Date(Date.UTC(2020, 0, n, 10)).toUTCString()
    const fe = (n, over = {}) => feedEp(n, { pubDate: day(n), ...over })
    const run = async (id = pod.libraryItem.id) => manager.runEpisodeCheck(await expanded(id))
    const podRow = () => Database.podcastModel.findByPk(pod.podcast.id)
    const stamp = (column, value, table = 'podcasts', id = pod.podcast.id) => Database.sequelize.query(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, { replacements: [value, id] })
    const idle = () => waitUntil(() => !manager.currentDownload && manager.downloadQueue.length === 0, 'idle manager')

    beforeEach(async () => {
      await pod.podcast.update({ autoDownloadEpisodes: true, maxNewEpisodesToDownload: 2 })
    })

    it('downloads the newest unknown episodes after the latest episode, up to the maximum, and records the check', async () => {
      const spy = sinon.spy(manager, 'checkPodcastForNewEpisodes')
      // 6 = known by guid, 7 = known by url, 8 = older than the latest local episode (2019-06-03)
      serveFeed([fe(5), fe(4), fe(3), fe(2, { guid: 'old-guid-2' }), fe(1, { url: 'https://cdn.test/old1.mp3' }), fe(9, { pubDate: 'Tue, 01 Jan 2019 10:00:00 GMT', title: 'Ancient' })])
      serveAll([EP_URL(5), EP_URL(4), EP_URL(3)])
      await stamp('lastEpisodeCheck', OLD)
      await stamp('updatedAt', OLD, 'libraryItems', pod.libraryItem.id)
      api.emitted.splice(0)

      expect(await run()).to.equal(true)
      // cutoff = publish date of the latest local episode (not the last check), max = the podcast setting
      expect(spy.callCount).to.equal(1)
      expect(spy.firstCall.args.slice(1)).to.deep.equal([D('2019-06-03T00:00:00Z'), 2])
      expect(await spy.firstCall.returnValue.then((eps) => eps.map((e) => e.title))).to.deep.equal(['Feed Ep 5', 'Feed Ep 4'])

      await waitFinished(2)
      await idle()
      expect(events('episode_download_finished').map((e) => [e.episodeDisplayTitle, e.failed])).to.deep.equal([
        ['Feed Ep 5', false],
        ['Feed Ep 4', false]
      ])
      expect(folderFiles()).to.deep.equal(['Feed Ep 4.mp3', 'Feed Ep 5.mp3', 'old1.mp3', 'old2.mp3', 'old3.mp3'])
      const saved = await podRow()
      // the check time is "now"; compared with an old explicit stamp and a generous window, never with seeded times
      expect(saved.lastEpisodeCheck.valueOf()).to.be.within(Date.now() - 60000, Date.now() + 60000)
      expect(saved.autoDownloadEpisodes).to.equal(true)
      expect(saved.numEpisodes).to.equal(5)
      const item = await Database.libraryItemModel.findByPk(pod.libraryItem.id)
      expect(item.updatedAt.valueOf()).to.be.greaterThan(D('2002-01-01T00:00:00Z'))
      expect(names().filter((n) => n === 'libraryItemEmitter:item_updated').length).to.equal(3) // the check itself and one per added episode
      expect(manager.failedCheckMap).to.deep.equal({})
    })

    it('uses the last check as the cutoff when the podcast has no episodes with a date', async () => {
      const empty = await createFeedPodcast(lf, { title: 'Empty Pod', feedURL: FEED, episodes: [] })
      await empty.podcast.update({ autoDownloadEpisodes: true, maxNewEpisodesToDownload: 10 })
      const spy = sinon.spy(manager, 'checkPodcastForNewEpisodes')
      serveFeed([fe(5), fe(4), fe(3), fe(2), fe(1)])
      serveAll([EP_URL(5), EP_URL(4)])
      await stamp('lastEpisodeCheck', '2020-01-03 12:00:00.000 +00:00', 'podcasts', empty.podcast.id)
      await run(empty.libraryItem.id)
      expect(spy.firstCall.args.slice(1)).to.deep.equal([D('2020-01-03T12:00:00Z'), 10])
      expect((await spy.firstCall.returnValue).map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Feed Ep 4'])
      await waitFinished(2)
      await idle()
      expect(fs.readdirSync(empty.itemPath).sort()).to.deep.equal(['Feed Ep 4.mp3', 'Feed Ep 5.mp3'])

      // never checked and no episodes: everything in the feed is new (cutoff 0)
      const never = await createFeedPodcast(lf, { title: 'Never Pod', feedURL: FEED, episodes: [] })
      await never.podcast.update({ autoDownloadEpisodes: true, maxNewEpisodesToDownload: 10 })
      await stamp('lastEpisodeCheck', null, 'podcasts', never.podcast.id)
      spy.resetHistory()
      await run(never.libraryItem.id)
      expect(spy.firstCall.args[1]).to.equal(0)
      expect((await spy.firstCall.returnValue).map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Feed Ep 4', 'Feed Ep 3', 'Feed Ep 2', 'Feed Ep 1'])
      await waitUntil(() => finishedCount() >= 7, 'downloads')
      await idle()
    })

    it('trims to maxEpisodesToKeep after an auto download: oldest dated episode, its file, progress, playlist entries and library file go', async function () {
      await pod.podcast.update({ maxEpisodesToKeep: 3 })
      const [e1, e2] = pod.episodes
      await createProgress(users.user, { libraryItem: pod.libraryItem, mediaItemId: e1.id, episode: true, podcastId: pod.podcast.id, duration: 30, currentTime: 10, updatedAt: '2024-01-01T00:00:00Z' })
      await createProgress(users.user, { libraryItem: pod.libraryItem, mediaItemId: e2.id, episode: true, podcastId: pod.podcast.id, duration: 30, currentTime: 10, updatedAt: '2024-01-01T00:00:00Z' })
      const playlist = await Database.playlistModel.create({ userId: users.user.id, libraryId: lf.library.id, name: 'Episodes' })
      await Database.playlistMediaItemModel.bulkCreate([
        { playlistId: playlist.id, mediaItemId: e1.id, mediaItemType: 'podcastEpisode', order: 1 },
        { playlistId: playlist.id, mediaItemId: e2.id, mediaItemType: 'podcastEpisode', order: 2 }
      ])
      await configureNotifications([['onPodcastEpisodeDownloaded', '{{episodeTitle}}|{{podcastTitle}}']])
      serveFeed([fe(5)])
      serveAll([EP_URL(5)])
      await run()
      await waitFinished(1)
      await idle()

      expect((await rows()).map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Old 2', 'Old 3'])
      expect(folderFiles()).to.deep.equal(['Feed Ep 5.mp3', 'old2.mp3', 'old3.mp3'])
      const item = await Database.libraryItemModel.findByPk(pod.libraryItem.id)
      expect(item.libraryFiles.map((f) => f.metadata.filename).sort()).to.deep.equal(['Feed Ep 5.mp3', 'old2.mp3', 'old3.mp3'])
      // the size is summed before the oldest episode's library file is removed, so it still includes the removed file
      expect(item.size).to.equal(folderFiles().reduce((s, f) => s + fs.statSync(path.join(pod.itemPath, f)).size, 0) + 'episode old1.mp3'.length)
      expect((await podRow()).numEpisodes).to.equal(3)
      // progress and playlist entries of the removed episode only
      expect((await Database.mediaProgressModel.findAll()).map((p) => p.mediaItemId)).to.deep.equal([e2.id])
      expect((await Database.playlistMediaItemModel.findAll()).map((p) => [p.mediaItemId, p.order])).to.deep.equal([[e2.id, 1]])
      // auto downloads notify
      await waitUntil(() => posts.length >= 1, 'a notification')
      await settleNotifications()
      expect(posts.map((p) => p.body)).to.deep.equal(['Feed Ep 5|Local Pod'])
      expect(events('episode_added')).to.have.length(1)
    })

    it('keeps everything when the count does not exceed maxEpisodesToKeep, when it is 0, or when undated episodes make up the count', async () => {
      serveFeed([fe(5)])
      serveAll([EP_URL(5)])
      // 3 + 1 = 4 episodes, keep 4: nothing to remove
      await pod.podcast.update({ maxEpisodesToKeep: 4 })
      await run()
      await waitFinished(1)
      await idle()
      expect((await rows()).map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Old 1', 'Old 2', 'Old 3'])

      // keep 0 means unlimited
      await pod.podcast.update({ maxEpisodesToKeep: 0 })
      serveFeed([fe(6)])
      serveAll([EP_URL(6)])
      await run()
      await waitFinished(2)
      await idle()
      expect(await Database.podcastEpisodeModel.count({ where: { podcastId: pod.podcast.id } })).to.equal(5)

      // episodes without a publish date do not count towards the maximum and are never removed
      await stamp('publishedAt', null, 'podcastEpisodes', pod.episodes[2].id)
      await stamp('publishedAt', null, 'podcastEpisodes', pod.episodes[1].id)
      await pod.podcast.update({ maxEpisodesToKeep: 3 })
      serveFeed([fe(7)])
      serveAll([EP_URL(7)])
      await run()
      await waitFinished(3)
      await idle()
      // dated before the download: Old 1, Feed Ep 5, Feed Ep 6, then Feed Ep 7 = 4 > 3; the oldest dated one goes (Old 1)
      expect((await rows()).map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Feed Ep 6', 'Feed Ep 7', 'Old 2', 'Old 3'])
      expect(folderFiles()).to.not.include('old1.mp3')
      expect(folderFiles()).to.include.members(['old2.mp3', 'old3.mp3'])
    })

    it('does not trim when only the undated episodes make the total exceed the maximum', async () => {
      await stamp('publishedAt', null, 'podcastEpisodes', pod.episodes[1].id)
      await stamp('publishedAt', null, 'podcastEpisodes', pod.episodes[2].id)
      await pod.podcast.update({ maxEpisodesToKeep: 2 })
      serveFeed([fe(5)])
      serveAll([EP_URL(5)])
      await run()
      await waitFinished(1)
      await idle()
      // dated: Old 1 and the new one = 2, not more than 2
      expect((await rows()).map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Old 1', 'Old 2', 'Old 3'])
      expect(folderFiles()).to.have.length(4)
    })

    it('counts failed checks, notifies each time and disables the auto download at the maximum', async () => {
      await configureNotifications([
        ['onRSSFeedFailed', 'failed {{numFailed}} {{title}} {{feedUrl}}'],
        ['onRSSFeedDisabled', 'disabled {{numFailed}} {{title}} {{feedUrl}}']
      ])
      await stamp('lastEpisodeCheck', OLD)
      expect(await run()).to.equal(true)
      expect(manager.failedCheckMap).to.deep.equal({ [pod.libraryItem.id]: 1 })
      expect(await run()).to.equal(true)
      expect(manager.failedCheckMap).to.deep.equal({ [pod.libraryItem.id]: 2 })
      expect((await podRow()).autoDownloadEpisodes).to.equal(true)
      // the failed check is recorded as a check
      expect((await podRow()).lastEpisodeCheck.valueOf()).to.be.greaterThan(D('2002-01-01T00:00:00Z'))
      expect(await run()).to.equal(false)
      expect(manager.failedCheckMap).to.deep.equal({})
      expect((await podRow()).autoDownloadEpisodes).to.equal(false)
      await waitUntil(() => posts.length >= 3, 'three notifications')
      await settleNotifications()
      expect(posts.map((p) => p.body)).to.deep.equal([`failed 1 Local Pod ${FEED}`, `failed 2 Local Pod ${FEED}`, `disabled 3 Local Pod ${FEED}`])
      expect(manager.downloadQueue.map((d) => d.episodeTitle)).to.deep.equal([])
      expect(manager.currentDownload?.episodeTitle ?? null).to.equal(null)
      expect(net.requests.map((r) => r.url)).to.deep.equal([FEED, FEED, FEED])
    })

    it('resets the failure count after a good check', async () => {
      await run()
      await run()
      expect(manager.failedCheckMap[pod.libraryItem.id]).to.equal(2)
      serveFeed([fe(1, { url: 'https://cdn.test/old1.mp3' })]) // nothing new
      expect(await run()).to.equal(true)
      expect(manager.failedCheckMap).to.deep.equal({})
      delete net.routes[FEED]
      await run()
      await run()
      expect(manager.failedCheckMap[pod.libraryItem.id]).to.equal(2)
      expect((await podRow()).autoDownloadEpisodes).to.equal(true)
      // a good check that finds a new episode resets it too
      serveFeed([fe(5)])
      serveAll([EP_URL(5)])
      expect(await run()).to.equal(true)
      expect(manager.failedCheckMap).to.deep.equal({})
      await waitFinished(1)
    })

    it('never disables when the maximum is 0, and treats a missing feed url as a failed check', async () => {
      manager.MaxFailedEpisodeChecks = 0
      for (let i = 0; i < 5; i++) expect(await run()).to.equal(true)
      expect(manager.failedCheckMap[pod.libraryItem.id]).to.equal(5)
      expect((await podRow()).autoDownloadEpisodes).to.equal(true)

      manager.MaxFailedEpisodeChecks = 2
      await pod.podcast.update({ feedURL: null })
      net.requests.splice(0)
      expect(await run()).to.equal(false)
      expect((await podRow()).autoDownloadEpisodes).to.equal(false)
      expect(net.requests).to.deep.equal([])
    })

    it('does not touch the failure count of other podcasts', async () => {
      const other = await createFeedPodcast(lf, { title: 'Other Pod', feedURL: 'https://feeds.test/other.xml', episodes: [] })
      await other.podcast.update({ autoDownloadEpisodes: true })
      await run(other.libraryItem.id)
      await run()
      await run()
      expect(manager.failedCheckMap).to.deep.equal({ [other.libraryItem.id]: 1, [pod.libraryItem.id]: 2 })
      expect(await run()).to.equal(false)
      expect(manager.failedCheckMap).to.deep.equal({ [other.libraryItem.id]: 1 })
    })

    it('a check without new episodes still records the check and emits the item', async () => {
      serveFeed([fe(1, { url: 'https://cdn.test/old1.mp3' })])
      await stamp('lastEpisodeCheck', OLD)
      await stamp('updatedAt', OLD, 'libraryItems', pod.libraryItem.id)
      api.emitted.splice(0)
      expect(await run()).to.equal(true)
      expect(names()).to.deep.equal(['libraryItemEmitter:item_updated'])
      expect((await podRow()).lastEpisodeCheck.valueOf()).to.be.within(Date.now() - 60000, Date.now() + 60000)
      expect((await Database.libraryItemModel.findByPk(pod.libraryItem.id)).updatedAt.valueOf()).to.be.greaterThan(D('2002-01-01T00:00:00Z'))
      expect(manager.currentDownload?.episodeTitle ?? null).to.equal(null)
    })
  })

  describe('GET /api/podcasts/:id/checknew (manual check and download)', () => {
    const day = (n) => new Date(Date.UTC(2020, 0, n, 10)).toUTCString()
    const fe = (n, over = {}) => feedEp(n, { pubDate: day(n), ...over })
    const checknew = (q = '', as = 'admin', id = pod.libraryItem.id) => api.request('GET', `/api/podcasts/${id}/checknew${q}`, { as })
    const stampCheck = (value) => Database.sequelize.query('UPDATE podcasts SET lastEpisodeCheck = ? WHERE id = ?', { replacements: [value, pod.podcast.id] })
    const idle = () => waitUntil(() => !manager.currentDownload && manager.downloadQueue.length === 0, 'idle manager')

    it('uses the last check time (not the latest episode), skips known episodes, honours limit and records the check', async function () {
      serveFeed([fe(5), fe(4, { guid: 'old-guid-3' }), fe(3), fe(2), fe(1)])
      serveAll([EP_URL(5), EP_URL(3), EP_URL(2), EP_URL(1)])
      await stampCheck('2020-01-01 12:00:00.000 +00:00')
      const res = await checknew('?limit=4')
      expect(res.status).to.equal(200)
      // 1 is before the last check (but after the latest local episode), 4 is known by guid
      expect(res.body.episodes.map((e) => e.title)).to.deep.equal(['Feed Ep 5', 'Feed Ep 3', 'Feed Ep 2'])
      expect(res.body.episodes[0]).to.include({ guid: 'feed-guid-5', season: '', episode: '' })
      expect(res.body.episodes[0].enclosure).to.deep.include({ url: EP_URL(5), type: 'audio/mpeg' })
      snap(this, res.body.episodes.map((e) => ({ ...e, publishedAt: undefined })), 'checknew response')
      await waitFinished(3)
      await idle()
      expect(events('episode_download_finished').map((e) => e.episodeDisplayTitle)).to.deep.equal(['Feed Ep 5', 'Feed Ep 3', 'Feed Ep 2'])
      expect((await Database.podcastModel.findByPk(pod.podcast.id)).lastEpisodeCheck.valueOf()).to.be.within(Date.now() - 60000, Date.now() + 60000)
      expect(names().filter((n) => n === 'libraryItemEmitter:item_updated')).to.have.length(4)
    })

    it('limit: default 3, 0 for all, a number as text, junk falls back to 3', async () => {
      serveFeed([fe(9), fe(8), fe(7), fe(6), fe(5)])
      // nothing is downloadable, so the downloads fail fast; only the answer is of interest here
      const titles = async (q) => {
        await stampCheck('2020-01-01 12:00:00.000 +00:00')
        return (await checknew(q)).body.episodes.map((e) => e.title)
      }
      expect(await titles('')).to.have.length(3)
      expect(await titles('?limit=1')).to.deep.equal(['Feed Ep 9'])
      expect(await titles('?limit=0')).to.have.length(5)
      expect(await titles('?limit=abc')).to.have.length(3)
      expect(await titles('?limit=4')).to.have.length(4)
      expect(await titles('?limit=-1')).to.have.length(5)
    })

    it('treats a podcast that was never checked as all new, and a failing feed as no episodes (still recorded as checked)', async () => {
      serveFeed([fe(2), fe(1)])
      await stampCheck(null)
      expect((await checknew()).body.episodes.map((e) => e.title)).to.deep.equal(['Feed Ep 2', 'Feed Ep 1'])
      await waitFinished(2)
      await idle()

      delete net.routes[FEED]
      await stampCheck(OLD)
      const failed = await checknew()
      expect(failed.status).to.equal(200)
      expect(failed.body).to.deep.equal({ episodes: [] })
      expect((await Database.podcastModel.findByPk(pod.podcast.id)).lastEpisodeCheck.valueOf()).to.be.greaterThan(D('2002-01-01T00:00:00Z'))
    })

    it('is a manual download: no trimming, no notification, no failure counting', async () => {
      await pod.podcast.update({ maxEpisodesToKeep: 1, autoDownloadEpisodes: true })
      await configureNotifications([
        ['onPodcastEpisodeDownloaded', 'downloaded {{episodeTitle}}'],
        ['onRSSFeedFailed', 'failed']
      ])
      serveFeed([fe(5)])
      serveAll([EP_URL(5)])
      await stampCheck('2020-01-01 12:00:00.000 +00:00')
      await checknew()
      await waitFinished(1)
      await idle()
      expect(await Database.podcastEpisodeModel.count({ where: { podcastId: pod.podcast.id } })).to.equal(4)
      delete net.routes[FEED]
      await checknew()
      await checknew()
      expect(manager.failedCheckMap).to.deep.equal({})
      await settleNotifications()
      expect(posts).to.deep.equal([])
    })

    it('checkAndDownloadNewEpisodes touches the library item and the check time when nothing is new, and answers [] when the feed fails', async () => {
      serveFeed([fe(1, { url: 'https://cdn.test/old1.mp3' })])
      await stampCheck(OLD)
      await Database.sequelize.query('UPDATE libraryItems SET updatedAt = ? WHERE id = ?', { replacements: [OLD, pod.libraryItem.id] })
      api.emitted.splice(0)
      expect(await manager.checkAndDownloadNewEpisodes(await expanded(), 3)).to.deep.equal([])
      expect(names()).to.deep.equal(['libraryItemEmitter:item_updated'])
      expect((await Database.libraryItemModel.findByPk(pod.libraryItem.id)).updatedAt.valueOf()).to.be.greaterThan(D('2002-01-01T00:00:00Z'))
      expect((await Database.podcastModel.findByPk(pod.podcast.id)).lastEpisodeCheck.valueOf()).to.be.within(Date.now() - 60000, Date.now() + 60000)
      // a feed that cannot be read is an empty list, not null
      delete net.routes[FEED]
      expect(await manager.checkAndDownloadNewEpisodes(await expanded(), 3)).to.deep.equal([])
      expect(manager.downloadQueue.length).to.equal(0)
    })

    it('answers 400 without a feed url and 403 for non-admins', async () => {
      expect((await checknew('', 'user')).status).to.equal(403)
      await pod.podcast.update({ feedURL: null })
      const res = await checknew()
      expect(res.status).to.equal(400)
      expect(res.body).to.equal('Podcast has no rss feed url')
      expect(net.requests).to.deep.equal([])
    })
  })

  describe('feed helpers', () => {
    it('findEpisode matches the title exactly or within a levenshtein distance of 6, best match first', async () => {
      serveFeed([feedEp(1, { title: 'The Big Story' }), feedEp(2, { title: 'the big story' }), feedEp(3, { title: 'The Big Storm' }), feedEp(4, { title: 'Completely different title here' }), feedEp(5, { title: 'Tiny' })])
      const result = await manager.findEpisode(FEED, 'the big story')
      expect(result.map((m) => [m.episode.title, m.levenshtein])).to.deep.equal([
        ['The Big Story', 0],
        ['the big story', 0],
        ['The Big Storm', 1]
      ])
      // a very short title is not matched by distance alone (length must exceed the distance)
      expect((await manager.findEpisode(FEED, 'tin')).map((m) => [m.episode.title, m.levenshtein])).to.deep.equal([['Tiny', 1]])
      expect(await manager.findEpisode(FEED, 'zzzzzzzzzz zzzzzzzz')).to.deep.equal([])
      // a distance of exactly 6 still matches, 7 does not
      net.routes[FEED] = rssXml({ episodes: [feedEp(1, { title: 'abcdefghijklmnop' })] })
      expect((await manager.findEpisode(FEED, 'abcdefghijxxxxxx')).map((m) => m.levenshtein)).to.deep.equal([6])
      expect(await manager.findEpisode(FEED, 'abcdefghijxxxxxxx')).to.deep.equal([])
      // a title no longer than the distance is never a match
      net.routes[FEED] = rssXml({ episodes: [feedEp(1, { title: 'Tiny' })] })
      expect(await manager.findEpisode(FEED, 'tinyxxxxx')).to.deep.equal([])
      // a title exactly as long as the distance is not matched either (4 substitutions, 4 characters)
      net.routes[FEED] = rssXml({ episodes: [feedEp(1, { title: 'wxyz' })] })
      expect(await manager.findEpisode(FEED, 'abcd')).to.deep.equal([])
      expect((await manager.findEpisode(FEED, 'wxyz')).map((m) => m.levenshtein)).to.deep.equal([0])
      delete net.routes[FEED]
      expect(await manager.findEpisode(FEED, 'the big story')).to.equal(null)
    })

    it('getOPMLFeeds fetches each feed without episodes and skips feeds that fail', async () => {
      const opml = `<?xml version="1.0"?><opml version="1.0"><body><outline text="P"><outline type="rss" text="A" xmlUrl="https://feeds.test/a.xml"/><outline type="rss" text="B" xmlUrl="https://feeds.test/b.xml"/><outline type="rss" text="C" xmlUrl="https://feeds.test/c.xml"/></outline></body></opml>`
      net.routes['https://feeds.test/a.xml'] = rssXml({ title: 'Feed A', episodes: [feedEp(1), feedEp(2)] })
      net.routes['https://feeds.test/c.xml'] = rssXml({ title: 'Feed C', episodes: [feedEp(3)] })
      const res = await manager.getOPMLFeeds(opml)
      expect(res.feeds.map((f) => [f.metadata.title, f.metadata.feedUrl, f.numEpisodes, f.episodes])).to.deep.equal([
        ['Feed A', 'https://feeds.test/a.xml', 2, undefined],
        ['Feed C', 'https://feeds.test/c.xml', 1, undefined]
      ])
      expect(await manager.getOPMLFeeds('<opml><body></body></opml>')).to.deep.equal({ error: 'No RSS feeds found in OPML' })
      expect(manager.getParsedOPMLFileFeeds(opml).map((f) => f.feedUrl)).to.deep.equal(['https://feeds.test/a.xml', 'https://feeds.test/b.xml', 'https://feeds.test/c.xml'])
    })

    it('generateOPMLFileText lists the podcasts that have a feed url', async () => {
      const noFeed = await createFeedPodcast(lf, { title: 'No Feed', episodes: [] })
      const podcasts = await Database.podcastModel.findAll({ where: { id: [pod.podcast.id, noFeed.podcast.id] }, order: [['title', 'ASC']] })
      const text = manager.generateOPMLFileText(podcasts)
      expect(text).to.include(`xmlUrl="${FEED}"`)
      expect(text).to.include('title="Local Pod"')
      expect(text).to.not.include('No Feed')
    })
  })

  describe('createPodcastsFromFeedUrls (OPML import)', () => {
    const PNG = media.PNG_1X1
    const importFeeds = (feeds, extra = {}) => api.request('POST', '/api/podcasts/opml/create', { as: 'admin', json: { feeds, libraryId: lf.library.id, folderId: lf.folder.id, ...extra } })
    const importDone = () => waitUntil(() => events('task_finished').some((t) => t.action === 'opml-import'), 'the import task')
    const items = () => Database.libraryItemModel.findAll({ where: { libraryId: lf.library.id }, order: [['relPath', 'ASC']] })

    it('creates a podcast folder, podcast and library item per feed, with cover, and reports the failures as tasks', async function () {
      net.routes['https://feeds.test/a.xml'] = rssXml({ title: 'Show A: The "Best"', author: 'Author A', episodes: [feedEp(1), feedEp(2)] }).replace('<language>en</language>', '<language>en</language><image><url>https://img.test/a.png</url></image><itunes:image href="https://img.test/a.png"/><itunes:category text="Technology"/>')
      net.routes['https://img.test/a.png'] = { body: PNG, type: 'image/png' }
      net.routes['https://feeds.test/b.xml'] = rssXml({ title: 'Show B', author: 'Author B', episodes: [feedEp(1)] })
      net.routes['https://feeds.test/exists.xml'] = rssXml({ title: 'Local Pod', episodes: [feedEp(1)] })
      net.routes['https://feeds.test/blocked.xml'] = rssXml({ title: 'Blocked', episodes: [feedEp(1)] })
      fs.writeFileSync(path.join(lf.folder.path, 'Blocked'), 'a file where the folder should go')

      const res = await importFeeds(['https://feeds.test/a.xml', 'https://feeds.test/missing.xml', 'https://feeds.test/exists.xml', 'https://feeds.test/blocked.xml', 'https://feeds.test/b.xml'], { autoDownloadEpisodes: true })
      expect(res.status).to.equal(200)
      await importDone()

      // library items: the existing one and the two new ones (titles sanitised for the folder name)
      const all = await items()
      expect(all.map((i) => i.relPath)).to.deep.equal(['Local Pod', 'Show A - The Best', 'Show B'])
      const a = all[1]
      expect(a).to.include({ path: path.join(lf.folder.path, 'Show A - The Best'), mediaType: 'podcast', isFile: false, isMissing: false, isInvalid: false, size: 0, libraryId: lf.library.id, libraryFolderId: lf.folder.id, title: 'Show A: The "Best"' })
      expect(fs.statSync(a.path).isDirectory()).to.equal(true)
      const podA = await Database.podcastModel.findByPk(a.mediaId)
      expect(podA).to.include({ title: 'Show A: The "Best"', author: 'Author A', feedURL: 'https://feeds.test/a.xml', autoDownloadEpisodes: true, numEpisodes: null, maxEpisodesToKeep: 0, maxNewEpisodesToDownload: 3 })
      expect(podA.imageURL).to.equal('https://img.test/a.png')
      expect(podA.genres).to.deep.equal(['Technology'])
      expect(podA.description).to.equal('About Show A: The "Best"')
      // cover saved into the item folder and registered as library file
      expect(fs.readdirSync(a.path)).to.deep.equal(['cover.png'])
      expect(podA.coverPath).to.equal(path.join(a.path, 'cover.png'))
      expect(a.libraryFiles.map((f) => [f.metadata.filename, f.fileType, f.metadata.relPath, f.metadata.ext, f.metadata.path === path.join(a.path, 'cover.png')])).to.deep.equal([['cover.png', 'image', 'cover.png', 'png', true]])
      expect(a.libraryFiles[0].metadata.size).to.equal(PNG.length)
      const podB = await Database.podcastModel.findByPk(all[2].mediaId)
      expect(podB.coverPath).to.equal(null)
      expect(all[2].libraryFiles).to.deep.equal([])

      // the other cases did not create anything
      expect(fs.readdirSync(lf.folder.path).sort()).to.deep.equal(['Blocked', 'Local Pod', 'Show A - The Best', 'Show B'])

      // events: one failed task per problem, item_added for each new podcast, one overall task
      const started = events('task_started')
      expect(started.map((t) => [t.action, t.isFailed, t.error])).to.deep.equal([
        ['opml-import', false, null],
        ['opml-import-feed', true, 'Failed to get podcast feed'],
        ['opml-import-feed', true, 'Podcast already exists at path'],
        ['opml-import-feed', true, 'Failed to create podcast folder']
      ])
      expect(started[0].description).to.equal('Creating podcasts from 5 RSS feeds')
      expect(started[0].showSuccess).to.equal(true)
      expect(started[1].description).to.equal('Importing RSS feed "https://feeds.test/missing.xml"')
      expect(started[2].description).to.equal('Creating podcast "Local Pod"')
      expect(started[3].description).to.equal('Creating podcast "Blocked"')
      expect(names().filter((n) => n === 'libraryItemEmitter:item_added')).to.have.length(2)
      const [done] = events('task_finished')
      expect(done).to.include({ action: 'opml-import', isFinished: true, isFailed: false })
      expect(done.titleKey).to.equal('MessageTaskOpmlImport')
      expect(done.descriptionKey).to.equal('MessageTaskOpmlImportFinished')
      expect(done.descriptionSubs).to.deep.equal([2])
      expect(done.description).to.equal('Added 2 podcasts')
      // the cron is told about every podcast created with auto download
      expect(cronManager.calls.map((c) => [c.method, c.args[0].media.title])).to.deep.equal([
        ['checkUpdatePodcastCron', 'Show A: The "Best"'],
        ['checkUpdatePodcastCron', 'Show B']
      ])
      expect(TaskManager.tasks).to.deep.equal([])
      snap(this, { started: started.map((t) => ({ ...t, id: undefined, data: t.data })), done: { ...done, id: undefined } }, 'tasks')
    })

    it('downloads a cover from a plain http url and strips trailing dots from the folder name', async () => {
      net.routes['https://feeds.test/a.xml'] = rssXml({ title: 'Dotted Show...', episodes: [feedEp(1)] }).replace('<language>en</language>', '<language>en</language><itunes:image href="http://img.test/a.png"/>')
      net.routes['http://img.test/a.png'] = { body: PNG, type: 'image/png' }
      await importFeeds(['https://feeds.test/a.xml'])
      await importDone()
      const a = (await items()).find((i) => i.relPath === 'Dotted Show')
      expect(a).to.exist
      expect(fs.readdirSync(a.path)).to.deep.equal(['cover.png'])
    })

    it('reports a failed task and keeps going when the library item cannot be created', async () => {
      net.routes['https://feeds.test/a.xml'] = rssXml({ title: 'Show A', episodes: [feedEp(1)] })
      sinon.stub(Database.libraryItemModel, 'create').rejects(new Error('database says no'))
      await importFeeds(['https://feeds.test/a.xml'], { autoDownloadEpisodes: true })
      await importDone()
      expect(events('task_started').map((t) => [t.action, t.error])).to.deep.equal([
        ['opml-import', null],
        ['opml-import-feed', 'Failed to create podcast library item']
      ])
      expect(events('task_finished')[0].description).to.equal('Added 0 podcasts')
      expect(names()).to.not.include('libraryItemEmitter:item_added')
      expect(cronManager.calls.map((c) => c.method)).to.deep.equal([])
      // the whole transaction was rolled back: no podcast row for the feed
      expect(await Database.podcastModel.count({ where: { title: 'Show A' } })).to.equal(0)
    })

    it('does not schedule the cron without auto download, and keeps the podcast when the cover fails', async () => {
      net.routes['https://feeds.test/a.xml'] = rssXml({ title: 'Show A', episodes: [feedEp(1)] }).replace('<language>en</language>', '<language>en</language><itunes:image href="https://img.test/gone.png"/>')
      await importFeeds(['https://feeds.test/a.xml'])
      await importDone()
      const [a] = await items().then((all) => all.filter((i) => i.relPath === 'Show A'))
      expect(a).to.exist
      const podA = await Database.podcastModel.findByPk(a.mediaId)
      expect(podA.autoDownloadEpisodes).to.equal(false)
      expect(podA.coverPath).to.equal(null)
      expect(fs.readdirSync(a.path)).to.deep.equal([])
      expect(cronManager.calls.map((c) => c.method)).to.deep.equal([])
      expect(events('task_finished')[0].description).to.equal('Added 1 podcasts')
    })

    it('ignores a cover that is served with a non-image content type', async () => {
      net.routes['https://feeds.test/a.xml'] = rssXml({ title: 'Show A', episodes: [feedEp(1)] }).replace('<language>en</language>', '<language>en</language><itunes:image href="https://img.test/page.html"/>')
      net.routes['https://img.test/page.html'] = { body: PNG, type: 'text/html' }
      await importFeeds(['https://feeds.test/a.xml'])
      await importDone()
      const a = (await items()).find((i) => i.relPath === 'Show A')
      expect((await Database.podcastModel.findByPk(a.mediaId)).coverPath).to.equal(null)
      expect(fs.readdirSync(a.path)).to.not.include('cover.png')
    })
  })
})
