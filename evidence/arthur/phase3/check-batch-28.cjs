// Deterministic offline baseline for dbMigration's public migration flows.
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path containing dist-server')

const targetPath = path.resolve(root, 'dist-server/server/utils/migrations/dbMigration.js')
const originalLoad = Module._load
const originalNow = Date.now
let active
let uuidIndex
const calls = []
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => calls.push(['log.' + level, ...args.map(clean)])]))
const fs = {
  async emptyDir(target) {
    calls.push(['fs.emptyDir', target])
    if (active?.emptyDirError) throw active.emptyDirError
  },
  async pathExists(target) {
    calls.push(['fs.pathExists', target])
    return Boolean(active?.paths?.[target])
  }
}
const oldDbFiles = {
  async loadOldData(name) {
    calls.push(['oldDb.load', name])
    return active.files[name] || []
  },
  async checkHasOldDb() {
    calls.push(['oldDb.checkHasOldDb'])
    return active.hasOldDb
  },
  async checkHasOldDbZip() {
    calls.push(['oldDb.checkHasOldDbZip'])
    if (active.zipCheckError) throw active.zipCheckError
    return active.hasZip
  },
  async zipWrapOldDb() {
    calls.push(['oldDb.zipWrapOldDb'])
    return active.zipResult
  },
  async checkExtractItemsUsersAndLibraries() {
    calls.push(['oldDb.checkExtractItemsUsersAndLibraries'])
    return active.extractResult
  },
  async removeOldItemsUsersAndLibrariesFolders() {
    calls.push(['oldDb.removeOldItemsUsersAndLibrariesFolders'])
  }
}

function clean(value) {
  if (value === undefined) return '[undefined]'
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN'
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') {
    if (value instanceof Error) return { name: value.name, message: value.message }
    const result = {}
    for (const [key, entry] of Object.entries(value)) result[key] = clean(entry)
    return result
  }
  return value
}

Module._load = function (request, parent, isMain) {
  if (parent && path.resolve(parent.filename) === targetPath) {
    if (request === 'sequelize') return { DataTypes: { JSON: 'JSON', DATE: 'DATE', STRING: 'STRING', BIGINT: 'BIGINT', FLOAT: 'FLOAT' } }
    if (request === 'path') return path
    if (request === 'uuid') return { v4: () => `uuid-${String(++uuidIndex).padStart(3, '0')}` }
    if (request === '../../Logger') return logger
    if (request === '../../libs/fsExtra') return fs
    if (request === './oldDbFiles') return oldDbFiles
    if (request === '../parsers/parseNameString') return { nameToLastFirst: (name) => `last:${name}` }
  }
  return originalLoad.apply(this, arguments)
}

function loadFresh(fixture) {
  active = fixture
  uuidIndex = 0
  delete require.cache[targetPath]
  return require(targetPath)
}

