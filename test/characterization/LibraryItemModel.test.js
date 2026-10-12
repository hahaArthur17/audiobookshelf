const { expect } = require('chai')
const fs = require('fs')
const path = require('path')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { createLibrary } = require('./helpers/seed-library')
const { createFileBook, createFilePodcast } = require('./helpers/seed-items-extra')
const { createProgress } = require('./helpers/seed-users-extra')
const { resetShareManager } = require('./helpers/seed-delivery-extra')
const { b64 } = require('./helpers/seed-query-filters-podcast')
const Database = require('../../server/Database')

// The LibraryItem model: expanded loaders, list/shelf builders, JSON serializers, media helpers and saveMetadataFile. Reached through the
// real routes where possible (library items listing, personalized shelves, author page) and called directly on the harness database otherwise.
describe('LibraryItemModel (characterization)', () => {
  let api, users, lf, podLf, items, pod

  const LI = () => Database.libraryItemModel
  const untilGone = async (model, id) => {
    for (let i = 0; i < 200; i++) {
      const count = await model.count({ where: { id } })
      if (!count) return 0
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return model.count({ where: { id } })
  }
  const get = (url, as = 'admin') => api.request('GET', url, { as })
  const O = (ctx, label) => ({ label, ids: ctx.ids, tmpDirs: [api.tmp] })
  const idMap = () => {
    const m = new Map([
      [lf.library.id, '<book-library>'],
      [podLf.library.id, '<pod-library>'],
      [lf.folder.id, '<book-folder>'],
      [podLf.folder.id, '<pod-folder>'],
      [users.admin.id, '<admin>'],
      [users.user.id, '<user>']
    ])
    for (const [name, it] of Object.entries(items)) {
      m.set(it.libraryItem.id, `<item-${name}>`)
      m.set(it.book.id, `<book-${name}>`)
    }
    m.set(pod.libraryItem.id, '<item-pod>')
    m.set(pod.podcast.id, '<podcast-pod>')
    pod.episodes.forEach((e, i) => m.set(e.id, `<ep-pod-${i + 1}>`))
    return m
  }
  const shelfView = (res) => res.body.map((s) => ({ id: s.id, label: s.label, type: s.type, total: s.total, entities: s.entities.map((e) => e.media?.metadata.title ?? e.name).sort() }))

  beforeEach(async () => {
    resetShareManager()
    api = await startApi()
    users = await api.seed.users()
    lf = await createLibrary({ name: 'Books', path: path.join(api.tmp, 'books') })
    await lf.library.update({ settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('book') })
    podLf = await createLibrary({ name: 'Pods', mediaType: 'podcast', path: path.join(api.tmp, 'pods') })
    await podLf.library.update({ settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('podcast') })
    const audio = (n, duration = 100) => [{ filename: `${n}.mp3`, ino: `10${n}`, duration }]
    items = {}
    items.sagaOne = await createFileBook(lf, { title: 'Saga One', authors: ['Ann Author'], series: [{ name: 'Saga', sequence: '1' }], tags: ['fav'], audio: audio(1), cover: 'cover.png', images: [{ filename: 'cover.png', ino: '190' }], extra: { narrators: ['Nora'], genres: ['Fantasy'], publishedYear: '2001' } })
    items.sagaTwo = await createFileBook(lf, {
      title: 'Saga Two',
      authors: ['Ann Author', 'Bob Co'],
      series: [
        { name: 'Saga', sequence: '2' },
        { name: 'Other', sequence: '3' }
      ],
      audio: audio(2, 200)
    })
    items.soloAudio = await createFileBook(lf, {
      title: 'Solo Audio',
      authors: ['Cy Solo'],
      audio: audio(3, 300),
      chapters: [
        { id: 0, start: 0, end: 150, title: 'One' },
        { id: 1, start: 150, end: 300, title: 'Two' }
      ]
    })
    items.ebookOnly = await createFileBook(lf, { title: 'Ebook Only', authors: ['Eve Ebook'], ebooks: [{ filename: 'book.epub', ino: '301', primary: true }] })
    items.ebookDone = await createFileBook(lf, { title: 'Ebook Done', authors: ['Eve Ebook'], ebooks: [{ filename: 'done.epub', ino: '302', primary: true }] })
    items.audioDone = await createFileBook(lf, { title: 'Audio Done', authors: ['Dee Done'], audio: audio(4, 400) })
    items.missing = await createFileBook(lf, { title: 'Missing Book', audio: audio(5) })
    await items.missing.libraryItem.update({ isMissing: true, isInvalid: true })
    items.single = await createFileBook(lf, { title: 'Single File', isFile: true, audio: [{ filename: 'single.mp3', ino: '106', duration: 60 }] })
    pod = await createFilePodcast(podLf, {
      title: 'Test Pod',
      author: 'Pod Author',
      episodes: [
        { title: 'Pod Ep 1', filename: 'p1.mp3', ino: '501', duration: 30 },
        { title: 'Pod Ep 2', filename: 'p2.mp3', ino: '502', duration: 40 }
      ]
    })

    const prog = (user, key, o) => createProgress(user, { libraryItem: items[key].libraryItem, mediaItemId: items[key].book.id, duration: o.duration ?? 100, updatedAt: '2024-06-01T10:00:00Z', ...o })
    await prog(users.admin, 'sagaOne', { currentTime: 100, isFinished: true, finishedAt: '2024-06-01T10:00:00Z' })
    await prog(users.admin, 'soloAudio', { duration: 300, currentTime: 30, updatedAt: '2024-06-02T10:00:00Z' })
    await prog(users.admin, 'ebookOnly', { duration: 0, currentTime: 0, ebookProgress: 0.4, updatedAt: '2024-06-03T10:00:00Z' })
    await prog(users.admin, 'audioDone', { duration: 400, currentTime: 400, isFinished: true, finishedAt: '2024-06-04T10:00:00Z', updatedAt: '2024-06-04T10:00:00Z' })
    await prog(users.admin, 'ebookDone', { duration: 0, ebookProgress: 1, isFinished: true, finishedAt: '2024-06-05T10:00:00Z', updatedAt: '2024-06-05T10:00:00Z' })
    await prog(users.user, 'soloAudio', { duration: 300, currentTime: 60, updatedAt: '2024-06-06T10:00:00Z' })
  })

  afterEach(async () => {
    resetShareManager()
    await api.stop()
  })

  describe('expanded loaders', () => {
    it('getExpandedById loads books with ordered authors and series and podcasts with episodes', async function () {
      this.ids = idMap()
      const book = await LI().getExpandedById(items.sagaTwo.libraryItem.id)
      expect(book.media.authors.map((a) => a.name)).to.deep.equal(['Ann Author', 'Bob Co'])
      expect(book.media.series.map((s) => `${s.name}#${s.bookSeries.sequence}`)).to.deep.equal(['Saga#2', 'Other#3'])
      const podcast = await LI().getExpandedById(pod.libraryItem.id)
      expect(podcast.media.podcastEpisodes).to.have.length(2)
      matchSnapshot(this, { book: book.toOldJSONExpanded(), podcast: podcast.toOldJSONExpanded() }, O(this, 'book and podcast'))
    })

    it('getExpandedById returns null for no id, unknown ids and items whose media is gone', async function () {
      expect(await LI().getExpandedById(null)).to.equal(null)
      expect(await LI().getExpandedById(undefined)).to.equal(null)
      expect(await LI().getExpandedById('')).to.equal(null)
      expect(await LI().getExpandedById('nope')).to.equal(null)
      await Database.sequelize.query('DELETE FROM books WHERE id = :id', { replacements: { id: items.single.book.id } })
      expect(await LI().getExpandedById(items.single.libraryItem.id)).to.equal(null)
      await Database.sequelize.query('DELETE FROM podcasts WHERE id = :id', { replacements: { id: pod.podcast.id } })
      expect(await LI().getExpandedById(pod.libraryItem.id)).to.equal(null)
      matchSnapshot(this, { rowsRemain: await LI().count({ where: { id: [items.single.libraryItem.id, pod.libraryItem.id] } }) }, { label: 'orphaned library items' })
    })

    it('findOneExpanded supports where, replacements and includes', async function () {
      this.ids = idMap()
      const byPath = await LI().findOneExpanded({ path: items.soloAudio.itemPath })
      const byReplacement = await LI().findOneExpanded(Database.sequelize.literal('relPath = :rel'), { rel: 'Saga One' })
      const withInclude = await LI().findOneExpanded({ id: items.sagaOne.libraryItem.id }, null, [{ model: Database.libraryModel }])
      const podcast = await LI().findOneExpanded({ mediaType: 'podcast' })
      expect(await LI().findOneExpanded({ path: '/nope' })).to.equal(null)
      await Database.sequelize.query('DELETE FROM books WHERE id = :id', { replacements: { id: items.single.book.id } })
      expect(await LI().findOneExpanded({ id: items.single.libraryItem.id })).to.equal(null)
      matchSnapshot(this, { byPath: byPath.media.title, byReplacement: byReplacement.media.title, includeLibrary: withInclude.dataValues.library?.name ?? null, authors: withInclude.media.authors.map((a) => a.name), podcast: { title: podcast.media.title, episodes: podcast.media.podcastEpisodes.length } }, O(this, 'lookups'))
    })

    it('findAllExpandedWhere returns every item or the filtered ones with media', async function () {
      this.ids = idMap()
      const all = await LI().findAllExpandedWhere()
      const books = await LI().findAllExpandedWhere({ mediaType: 'book', isMissing: false })
      const pods = await LI().findAllExpandedWhere({ libraryId: podLf.library.id })
      expect(all).to.have.length(9)
      const view = (list) => list.map((li) => ({ title: li.media.title, authors: li.media.authors?.map((a) => a.name), series: li.media.series?.map((s) => `${s.name}#${s.bookSeries.sequence}`), episodes: li.media.podcastEpisodes?.length }))
      const sortedAll = view(all).sort((a, b) => a.title.localeCompare(b.title))
      matchSnapshot(this, { all: sortedAll, booksCount: books.length, pods: view(pods) }, O(this, 'lists'))
    })

    it('getLibraryItemsIncrement pages by creation date with authors and series', async function () {
      this.ids = idMap()
      const out = {}
      const run = async (label, offset, limit, where) => {
        const list = await LI().getLibraryItemsIncrement(offset, limit, where)
        out[label] = list.map((li) => ({ title: li.media.title, authors: li.media.authors?.map((a) => a.name), series: li.media.series?.map((s) => `${s.name}#${s.bookSeries.sequence}`), episodes: li.media.podcastEpisodes })).sort((a, b) => a.title.localeCompare(b.title))
        out[`${label} order`] = list.map((li) => li.media.title)
      }
      await run('first three', 0, 3)
      await run('next three', 3, 3)
      await run('past the end', 100, 3)
      await run('missing only', 0, 10, { isMissing: true })
      await run('podcast only', 0, 10, { mediaType: 'podcast' })
      expect(out['first three order']).to.deep.equal(['Saga One', 'Saga Two', 'Solo Audio'])
      matchSnapshot(this, out, O(this, 'increments'))
    })

    it('removeById destroys the item with its media; checkExistsById and getCoverPath look items up', async function () {
      this.ids = idMap()
      const out = {}
      out.existsBefore = await LI().checkExistsById(items.sagaOne.libraryItem.id)
      out.existsUnknown = await LI().checkExistsById('nope')
      out.existsUndefined = await LI()
        .checkExistsById(undefined)
        .then(
          () => 'resolved',
          (error) => error.message
        )
      out.coverBook = await LI().getCoverPath(items.sagaOne.libraryItem.id)
      out.coverNone = await LI().getCoverPath(items.soloAudio.libraryItem.id)
      await pod.podcast.update({ coverPath: path.join(pod.itemPath, 'cover.jpg') })
      out.coverPodcast = await LI().getCoverPath(pod.libraryItem.id)
      out.coverUnknown = await LI().getCoverPath('nope')
      out.removed = await LI().removeById(items.sagaOne.libraryItem.id)
      out.removedAgain = await LI().removeById(items.sagaOne.libraryItem.id)
      out.removedUnknown = await LI().removeById('nope')
      out.existsAfter = await LI().checkExistsById(items.sagaOne.libraryItem.id)
      // the afterDestroy hook does not await media.destroy(), so the media row disappears shortly after removeById resolves
      out.bookRowAfter = await untilGone(Database.bookModel, items.sagaOne.book.id)
      out.podcastRemoved = await LI().removeById(pod.libraryItem.id)
      out.podcastRowAfter = await untilGone(Database.podcastModel, pod.podcast.id)
      expect(out.removed).to.equal(1)
      matchSnapshot(this, { ...out, coverBook: path.relative(api.tmp, out.coverBook || ''), coverPodcast: path.relative(api.tmp, out.coverPodcast || '') }, O(this, 'lookups and removal'))
    })

    it('afterFind sets media on found items and drops the book and podcast associations', async function () {
      const found = await LI().findAll({ include: [{ model: Database.bookModel }, { model: Database.podcastModel }], order: [['createdAt', 'ASC']] })
      const view = found.map((li) => ({ type: li.mediaType, hasMedia: !!li.media, mediaTitle: li.media?.title, book: li.book, podcast: li.podcast, dataBook: li.dataValues.book, dataPodcast: li.dataValues.podcast, dataMedia: !!li.dataValues.media }))
      const plain = await LI().findOne({ where: { id: items.sagaOne.libraryItem.id } })
      const none = await LI().findOne({ where: { id: 'nope' } })
      const onlyBook = await LI().findAll({ where: { mediaType: 'book' }, include: [{ model: Database.bookModel }] })
      expect(view.every((v) => v.hasMedia)).to.equal(true)
      matchSnapshot(this, { view, plainHasMedia: plain.media !== undefined, none, onlyBookCount: onlyBook.length, onlyBookPodcastKey: onlyBook[0].podcast }, { label: 'afterFind' })
    })
  })

  describe('instance helpers', () => {
    it('reports the media type, audio tracks and media loading', async function () {
      this.ids = idMap()
      const out = {}
      const sagaTwo = await LI().getExpandedById(items.sagaTwo.libraryItem.id)
      const ebook = await LI().getExpandedById(items.ebookOnly.libraryItem.id)
      const podcast = await LI().getExpandedById(pod.libraryItem.id)
      const bare = await LI().findByPk(items.sagaTwo.libraryItem.id)
      out.types = [sagaTwo, podcast].map((li) => ({ isBook: li.isBook, isPodcast: li.isPodcast }))
      out.hasAudioTracks = { book: sagaTwo.hasAudioTracks, ebookOnly: ebook.hasAudioTracks, podcast: podcast.hasAudioTracks, noMedia: bare.hasAudioTracks }
      out.getMediaNoType = await LI().build({ id: 'x' }).getMedia()
      out.mediaBare = (await bare.getMedia()).title
      out.mediaExpandedBook = (await bare.getMediaExpanded()).authors.map((a) => a.name)
      out.mediaExpandedPodcast = (await (await LI().findByPk(pod.libraryItem.id)).getMediaExpanded()).podcastEpisodes.length
      out.seriesAttributes = (await bare.getMediaExpanded()).series.map((s) => Object.keys(s.bookSeries.dataValues))
      expect(out.hasAudioTracks.noMedia).to.equal(false)
      matchSnapshot(this, out, O(this, 'flags'))
    })

    it('finds audio files by ino and builds track lists', async function () {
      this.ids = idMap()
      const out = {}
      const book = await LI().getExpandedById(items.soloAudio.libraryItem.id)
      const podcast = await LI().getExpandedById(pod.libraryItem.id)
      const bare = await LI().findByPk(items.soloAudio.libraryItem.id)
      out.bookFound = book.getAudioFileWithIno('103')?.metadata.filename
      out.bookMissing = book.getAudioFileWithIno('nope')
      out.podcastFound = podcast.getAudioFileWithIno('502')?.metadata.filename
      out.podcastMissing = podcast.getAudioFileWithIno('103')
      out.noMedia = bare.getAudioFileWithIno('103')
      out.bookTracks = book.getTrackList().map((t) => ({ index: t.index, startOffset: t.startOffset, duration: t.duration, contentUrl: t.contentUrl, title: t.title }))
      out.bookTracksIgnoreEpisodeId = book.getTrackList('whatever').length
      out.podcastWithoutEpisode = podcast.getTrackList()
      out.podcastEpisodeTracks = podcast.getTrackList(pod.episodes[1].id).map((t) => ({ index: t.index, duration: t.duration, contentUrl: t.contentUrl }))
      out.podcastUnknownEpisode = podcast.getTrackList('nope')
      out.noMediaTracks = bare.getTrackList()
      matchSnapshot(this, out, O(this, 'audio files and tracks'))
    })

    it('returns library files by ino as LibraryFile objects', async function () {
      this.ids = idMap()
      const li = await LI().findByPk(items.sagaOne.libraryItem.id)
      const file = li.getLibraryFileWithIno('190')
      const out = { found: file?.metadata.filename, className: file?.constructor.name, unknown: li.getLibraryFileWithIno('nope'), files: li.getLibraryFiles().map((f) => f.metadata.filename), json: li.getLibraryFilesJson() }
      expect(out.json).to.have.length(2)
      matchSnapshot(this, out, O(this, 'library files'))
    })
  })

  describe('serialization', () => {
    it('toOldJSON, toOldJSONMinified and toOldJSONExpanded for books and podcasts', async function () {
      this.ids = idMap()
      const out = {}
      for (const [name, id] of [
        ['soloAudio', items.soloAudio.libraryItem.id],
        ['sagaTwo', items.sagaTwo.libraryItem.id],
        ['missing', items.missing.libraryItem.id],
        ['single', items.single.libraryItem.id],
        ['ebookOnly', items.ebookOnly.libraryItem.id],
        ['pod', pod.libraryItem.id]
      ]) {
        const li = await LI().getExpandedById(id)
        out[name] = { full: li.toOldJSON(), minified: li.toOldJSONMinified(), expanded: li.toOldJSONExpanded() }
        // the expanded JSON is a superset of the minified JSON
        for (const key of Object.keys(out[name].minified)) expect(out[name].expanded).to.have.property(key)
        expect(out[name].expanded.media.metadata).to.deep.include(out[name].minified.media.metadata)
      }
      matchSnapshot(this, { soloAudio: out.soloAudio, pod: out.pod }, O(this, 'audio book and podcast'))
      matchSnapshot(this, { sagaTwo: out.sagaTwo, ebookOnly: out.ebookOnly }, O(this, 'multi author book and ebook'))
      matchSnapshot(this, { missing: out.missing, single: out.single }, O(this, 'missing and single file'))
    })

    it('converts null flags and dates, extraData and lastScan', async function () {
      this.ids = idMap()
      const li = await LI().getExpandedById(items.soloAudio.libraryItem.id)
      li.isMissing = null
      li.isInvalid = undefined
      li.mtime = null
      li.ctime = null
      li.birthtime = null
      li.lastScan = new Date(123456789)
      li.lastScanVersion = '2.0.0-test'
      li.extraData = { oldLibraryItemId: 'li_old' }
      const full = li.toOldJSON()
      li.extraData = null
      const out = { oldId: full.oldLibraryItemId, flags: [full.isMissing, full.isInvalid], times: [full.mtimeMs, full.ctimeMs, full.birthtimeMs], lastScan: full.lastScan, scanVersion: full.scanVersion, expandedLastScan: li.toOldJSONExpanded().lastScan, noExtra: li.toOldJSONMinified().oldLibraryItemId, minifiedHasLastScan: 'lastScan' in li.toOldJSONMinified() }
      expect(out.flags).to.deep.equal([false, false])
      matchSnapshot(this, out, { label: 'null handling' })
    })

    it('addedAt comes from createdAt and updatedAt from updatedAt in every serializer', async function () {
      const li = await LI().getExpandedById(items.soloAudio.libraryItem.id)
      li.setDataValue('createdAt', new Date(1700000000000))
      li.setDataValue('updatedAt', new Date(1800000000000))
      const out = {}
      for (const method of ['toOldJSON', 'toOldJSONMinified', 'toOldJSONExpanded']) out[method] = { addedAt: li[method]().addedAt, updatedAt: li[method]().updatedAt }
      // (snapshots mask timestamps, so the values are asserted directly)
      for (const method of Object.keys(out)) expect(out[method]).to.deep.equal({ addedAt: 1700000000000, updatedAt: 1800000000000 })
      matchSnapshot(this, out, { label: 'timestamps' })
    })

    it('throws when serializing without media', async function () {
      const bare = await LI().findByPk(items.soloAudio.libraryItem.id)
      const messages = []
      for (const method of ['toOldJSON', 'toOldJSONMinified', 'toOldJSONExpanded']) {
        try {
          bare[method]()
          messages.push(`${method}: no error`)
        } catch (error) {
          messages.push(`${method}: ${error.message.replace(bare.id, '<id>')}`)
        }
      }
      expect(messages).to.have.length(3)
      matchSnapshot(this, messages, { label: 'errors' })
    })
  })

  describe('saveMetadataFile', () => {
    const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

    it('writes the metadata file for books in the metadata folder', async function () {
      this.ids = idMap()
      const li = await LI().getExpandedById(items.sagaTwo.libraryItem.id)
      const result = await li.saveMetadataFile()
      const file = path.join(global.MetadataPath, 'items', li.id, 'metadata.json')
      expect(fs.existsSync(file)).to.equal(true)
      // a loaded item without expanded media loads it itself
      const bare = await LI().findByPk(items.soloAudio.libraryItem.id)
      const bareResult = await bare.saveMetadataFile()
      matchSnapshot(this, { result, written: read(file), bareResult, bareWritten: read(path.join(global.MetadataPath, 'items', bare.id, 'metadata.json')), libraryFiles: li.libraryFiles.length }, O(this, 'in metadata folder'))
    })

    it('writes the metadata file for podcasts', async function () {
      this.ids = idMap()
      await pod.podcast.update({ description: 'About', language: 'en', explicit: true, feedURL: 'https://example.test/feed.xml', itunesId: '77', tags: ['t1'], genres: ['g1'], podcastType: 'serial', releaseDate: '2024-01-01' })
      const li = await LI().getExpandedById(pod.libraryItem.id)
      await li.saveMetadataFile()
      matchSnapshot(this, read(path.join(global.MetadataPath, 'items', li.id, 'metadata.json')), O(this, 'podcast'))
    })

    it('stores the file with the item, adds it to libraryFiles and updates size and times', async function () {
      this.ids = idMap()
      global.ServerSettings.storeMetadataWithItem = true
      const li = await LI().getExpandedById(items.soloAudio.libraryItem.id)
      const sizeBefore = Number(li.size)
      const filesBefore = li.libraryFiles.length
      const first = await li.saveMetadataFile()
      const file = path.join(items.soloAudio.itemPath, 'metadata.json')
      expect(fs.existsSync(file)).to.equal(true)
      const afterFirst = { files: li.libraryFiles.length, size: Number(li.size) }
      const reloaded = await LI().findByPk(li.id)
      // the second save finds the entry and refreshes its timestamps instead of adding another one
      fs.writeFileSync(path.join(items.soloAudio.itemPath, 'extra.txt'), 'extra')
      const second = await li.saveMetadataFile()
      const out = {
        before: { files: filesBefore, size: sizeBefore },
        afterFirst,
        first: { filename: first.metadata.filename, relPath: first.metadata.relPath, ext: first.metadata.ext, hasIno: !!first.ino, isSupplementary: first.isSupplementary },
        persisted: { files: reloaded.libraryFiles.length, size: Number(reloaded.size), hasMtime: !!reloaded.mtime },
        second: { filesNow: li.libraryFiles.length, sameEntry: second === li.libraryFiles.find((lf) => lf.metadata.filename === 'metadata.json'), sizeMatchesFiles: Number(li.size) === li.libraryFiles.reduce((s, f) => s + Number(f.metadata.size), 0) },
        content: read(file)
      }
      expect(afterFirst.files).to.equal(filesBefore + 1)
      matchSnapshot(this, out, O(this, 'with item'))
    })

    it('keeps the metadata folder for single-file items even when storing with the item', async function () {
      global.ServerSettings.storeMetadataWithItem = true
      const li = await LI().getExpandedById(items.single.libraryItem.id)
      const filesBefore = li.libraryFiles.length
      await li.saveMetadataFile()
      const inFolder = fs.existsSync(path.join(global.MetadataPath, 'items', li.id, 'metadata.json'))
      const nextToFile = fs.existsSync(path.join(path.dirname(li.path), 'metadata.json'))
      expect(inFolder).to.equal(true)
      matchSnapshot(this, { inFolder, nextToFile, libraryFilesUnchanged: li.libraryFiles.length === filesBefore }, { label: 'single file item' })
    })

    it('returns null when the file cannot be written next to the item', async function () {
      global.ServerSettings.storeMetadataWithItem = true
      const li = await LI().getExpandedById(items.soloAudio.libraryItem.id)
      fs.rmSync(items.soloAudio.itemPath, { recursive: true, force: true })
      const result = await li.saveMetadataFile()
      expect(result).to.equal(null)
      matchSnapshot(this, { result, filesUnchanged: li.libraryFiles.length }, { label: 'unwritable' })
    })
  })

  describe('GET /api/libraries/:id/items (book library) list building', () => {
    it('adds rssFeed, series, collapsedSeries, shares and sizes to list entries', async function () {
      this.ids = idMap()
      await Database.feedModel.create({ slug: 'solo-feed', entityType: 'libraryItem', entityId: items.soloAudio.libraryItem.id, entityUpdatedAt: new Date(1000), serverAddress: 'http://localhost', feedURL: '/feed/solo-feed', title: 'Solo', description: 'd', author: 'a', ownerName: 'o', ownerEmail: 'o@x', explicit: false, preventIndexing: false })
      const created = await api.request('POST', '/api/share/mediaitem', { as: 'admin', json: { slug: 'solo-share', mediaItemType: 'book', mediaItemId: items.soloAudio.book.id, expiresAt: 0, isDownloadable: false } })
      expect(created.status).to.equal(201)
      const sagaId = (await Database.seriesModel.findOne({ where: { name: 'Saga' } })).id
      const L = `/api/libraries/${lf.library.id}`
      const brief = (res) =>
        res.body.results
          .map((r) => ({
            title: r.media.metadata.title,
            rssFeed: r.rssFeed ? { slug: r.rssFeed.slug, feedUrl: r.rssFeed.feedUrl } : undefined,
            share: r.mediaItemShare ? { slug: r.mediaItemShare.slug, hasPash: 'pash' in r.mediaItemShare, hasUser: 'userId' in r.mediaItemShare } : undefined,
            series: r.media.metadata.series,
            collapsedSeries: r.collapsedSeries,
            size: r.size,
            mediaSize: r.media.size,
            numEpisodes: r.media.numEpisodes
          }))
          .sort((a, b) => a.title.localeCompare(b.title))
      const out = {}
      out.includes = brief(await get(`${L}/items?include=rssfeed,share&sort=media.metadata.title`))
      out.shareAsUser = brief(await get(`${L}/items?include=share&sort=media.metadata.title`, 'user')).filter((r) => r.share)
      out.feedOpen = brief(await get(`${L}/items?filter=feed-open&include=rssfeed`))
      out.seriesFilter = brief(await get(`${L}/items?filter=series.${b64(sagaId)}&sort=sequence`))
      out.collapsed = brief(await get(`${L}/items?collapseseries=1&sort=media.metadata.title`))
      out.collapsedAndFiltered = brief(await get(`${L}/items?collapseseries=1&filter=series.${b64(sagaId)}`))
      out.shareOpen = brief(await get(`${L}/items?filter=share-open&include=share`))
      expect(out.includes.find((r) => r.title === 'Solo Audio').share.slug).to.equal('solo-share')
      matchSnapshot(this, out, O(this, 'entries'))
      matchSnapshot(this, { res: await get(`${L}/items?include=rssfeed,share&minified=1&limit=1&sort=media.metadata.title&desc=1`) }, O(this, 'minified entry'))
    })
  })

  describe('GET /api/libraries/:id/personalized (book library) shelves', () => {
    it('builds every shelf for books and ebooks', async function () {
      this.ids = idMap()
      const L = `/api/libraries/${lf.library.id}`
      const out = {}
      for (const as of ['admin', 'user', 'guest']) out[as] = shelfView(await get(`${L}/personalized`, as))
      expect(out.admin.map((s) => s.id)).to.deep.equal(['continue-listening', 'continue-reading', 'continue-series', 'recently-added', 'recent-series', 'discover', 'listen-again', 'read-again', 'newest-authors'])
      matchSnapshot(this, out, O(this, 'shelves by user'))
      // (the continue-series entry is a two-author book whose author order in this listing depends on random ids, and discover picks random books, so those shelves are left out)
      const limited = await get(`${L}/personalized?limit=1&include=rssfeed`)
      expect(limited.body.map((s) => s.id)).to.include('continue-series')
      matchSnapshot(this, { res: { ...limited, body: limited.body.filter((s) => !['continue-series', 'discover'].includes(s.id)) } }, O(this, 'admin limit 1 without continue-series and discover'))
    })

    it('omits shelves without entries', async function () {
      const empty = await createLibrary({ name: 'Empty Books', path: path.join(api.tmp, 'empty') })
      await empty.library.update({ settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('book') })
      const res = await get(`/api/libraries/${empty.library.id}/personalized`)
      expect(res.body).to.deep.equal([])
      const noProgress = shelfView(await get(`/api/libraries/${lf.library.id}/personalized`, 'guest'))
      matchSnapshot(this, { emptyLibrary: res.body, guest: noProgress }, { label: 'no entries' })
    })

    it('podcast libraries get continue listening, newest episodes, recently added and listen again', async function () {
      this.ids = idMap()
      await createProgress(users.admin, { libraryItem: pod.libraryItem, mediaItemId: pod.episodes[0].id, podcastId: pod.podcast.id, episode: true, duration: 30, currentTime: 10, updatedAt: '2024-06-01T10:00:00Z' })
      await createProgress(users.admin, { libraryItem: pod.libraryItem, mediaItemId: pod.episodes[1].id, podcastId: pod.podcast.id, episode: true, duration: 40, currentTime: 40, isFinished: true, finishedAt: '2024-06-02T10:00:00Z', updatedAt: '2024-06-02T10:00:00Z' })
      const res = await get(`/api/libraries/${podLf.library.id}/personalized`)
      expect(res.body.map((s) => s.id)).to.deep.equal(['continue-listening', 'newest-episodes', 'recently-added', 'listen-again'])
      matchSnapshot(this, { shelves: res.body.map((s) => ({ id: s.id, label: s.label, labelStringKey: s.labelStringKey, type: s.type, total: s.total, entities: s.entities.map((e) => e.recentEpisode?.title || e.media.metadata.title) })) }, O(this, 'podcast shelves'))
    })
  })

  describe('author page (getForAuthor)', () => {
    it('lists the books of an author with and without series, respecting user permissions', async function () {
      this.ids = idMap()
      await items.sagaTwo.book.update({ explicit: true })
      const ann = await Database.authorModel.findOne({ where: { name: 'Ann Author' } })
      const out = {}
      for (const as of ['admin', 'user']) {
        const plain = await get(`/api/authors/${ann.id}?include=items`, as)
        const withSeries = await get(`/api/authors/${ann.id}?include=items,series`, as)
        out[as] = { items: plain.body.libraryItems.map((li) => li.media.metadata.title), series: withSeries.body.series?.map((s) => ({ name: s.name, items: s.items.map((i) => `${i.media.metadata.title}#${i.media.metadata.series.sequence}`) })) }
      }
      out.noInclude = Object.keys((await get(`/api/authors/${ann.id}`)).body).sort()
      const direct = await LI().getForAuthor(ann)
      const directUser = await LI().getForAuthor(ann, await Database.userModel.getUserById(users.user.id))
      out.direct = [direct.map((li) => li.media.title), directUser.map((li) => li.media.title)]
      expect(out.admin.items).to.have.length(2)
      matchSnapshot(this, out, O(this, 'author'))
    })
  })

  describe('items in a library for other users', () => {
    it('GET /api/items/:id expands items with progress for the requesting user', async function () {
      this.ids = idMap()
      const res = await get(`/api/items/${items.soloAudio.libraryItem.id}?expanded=1&include=progress,rssfeed`, 'user')
      expect(res.status).to.equal(200)
      matchSnapshot(this, { res }, O(this, 'expanded item with progress'))
      const pods = await get(`/api/items/${pod.libraryItem.id}?expanded=1`)
      matchSnapshot(this, { res: pods }, O(this, 'expanded podcast'))
    })
  })
})