function migrationFiles() {
  const book = {
    id: 'li-book', folderId: 'folder-books', libraryId: 'lib-books', mediaType: 'book',
    ino: 'ino-book', path: '/books/alpha', relPath: 'alpha', isFile: true,
    mtimeMs: 11, ctimeMs: 12, birthtimeMs: 13, addedAt: 14, updatedAt: 15,
    libraryFiles: [{ metadata: { size: 10 } }, { metadata: { size: '5' }, isSupplementary: false }],
    media: {
      audioFiles: [{ duration: 30 }, { duration: 7, exclude: true }, { duration: null }],
      chapters: [], tags: ['tag-a'], ebookFile: null, coverPath: 'covers/book.jpg',
      metadata: {
        title: 'The Alpha', subtitle: 'Subtitle', authors: [{ id: 'author-old', name: 'Jane Doe' }],
        series: [{ id: 'series-old', name: 'The Saga', sequence: '1' }], genres: ['fantasy'],
        narrators: ['Reader'], publishedYear: 2001, explicit: true
      }
    }
  }
  const podcast = {
    id: 'li-podcast', folderId: 'folder-podcasts', libraryId: 'lib-podcasts', mediaType: 'podcast',
    ino: 'ino-podcast', path: '/podcasts/radio', relPath: 'radio', isFile: false,
    mtimeMs: 21, ctimeMs: 22, birthtimeMs: 23, addedAt: 24, updatedAt: 25,
    libraryFiles: [{ metadata: { size: 20 } }],
    media: {
      autoDownloadEpisodes: false, episodes: [{ id: 'episode-old', index: 2, title: 'Episode', audioFile: { ino: 'ep-ino', index: 8 }, addedAt: 26, updatedAt: 27 }],
      tags: ['podcast-tag'], metadata: { title: 'The Radio', author: 'Host', genres: ['news'], explicit: false }
    }
  }
  // Author/series discovery scans metadata before the mediaType-specific item pass.
  const unknown = {
    id: 'li-unknown', folderId: 'folder-books', libraryId: 'lib-books', mediaType: 'comic',
    media: { metadata: { authors: [], series: [] } }
  }
  return {
    libraries: [
      { id: 'lib-books', name: 'Books', mediaType: 'book', displayOrder: 1, folders: [{ id: 'folder-books', fullPath: '/books', addedAt: 1 }], createdAt: 2, lastUpdate: 3 },
      { id: 'lib-podcasts', name: 'Podcasts', mediaType: 'podcast', displayOrder: 2, folders: [{ id: 'folder-podcasts', fullPath: '/podcasts', addedAt: 4 }], createdAt: 5, lastUpdate: 6 }
    ],
    settings: [{ id: 'server-settings', sortingPrefixes: ['the'], version: '2.3.0' }, { id: 'notification-settings', enabled: true }],
    libraryItems: [book, podcast, unknown],
    authors: [{ id: 'author-old', name: 'Jane Doe', addedAt: 7, updatedAt: 8 }],
    series: [{ id: 'series-old', name: 'The Saga', addedAt: 9, updatedAt: 10 }],
    users: [{
      id: 'user-old', username: 'reader', isActive: true, createdAt: 30,
      librariesAccessible: ['lib-books', 'lib-podcasts'],
      bookmarks: [{ libraryItemId: 'li-book' }, { libraryItemId: 'li-absent' }],
      seriesHideFromContinueListening: ['series-old'], mediaProgress: [
        { id: 'progress-book', libraryItemId: 'li-book', currentTime: 2, duration: 30, progress: 0.1, startedAt: 31 },
        { id: 'progress-episode', libraryItemId: 'li-podcast', episodeId: 'episode-old', currentTime: 4, duration: 60, progress: 0.2, startedAt: 32 }
      ]
    }],
    sessions: [{
      id: 'session-old', userId: 'user-old', deviceInfo: { deviceId: 'device-1' }, mediaType: 'podcast',
      episodeId: 'episode-old', libraryId: 'lib-podcasts', startedAt: 40, updatedAt: 41,
      displayTitle: 'Episode', duration: 60, currentTime: 5, playMethod: 'direct'
    }],
    collections: [{ id: 'collection-old', libraryId: 'lib-books', name: 'Favorites', books: ['li-book', 'li-absent'], createdAt: 50 }],
    playlists: [{ id: 'playlist-old', libraryId: 'lib-books', userId: 'user-old', name: 'Mixed', createdAt: 60, items: [{ libraryItemId: 'li-book' }, { episodeId: 'episode-old' }] }],
    feeds: [{ id: 'feed-old', entityType: 'libraryItem', entityId: 'li-book', userId: 'user-old', episodes: [{ title: 'Feed Episode' }], meta: { title: 'Feed', link: 'https://example.test', imageUrl: 'cover.png' }, createdAt: 70, updatedAt: 71 }]
  }
}

function baseFixture() {
  return { files: {}, hasOldDb: false, hasZip: false, zipResult: false, extractResult: false, paths: {}, emptyDirError: null, zipCheckError: null }
}

function createModels(failAt = null) {
  const models = new Proxy({}, {
    get(_target, model) {
      return {
        async bulkCreate(records, options) {
          calls.push(['bulkCreate', String(model), clean(records), clean(options)])
          if (model === failAt) throw active.writeError
          return records
        }
      }
    }
  })
  return models
}

async function mainMigration() {
  calls.length = 0
  const fixture = baseFixture()
  fixture.files = migrationFiles()
  fixture.zipResult = false
  fixture.emptyDirError = new Error('cache unavailable')
  const api = loadFresh(fixture)
  const input = fixture.files.libraryItems
  const userInput = fixture.files.users[0]
  await api.migrate(createModels())
  const writes = calls.filter((entry) => entry[0] === 'bulkCreate').map(([_, model, records]) => [model, records.length])
  const record = (model) => calls.find((entry) => entry[0] === 'bulkCreate' && entry[1] === model)?.[2] || []
  const books = record('book')
  const podcasts = record('podcast')
  const items = record('libraryItem')
  const episodes = record('podcastEpisode')
  const authors = record('author')
  const series = record('series')
  const users = record('user')
  const progress = record('mediaProgress')
  const playlistItems = record('playlistMediaItem')
  const result = {
    exports: Object.keys(api).map((key) => [key, typeof api[key], api[key].length, Object.hasOwn(api[key], 'prototype')]),
    loadOrder: calls.filter((entry) => entry[0] === 'oldDb.load').map((entry) => entry[1]),
    writes,
    ids: {
      libraries: record('library').map(({ id, oldLibraryId }) => [oldLibraryId, id]),
      folders: record('libraryFolder').map(({ id, libraryId }) => [id, libraryId]),
      authorBook: [authors[0]?.id, books[0]?.id, record('bookAuthor')[0]?.authorId, record('bookAuthor')[0]?.bookId],
      seriesBook: [series[0]?.id, record('bookSeries')[0]?.seriesId, record('bookSeries')[0]?.bookId],
      items: items.map(({ id, mediaId, mediaType, libraryId, libraryFolderId }) => ({ id, mediaId, mediaType, libraryId, libraryFolderId })),
      episode: [episodes[0]?.id, episodes[0]?.podcastId],
      user: [users[0]?.id, users[0]?.bookmarks, users[0]?.permissions?.librariesAccessible, users[0]?.extraData?.seriesHideFromContinueListening],
      progress: progress.map(({ mediaItemId, mediaItemType, userId, extraData }) => ({ mediaItemId, mediaItemType, userId, extraData })),
      playlist: playlistItems.map(({ mediaItemId, mediaItemType, order }) => [mediaItemId, mediaItemType, order])
    },
    derived: {
      book: books.map(({ title, titleIgnorePrefix, duration, explicit }) => ({ title, titleIgnorePrefix, duration, explicit })),
      podcast: podcasts.map(({ title, titleIgnorePrefix }) => ({ title, titleIgnorePrefix })),
      collectionBooks: record('collectionBook').map(({ bookId, order }) => [bookId, order]),
      feed: record('feed').map(({ entityType, entityId, userId }) => [entityType, entityId, userId])
    },
    mutations: {
      libraryFileSupplementary: input[0].libraryFiles.map((file) => Object.hasOwn(file, 'isSupplementary') ? file.isSupplementary : '[absent]'),
      podcastEpisodeAudioIndex: input[1].media.episodes[0].audioFile.index,
      bookmarkLibraryItemIds: userInput.bookmarks.map((bookmark) => bookmark.libraryItemId)
    },
    tailCalls: calls.filter((entry) => ['fs.emptyDir', 'oldDb.zipWrapOldDb', 'log.error'].includes(entry[0]))
  }
  assert.deepStrictEqual(result.loadOrder, ['libraries', 'settings', 'libraryItems', 'authors', 'series', 'users', 'sessions', 'collections', 'playlists', 'feeds'])
  assert.deepStrictEqual(result.writes.map(([model]) => model), ['library', 'libraryFolder', 'setting', 'author', 'series', 'book', 'podcast', 'podcastEpisode', 'bookSeries', 'bookAuthor', 'libraryItem', 'user', 'mediaProgress', 'device', 'playbackSession', 'collection', 'collectionBook', 'playlist', 'playlistMediaItem', 'feed', 'feedEpisode'])
  assert.equal(books[0].titleIgnorePrefix, 'Alpha')
  assert.equal(books[0].duration, 30)
  assert.equal(input[1].media.episodes[0].audioFile.index, 1)
  assert.deepStrictEqual(input[0].libraryFiles.map((file) => file.isSupplementary), [null, false])
  assert.equal(result.ids.playlist[0][1], 'podcastEpisode') // Current behavior assigns one final mediaItemType to every item in a mixed playlist.
  return result
}

async function checkShouldMigrateCases() {
  const outputs = []
  for (const [hasOldDb, hasZip] of [[true, true], [false, true], [false, false]]) {
    calls.length = 0
    const fixture = { ...baseFixture(), hasOldDb, hasZip }
    const result = await loadFresh(fixture).checkShouldMigrate()
    outputs.push({ result, calls: clean(calls) })
  }
  assert.deepStrictEqual(outputs.map(({ result }) => result), [true, true, false])
  assert.deepStrictEqual(outputs[0].calls.map(([name]) => name), ['oldDb.checkHasOldDb'])
  return outputs
}

function queryInterfaceFixture({ description = {}, transactionError = null } = {}) {
  const qi = {
    sequelize: {
      async transaction(callback) {
        calls.push(['transaction.begin'])
        if (transactionError) throw transactionError
        const result = await callback('transaction-token')
        calls.push(['transaction.commit'])
        return result
      }
    },
    async describeTable(table) {
      calls.push(['describeTable', table])
      return description[table] || {}
    },
    async addColumn(table, column, definition, options) {
      calls.push(['addColumn', table, column, definition, options])
      return true
    }
  }
  return qi
}

async function migrationPatchCases() {
  const outputs = {}
  calls.length = 0
  {
    const fixture = { ...baseFixture(), paths: {} }
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ description: { libraries: { extraData: { type: 'JSON' } } } })
    const ctx = { sequelize: { getQueryInterface: () => qi } }
    outputs.skipNoZip = { result: await api.migrationPatch(ctx), calls: clean(calls) }
  }
  calls.length = 0
  {
    const fixture = { ...baseFixture(), paths: {} }
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture()
    const ctx = { sequelize: { getQueryInterface: () => qi } }
    outputs.addColumnsNoZip = { result: await api.migrationPatch(ctx), calls: clean(calls) }
  }
  calls.length = 0
  {
    const failure = new Error('transaction rejected')
    const fixture = { ...baseFixture() }
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ transactionError: failure })
    let caught
    try { await api.migrationPatch({ sequelize: { getQueryInterface: () => qi } }) } catch (error) { caught = error }
    outputs.transactionError = { sameError: caught === failure, message: caught?.message, loggedColumnFailure: calls.some((entry) => entry[0] === 'log.error' && String(entry[1]).includes('column creation failed')), calls: clean(calls) }
  }
  calls.length = 0
  {
    const fixture = { ...baseFixture(), paths: { '/fixture/config/oldDb.zip': true }, extractResult: false }
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ description: { libraries: { extraData: { type: 'JSON' } } } })
    const result = await api.migrationPatch({ sequelize: { getQueryInterface: () => qi } })
    outputs.skipExtraction = { result, calls: clean(calls) }
  }
  calls.length = 0
  {
    const fixture = { ...baseFixture(), paths: { '/fixture/config/oldDb.zip': true }, extractResult: true }
    fixture.files.libraryItems = [
      { id: 'li_old_book', ino: 'ino-book', media: { episodes: [] } },
      { id: 'li_old_podcast', ino: 'ino-podcast', media: { episodes: [{ id: 'ep_old', audioFile: { ino: 'ino-episode' } }] } },
      { id: 'li_unmatched', ino: 'ino-absent', media: { episodes: [] } }
    ]
    fixture.files.libraries = [{ id: 'lib_old', name: 'Books', folders: [{ fullPath: '/books' }] }]
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ description: { libraries: { extraData: { type: 'JSON' } } } })
    const changed = []
    const library = {
      id: 'lib_new', oldLibraryId: 'lib_old', name: 'Books', extraData: null,
      libraryFolders: [{ path: '/books' }],
      changed(field, value) { changed.push(['library', field, value]) },
      async save() { calls.push(['library.save', this.id, clean(this.extraData)]) }
    }
    const newItems = [
      { id: 'item-book-new', ino: 'ino-book', media: { podcastEpisodes: [] } },
      { id: 'item-podcast-new', ino: 'ino-podcast', media: { podcastEpisodes: [{ id: 'episode-new', audioFile: { ino: 'ino-episode' } }] } },
      { id: 'item-unmatched', ino: 'ino-no-match', media: { podcastEpisodes: [] } }
    ]
    const patchWrites = []
    const models = {
      libraryItem: {
        async findAllExpandedWhere() { calls.push(['findAllExpandedWhere']); return newItems },
        async bulkCreate(rows, options) { patchWrites.push(['libraryItem', clean(rows), clean(options)]); calls.push(['patchBulkCreate', 'libraryItem', clean(rows), clean(options)]) }
      },
      podcastEpisode: {
        async bulkCreate(rows, options) { patchWrites.push(['podcastEpisode', clean(rows), clean(options)]); calls.push(['patchBulkCreate', 'podcastEpisode', clean(rows), clean(options)]) }
      },
      library: {
        async getAllWithFolders() { calls.push(['getAllWithFolders']); return [library] }
      }
    }
    const userChanged = []
    const user = {
      id: 'user_new',
      bookmarks: [
        { libraryItemId: 'li_old_book' },
        { libraryItemId: 'li_missing' },
        { libraryItemId: 'item_already_new' }
      ],
      permissions: { librariesAccessible: ['lib_old', 'lib_missing', 'main', 'readable'] },
      extraData: { seriesHideFromContinueListening: ['se_old', 'series_current'] },
      changed(field, value) { userChanged.push([field, value]) },
      async save() { calls.push(['user.save', clean(this.bookmarks), clean(this.permissions), clean(this.extraData)]) }
    }
    const ctx = {
      models,
      sequelize: { getQueryInterface: () => qi },
      userModel: { async findAll(options) { calls.push(['user.findAll', options.include === models.mediaProgress]); return [user] } }
    }
    const result = await api.migrationPatch(ctx)
    outputs.rowsAndMappings = {
      result,
      writes: patchWrites,
      library: { extraData: library.extraData, changed, saves: calls.filter(([name]) => name === 'library.save') },
      user: { bookmarks: user.bookmarks, permissions: user.permissions, extraData: user.extraData, changed: userChanged, saves: calls.filter(([name]) => name === 'user.save') },
      order: calls.map(([name]) => name).filter((name) => ['oldDb.load', 'findAllExpandedWhere', 'patchBulkCreate', 'getAllWithFolders', 'library.save', 'user.findAll', 'user.save', 'oldDb.removeOldItemsUsersAndLibrariesFolders'].includes(name)),
      calls: clean(calls)
    }
    assert.deepStrictEqual(patchWrites.map(([model]) => model), ['podcastEpisode', 'libraryItem'])
    assert.deepStrictEqual(user.bookmarks, [{ libraryItemId: 'item-book-new' }, { libraryItemId: 'item_already_new' }])
    assert.deepStrictEqual(user.permissions.librariesAccessible, ['lib_new', 'readable'])
    assert.deepStrictEqual(user.extraData.seriesHideFromContinueListening, ['series_current'])
    assert.deepStrictEqual(outputs.rowsAndMappings.order, [
      'oldDb.load', 'findAllExpandedWhere', 'patchBulkCreate', 'patchBulkCreate',
      'oldDb.load', 'getAllWithFolders', 'library.save', 'user.findAll', 'user.save',
      'oldDb.removeOldItemsUsersAndLibrariesFolders'
    ])
    assert.deepStrictEqual(library.extraData, { oldLibraryId: 'lib_old' })
    assert.deepStrictEqual(userChanged, [['bookmarks', true], ['permissions', true], ['extraData', true]])
  }
  calls.length = 0
  {
    const failure = new Error('patch item update failed')
    const fixture = { ...baseFixture(), paths: { '/fixture/config/oldDb.zip': true }, extractResult: true }
    fixture.files.libraryItems = [{ id: 'li_old', ino: 'ino-old', media: { episodes: [{ id: 'ep_old', audioFile: { ino: 'ep-ino' } }] } }]
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ description: { libraries: { extraData: { type: 'JSON' } } } })
    const ctx = { sequelize: { getQueryInterface: () => qi }, models: {
      libraryItem: {
        async findAllExpandedWhere() { return [{ id: 'item_new', ino: 'ino-old', media: { podcastEpisodes: [{ id: 'ep_new', audioFile: { ino: 'ep-ino' } }] } }] },
        async bulkCreate() { calls.push(['libraryItem.bulkCreate']); throw failure }
      },
      podcastEpisode: { async bulkCreate() { calls.push(['podcastEpisode.bulkCreate']) } }
    } }
    let caught
    try { await api.migrationPatch(ctx) } catch (error) { caught = error }
    outputs.rowError = { sameError: caught === failure, message: caught?.message, cleanupAttempted: calls.some(([name]) => name === 'oldDb.removeOldItemsUsersAndLibrariesFolders'), calls: clean(calls) }
  }
  assert.equal(outputs.skipNoZip.result, undefined)
  assert.equal(outputs.addColumnsNoZip.calls.filter(([name]) => name === 'addColumn').length, 3)
  assert.equal(outputs.transactionError.sameError, true)
  assert.equal(outputs.transactionError.loggedColumnFailure, false)
  assert.equal(outputs.skipExtraction.result, undefined)
  assert.equal(outputs.rowError.sameError, true)
  assert.equal(outputs.rowError.cleanupAttempted, false)
    assert.deepStrictEqual(outputs.rowError.calls.filter(([name]) => name.endsWith('.bulkCreate')).map(([name]) => name), ['podcastEpisode.bulkCreate', 'libraryItem.bulkCreate'])
  return outputs
}

function patch2Models(failLibraryItem = null) {
  const one = (model, row) => ({
    async findAll(options) { calls.push(['findAll', model, options]); return [row] },
    async bulkCreate(rows, options) { calls.push(['patchBulkCreate', model, clean(rows), clean(options)]); return rows }
  })
  const itemPages = [
    Array.from({ length: 500 }, (_, index) => ({ id: `li-${String(index).padStart(3, '0')}`, libraryFiles: [{ metadata: { size: 10 } }, { metadata: {} }] })),
    [{ id: 'li-500', libraryFiles: [{ metadata: { size: '7' } }] }]
  ]
  const libraryItem = {
    async findAll(options) { calls.push(['findAll', 'libraryItem', options]); return itemPages[options.offset / 500] || [] },
    async bulkCreate(rows, options) {
      calls.push(['patchBulkCreate', 'libraryItem', rows.length, rows[0], rows.at(-1), clean(options)])
      if (failLibraryItem) throw failLibraryItem
      return rows
    }
  }
  return {
    libraryItem,
    book: one('book', { id: 'book-1', title: 'The Book', audioFiles: [{ duration: 30 }, { duration: 2, invalid: true }, { duration: null }] }),
    podcast: one('podcast', { id: 'podcast-1', title: 'The Podcast' }),
    series: one('series', { id: 'series-1', name: 'The Series' }),
    author: one('author', { id: 'author-1', name: 'Doe, Jane' }),
    bookAuthor: one('bookAuthor', { id: 'ba-1', author: { createdAt: new Date('2020-01-02T03:04:05.000Z') } }),
    bookSeries: one('bookSeries', { id: 'bs-1', series: { createdAt: new Date('2021-02-03T04:05:06.000Z') } })
  }
}

async function migrationPatch2Cases() {
  const outputs = {}
  calls.length = 0
  {
    const fixture = baseFixture()
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ description: {
      feeds: { coverPath: { type: 'STRING' } }, authors: { lastFirst: { type: 'STRING' } }, bookAuthors: { createdAt: { type: 'DATE' } }
    } })
    const result = await api.migrationPatch2({ sequelize: { getQueryInterface: () => qi } })
    outputs.skip = { result, calls: clean(calls) }
  }
  calls.length = 0
  {
    const fixture = baseFixture()
    const api = loadFresh(fixture)
    global.ServerSettings = { sortingPrefixes: ['The'] }
    const qi = queryInterfaceFixture()
    const ctx = { models: patch2Models(), sequelize: { getQueryInterface: () => qi, async query(sql) { calls.push(['rawQuery', sql]); return [[], {}] } } }
    const result = await api.migrationPatch2(ctx)
    const backfills = calls.filter(([name]) => name === 'patchBulkCreate').map(([_, model, rows, options]) => [model, Array.isArray(rows) ? rows.length : rows, options])
    const pages = calls.filter(([name, model]) => name === 'findAll' && model === 'libraryItem').map(([, , options]) => [options.limit, options.offset])
    outputs.transactionAndBackfill = { result, addedColumns: calls.filter(([name]) => name === 'addColumn').map(([, table, column]) => [table, column]), pages, backfills, sql: calls.filter(([name]) => name === 'rawQuery').map(([, statement]) => statement) }
  }
  calls.length = 0
  {
    const failure = new Error('patch2 transaction rejected')
    const fixture = baseFixture()
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture({ transactionError: failure })
    let caught
    try { await api.migrationPatch2({ sequelize: { getQueryInterface: () => qi } }) } catch (error) { caught = error }
    outputs.transactionError = { name: caught?.name, message: caught?.message, sameError: caught === failure, calls: clean(calls) }
  }
  calls.length = 0
  {
    const failure = new Error('patch2 size backfill failed')
    const fixture = baseFixture()
    const api = loadFresh(fixture)
    const qi = queryInterfaceFixture()
    const ctx = { models: patch2Models(failure), sequelize: { getQueryInterface: () => qi } }
    let caught
    try { await api.migrationPatch2(ctx) } catch (error) { caught = error }
    outputs.backfillError = {
      name: caught?.name,
      message: caught?.message,
      sameError: caught === failure,
      committedBeforeBackfill: calls.some(([name]) => name === 'transaction.commit'),
      loggedFailure: calls.some(([name, message]) => name === 'log.error' && String(message).includes('column creation failed')),
      calls: clean(calls)
    }
  }
  assert.equal(outputs.skip.result, false)
  assert.equal(outputs.transactionAndBackfill.result, true)
  assert.deepStrictEqual(outputs.transactionAndBackfill.pages, [[500, 0], [500, 500]])
  assert.match(outputs.transactionError.message, /^Migration 2\.3\.3\+ failed Error: patch2 transaction rejected$/)
  assert.equal(outputs.backfillError.sameError, false)
  assert.equal(outputs.backfillError.committedBeforeBackfill, true)
  assert.equal(outputs.backfillError.loggedFailure, true)
  return outputs
}

async function mainWriteFailure() {
  calls.length = 0
  const failure = new Error('author insert failed')
  const fixture = baseFixture()
  fixture.files = migrationFiles()
  fixture.writeError = failure
  const api = loadFresh(fixture)
  let caught
  try { await api.migrate(createModels('author')) } catch (error) { caught = error }
  const writes = calls.filter(([name]) => name === 'bulkCreate').map(([, model]) => model)
  assert.equal(caught, failure)
  assert.deepStrictEqual(writes, ['library', 'libraryFolder', 'setting', 'author'])
  assert.equal(calls.some(([name]) => name === 'oldDb.zipWrapOldDb'), false)
  return { sameError: caught === failure, writes, archiveAttempted: false }
}

async function main() {
  const originalServerSettings = global.ServerSettings
  const originalMetadataPath = global.MetadataPath
  const originalConfigPath = global.ConfigPath
  try {
    Date.now = () => 1700000000000
    global.MetadataPath = '/fixture/metadata'
    global.ConfigPath = '/fixture/config'
    const apiShape = loadFresh(baseFixture())
    const output = {
      baseline: 'Phase 2 dbMigration.js; byte-identical to checkout source at accepted baseline',
      exports: Object.keys(apiShape).map((key) => [key, typeof apiShape[key], apiShape[key].length, Object.hasOwn(apiShape[key], 'prototype')]),
      mainMigration: await mainMigration(),
      checkShouldMigrate: await checkShouldMigrateCases(),
      migrationPatch: await migrationPatchCases(),
      migrationPatch2: await migrationPatch2Cases(),
      mainWriteFailure: await mainWriteFailure()
    }
    assert.deepStrictEqual(output.exports.map(([name]) => name), ['migrate', 'checkShouldMigrate', 'migrationPatch', 'migrationPatch2'])
    process.stdout.write(JSON.stringify(clean(output)) + '\n')
  } finally {
    Date.now = originalNow
    global.ServerSettings = originalServerSettings
    global.MetadataPath = originalMetadataPath
    global.ConfigPath = originalConfigPath
    Module._load = originalLoad
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
