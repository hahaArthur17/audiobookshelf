/*
 * Rich book-library fixture for the query-filter characterization tests (libraryFilters, libraryItemsBookFilters, seriesFilters,
 * libraryItemFilters). Built through the real models. Everything is deterministic: ids are random UUIDs, so `names` maps every id to a
 * readable label, and timestamps are explicit offsets from "now" (set with silent updates so the models keep them).
 *
 *   const f = await seedQueryFilters(api)
 *   f.lf / f.other           libraries ({ library, folder })
 *   f.items.alpha            { book, libraryItem }
 *   f.series.saga, f.authors.ann
 *   f.users.reader ...       users (authenticate with api.request(..., { as: 'reader' }))
 *   f.names                  Map(id -> label) for matchSnapshot
 */
const Database = require('../../../server/Database')
const { createLibrary } = require('./seed-library')
const { makeAudioFile } = require('./seed-library-extra')

const DAY = 24 * 3600 * 1000
const ago = (days) => new Date(Date.now() - days * DAY)

const BOOKS = [
  // key, title, titleIgnorePrefix, authors, series [name, sequence], metadata
  {
    key: 'alpha',
    title: 'The Alpha Quest',
    ignore: 'Alpha Quest, The',
    authors: ['ann'],
    series: [['saga', '1']],
    narrators: ['Nora Narrator', 'Ned Narrator'],
    genres: ['Fantasy', 'Adventure'],
    tags: ['fav', 'epic'],
    language: 'English',
    publisher: 'Orbit',
    year: '2001',
    subtitle: 'Book One',
    isbn: '9780000000001',
    asin: 'B000000001',
    description: 'First saga book',
    cover: '/covers/alpha.jpg',
    duration: 3600,
    tracks: 1,
    size: 3000,
    days: 10,
    abridged: false,
    chapters: 2
  },
  {
    key: 'beta',
    title: 'Beta Chronicle',
    ignore: 'Beta Chronicle',
    authors: ['ann', 'bob'],
    series: [['saga', '2']],
    narrators: ['Nora Narrator'],
    genres: ['Fantasy', 'Sci-Fi'],
    tags: ['fav'],
    language: 'English',
    publisher: 'Orbit',
    year: '2005',
    subtitle: 'Book Two',
    isbn: '9780000000002',
    asin: 'B000000002',
    description: 'Second saga book',
    cover: '/covers/beta.jpg',
    duration: 7200,
    tracks: 2,
    size: 5000,
    days: 20,
    abridged: true,
    chapters: 0
  },
  { key: 'gamma', title: 'Gamma Ray', ignore: 'Gamma Ray', authors: ['bob'], series: [['saga', '10']], narrators: ['Gus Gamma'], genres: ['Sci-Fi'], tags: ['epic'], language: 'German', publisher: 'Tor', year: '2010', subtitle: null, isbn: null, asin: 'B000000003', description: 'Tenth saga book', cover: null, duration: 100, tracks: 1, size: 100, days: 30, abridged: false, chapters: 1 },
  {
    key: 'eta',
    title: 'Eta Interlude',
    ignore: 'Eta Interlude',
    authors: ['ann'],
    series: [
      ['saga', '1.5'],
      ['pair', null, 'late']
    ],
    narrators: ['Ned Narrator'],
    genres: ['Fantasy'],
    tags: [],
    language: 'English',
    publisher: 'Tor',
    year: '2019',
    subtitle: 'Between',
    isbn: '9780000000004',
    asin: null,
    description: null,
    cover: '/covers/eta.jpg',
    duration: 50,
    tracks: 1,
    size: 50,
    days: 40,
    abridged: false,
    chapters: 0
  },
  { key: 'zeta', title: 'Zeta Zero', ignore: 'Zeta Zero', authors: [], series: [], narrators: [], genres: [], tags: [], language: null, publisher: null, year: null, subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 0, tracks: 0, size: 10, days: 50, abridged: false, chapters: 0 },
  { key: 'epsilon', title: 'Epsilon Ebook', ignore: 'Epsilon Ebook', authors: ['cy'], series: [['mystery', '1']], narrators: [], genres: ['Mystery'], tags: ['fav'], language: 'Spanish', publisher: 'Pub B', year: '1995', subtitle: null, isbn: '9780000000005', asin: null, description: 'An epub', cover: null, duration: 11, tracks: 0, ebook: true, size: 400, days: 55, abridged: false, chapters: 0 },
  { key: 'omicron', title: 'Omicron Ebook', ignore: 'Omicron Ebook', authors: ['cy'], series: [['mystery', '2']], narrators: [], genres: ['Mystery'], tags: [], language: 'Spanish', publisher: 'Pub B', year: '1999', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 12, tracks: 0, ebook: true, size: 300, days: 56, abridged: false, chapters: 0 },
  {
    key: 'theta',
    title: 'Theta Tale',
    ignore: 'Theta Tale',
    authors: ['dee'],
    series: [['mystery', '3']],
    narrators: ['Nora Narrator'],
    genres: ['Mystery', 'Thriller'],
    tags: ['fav'],
    language: 'English',
    publisher: 'Orbit',
    year: '2021',
    subtitle: 'The end',
    isbn: null,
    asin: 'B000000006',
    description: 'Audio plus a supplementary pdf',
    cover: '/covers/theta.jpg',
    duration: 1800,
    tracks: 1,
    supplementary: true,
    size: 1800,
    days: 5,
    abridged: false,
    chapters: 3
  },
  {
    key: 'iota',
    title: 'Iota Intro',
    ignore: 'Iota Intro',
    authors: ['dee'],
    series: [['pair', '1']],
    narrators: ['Nora Narrator'],
    genres: ['Thriller'],
    tags: ['spicy'],
    language: 'English',
    publisher: 'Orbit',
    year: '2008',
    subtitle: null,
    isbn: null,
    asin: null,
    description: 'Adults only',
    cover: null,
    duration: 900,
    tracks: 3,
    size: 900,
    days: 15,
    abridged: false,
    chapters: 0,
    explicit: true
  },
  { key: 'kappa', title: 'Kappa Alone', ignore: 'Kappa Alone', authors: ['fay'], series: [['solo', '1']], narrators: ['Zoë Z??'], genres: ['Fantasy'], tags: ['fav'], language: 'English', publisher: 'Tor', year: '2000', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 200, tracks: 1, size: 200, days: 25, abridged: false, chapters: 0 },
  { key: 'lambda', title: 'Lambda Missing', ignore: 'Lambda Missing', authors: ['fay'], series: [], narrators: [], genres: ['Fantasy'], tags: [], language: 'English', publisher: null, year: '2015', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 300, tracks: 1, size: 20, days: 3, abridged: false, chapters: 0, isMissing: true },
  { key: 'mu', title: 'Mu Invalid', ignore: 'Mu Invalid', authors: ['ann'], series: [['ancient', null]], narrators: [], genres: [], tags: [], language: 'English', publisher: null, year: 'abc', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 400, tracks: 1, size: 30, days: 80, abridged: false, chapters: 0, isInvalid: true },
  { key: 'apple', title: 'An Apple a Day', ignore: 'Apple a Day, An', authors: ['gil'], series: [['ancient', '1']], narrators: ['Gil Gray'], genres: ['Nonfiction'], tags: ['old'], language: 'English', publisher: 'Old House', year: '1899', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 60, tracks: 1, size: 60, days: 70, abridged: true, chapters: 0 },
  { key: 'nu', title: 'Nu Unknown', ignore: 'Nu Unknown', authors: [], series: [], narrators: [], genres: [], tags: [], language: 'English', publisher: null, year: '2020', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 70, tracks: 1, size: 70, days: 2, abridged: false, chapters: 0, explicit: null },
  { key: 'tau', title: 'Tau Prequel', ignore: 'Tau Prequel', authors: ['fay'], series: [['guarded', null]], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2012', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 120, tracks: 1, size: 120, days: 6, abridged: false, chapters: 0 },
  { key: 'rho', title: 'Rho Open', ignore: 'Rho Open', authors: ['fay'], series: [['guarded', '2']], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2013', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 130, tracks: 1, size: 130, days: 5, abridged: false, chapters: 0 },
  { key: 'sigma', title: 'Sigma Adult', ignore: 'Sigma Adult', authors: ['fay'], series: [['guarded', '3']], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2014', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 140, tracks: 1, size: 140, days: 4, abridged: false, chapters: 0, explicit: true },
  { key: 'psi', title: 'Psi Twin', ignore: 'Psi Twin', authors: ['gil'], series: [['twins', '1']], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2016', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 150, tracks: 1, size: 150, days: 8, abridged: false, chapters: 0 },
  { key: 'omega', title: 'Omega Twin', ignore: 'Omega Twin', authors: ['gil'], series: [['twins', '1']], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2017', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 160, tracks: 1, size: 160, days: 9, abridged: false, chapters: 0 },
  { key: 'chi', title: 'Chi Twin', ignore: 'Chi Twin', authors: ['fay'], series: [['guarded', '2']], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2018', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 170, tracks: 1, size: 170, days: 11, abridged: false, chapters: 0 },
  { key: 'upsilon', title: 'Upsilon Adult', ignore: 'Upsilon Adult', authors: ['fay'], series: [['adults', '1']], narrators: [], genres: ['Drama'], tags: [], language: 'English', publisher: null, year: '2011', subtitle: null, isbn: null, asin: null, description: null, cover: null, duration: 180, tracks: 1, size: 180, days: 12, abridged: false, chapters: 0, explicit: true }
]

const AUTHORS = { ann: 'Ann Author', bob: 'Bob Builder', cy: 'Cy Cleaner', dee: 'Dee Dunn', fay: 'Fay Fox', gil: 'Gil Gray' }
const SERIES = { saga: 'The Saga', mystery: 'Mystery Trio', pair: 'Pair', solo: 'Solo', ancient: 'Ancient', guarded: 'Guarded', twins: 'Twins', adults: 'Adults' }

function bookFields(b, dir) {
  const audioFiles = []
  for (let i = 1; i <= (b.tracks || 0); i++) audioFiles.push(makeAudioFile(dir, `${b.key}-${i}.mp3`, (b.duration || 0) / b.tracks, i))
  const chapters = []
  for (let i = 0; i < (b.chapters || 0); i++) chapters.push({ id: i, start: i * 10, end: i * 10 + 10, title: `Chapter ${i + 1}` })
  return {
    title: b.title,
    titleIgnorePrefix: b.ignore,
    subtitle: b.subtitle,
    publishedYear: b.year,
    publisher: b.publisher,
    description: b.description,
    isbn: b.isbn,
    asin: b.asin,
    language: b.language,
    explicit: 'explicit' in b ? b.explicit : false,
    abridged: b.abridged,
    coverPath: b.cover,
    duration: b.duration,
    narrators: b.narrators,
    audioFiles,
    ebookFile: b.ebook ? { ino: `eb-${b.key}`, metadata: { filename: `${b.key}.epub`, ext: '.epub', path: `${dir}/${b.key}.epub`, relPath: `${b.key}.epub`, size: 1000, mtimeMs: 1, ctimeMs: 1, birthtimeMs: 1 }, ebookFormat: 'epub', addedAt: 1, updatedAt: 1 } : null,
    chapters,
    tags: b.tags,
    genres: b.genres
  }
}

/**
 * @param {import('../../../server/Database')} _unused
 * @param {{ library:any }} lf
 */
async function createProgress(user, book, o = {}) {
  const duration = o.duration ?? book.duration ?? 100
  return Database.mediaProgressModel.create(
    {
      userId: user.id,
      mediaItemId: book.id,
      mediaItemType: 'book',
      duration,
      currentTime: o.currentTime ?? (o.isFinished ? duration : 0),
      isFinished: !!o.isFinished,
      hideFromContinueListening: !!o.hide,
      ebookProgress: o.ebookProgress ?? null,
      ebookLocation: null,
      finishedAt: o.isFinished ? ago(o.finishedDaysAgo ?? 1) : null,
      extraData: {},
      createdAt: ago(o.createdDaysAgo ?? 30),
      updatedAt: ago(o.updatedDaysAgo ?? 1)
    },
    { silent: true }
  )
}

async function createUserWith(username, type, tweak, extraData) {
  const permissions = Database.userModel.getDefaultPermissionsForUserType(type)
  if (tweak) tweak(permissions)
  return Database.userModel.create({ username, pash: 'hash', token: `token-${username}`, type, isActive: true, permissions, bookmarks: [], extraData: extraData === null ? {} : { seriesHideFromContinueListening: [], ...(extraData || {}) } })
}

/**
 * @param {{ seed: { users: Function } }} api harness api (startApi result)
 * @param {{ withUsers?: boolean }} [opts]
 */
async function seedQueryFilters(api, opts = {}) {
  const base = await api.seed.users()
  const lf = await createLibrary({ name: 'Books' })
  const other = await createLibrary({ name: 'Other', path: '/test/other' })
  await lf.library.update({ displayOrder: 1, settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('book') })
  await other.library.update({ displayOrder: 2, settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('book') })

  const authors = {}
  for (const [key, name] of Object.entries(AUTHORS)) {
    authors[key] = await Database.authorModel.create({ name, lastFirst: Database.authorModel.getLastFirst(name), libraryId: lf.library.id })
  }
  const series = {}
  for (const [key, name] of Object.entries(SERIES)) {
    series[key] = await Database.seriesModel.create({ name, nameIgnorePrefix: name.replace(/^The /, '') + (name.startsWith('The ') ? ', The' : ''), libraryId: lf.library.id })
  }

  const items = {}
  const lateLinks = []
  for (const b of BOOKS) {
    const dir = `${lf.folder.path}/${b.title}`
    const book = await Database.bookModel.create(bookFields(b, dir))
    const libraryItem = await Database.libraryItemModel.create({
      libraryFiles: b.supplementary ? [{ ino: 'sup1', isSupplementary: true, metadata: { filename: 'extra.pdf', ext: '.pdf', path: `${dir}/extra.pdf`, relPath: 'extra.pdf', size: 10 }, fileType: 'ebook' }] : [{ ino: 'main', isSupplementary: false, metadata: { filename: 'main.mp3', ext: '.mp3', path: `${dir}/main.mp3`, relPath: 'main.mp3', size: 10 }, fileType: 'audio' }],
      mediaId: book.id,
      mediaType: 'book',
      libraryId: lf.library.id,
      libraryFolderId: lf.folder.id,
      path: dir,
      relPath: b.title,
      title: b.title,
      titleIgnorePrefix: b.ignore,
      isMissing: !!b.isMissing,
      isInvalid: !!b.isInvalid,
      size: b.size
    })
    for (const a of b.authors) await Database.bookAuthorModel.create({ bookId: book.id, authorId: authors[a].id })
    // the harness database has no triggers (Database.init adds them), so the denormalized author names are filled here
    if (b.authors.length) await Database.libraryItemModel.update({ authorNamesFirstLast: b.authors.map((a) => authors[a].name).join(', '), authorNamesLastFirst: b.authors.map((a) => authors[a].lastFirst).join(', ') }, { where: { id: libraryItem.id } })
    for (const [s, sequence, late] of b.series) {
      // 'late' links are created after every other book (so the series rows of Pair are stored with the unnumbered book last)
      if (late) lateLinks.push({ bookId: book.id, seriesId: series[s].id, sequence })
      else await Database.bookSeriesModel.create({ bookId: book.id, seriesId: series[s].id, sequence })
    }
    // explicit offsets (silent keeps the values): newest first by `days`, and distinct birthtime/mtime so those sorts are testable
    const when = ago(b.days)
    await Database.libraryItemModel.update({ createdAt: when, updatedAt: when, birthtime: ago(1000 - b.days), mtime: ago(500 + b.size / 100) }, { where: { id: libraryItem.id }, silent: true })
    // book.updatedAt runs opposite to createdAt so `lastBookUpdated` and `lastBookAdded` order the series differently
    await Database.bookModel.update({ createdAt: when, updatedAt: ago(100 - b.days) }, { where: { id: book.id }, silent: true })
    items[b.key] = { book, libraryItem, spec: b }
  }
  for (const link of lateLinks) await Database.bookSeriesModel.create(link)
  // author/series created times: some older than the 60 day window of the "recent" shelves
  await Database.authorModel.update({ createdAt: ago(100), updatedAt: ago(100) }, { where: { id: authors.gil.id }, silent: true })
  await Database.authorModel.update({ createdAt: ago(2), updatedAt: ago(2) }, { where: { id: authors.dee.id }, silent: true })
  await Database.authorModel.update({ createdAt: ago(4), updatedAt: ago(4) }, { where: { id: authors.fay.id }, silent: true })
  await Database.authorModel.update({ createdAt: ago(6), updatedAt: ago(6) }, { where: { id: authors.cy.id }, silent: true })
  await Database.authorModel.update({ createdAt: ago(45), updatedAt: ago(45) }, { where: { id: authors.bob.id }, silent: true })
  await Database.authorModel.update({ createdAt: ago(9), updatedAt: ago(9) }, { where: { id: authors.ann.id }, silent: true })
  const seriesAges = { saga: 45, mystery: 3, pair: 7, solo: 1, ancient: 100, guarded: 2, twins: 14, adults: 6 }
  // updatedAt differs from createdAt (and orders the series differently) so the two sorts can be told apart
  const seriesUpdated = { saga: 1, mystery: 40, pair: 20, solo: 90, ancient: 5, guarded: 60, twins: 30, adults: 70 }
  for (const [k, days] of Object.entries(seriesAges)) await Database.seriesModel.update({ createdAt: ago(days), updatedAt: ago(seriesUpdated[k]) }, { where: { id: series[k].id }, silent: true })

  // a second library with same-named author/series, to prove libraryId scoping
  const elsewhereAuthor = await Database.authorModel.create({ name: 'Ann Author', lastFirst: 'Author, Ann', libraryId: other.library.id })
  const elsewhereSeries = await Database.seriesModel.create({ name: 'The Saga', nameIgnorePrefix: 'Saga, The', libraryId: other.library.id })
  const elsewhereBook = await Database.bookModel.create(bookFields({ key: 'elsewhere', title: 'Elsewhere', ignore: 'Elsewhere', narrators: ['Nora Narrator'], genres: ['Fantasy'], tags: ['fav'], language: 'English', publisher: 'Orbit', year: '2001', duration: 10, tracks: 1, chapters: 0, abridged: false }, `${other.folder.path}/Elsewhere`))
  const elsewhereItem = await Database.libraryItemModel.create({ libraryFiles: [], mediaId: elsewhereBook.id, mediaType: 'book', libraryId: other.library.id, libraryFolderId: other.folder.id, path: `${other.folder.path}/Elsewhere`, relPath: 'Elsewhere', title: 'Elsewhere', titleIgnorePrefix: 'Elsewhere', size: 5 })
  await Database.bookAuthorModel.create({ bookId: elsewhereBook.id, authorId: elsewhereAuthor.id })
  await Database.bookSeriesModel.create({ bookId: elsewhereBook.id, seriesId: elsewhereSeries.id, sequence: '1' })
  items.elsewhere = { book: elsewhereBook, libraryItem: elsewhereItem }

  // open feeds (libraryItem + series) and a media item share
  const feed = (slug, entityType, entityId) => Database.feedModel.create({ slug, entityType, entityId, entityUpdatedAt: new Date(1000), serverAddress: 'http://localhost', feedURL: `/feed/${slug}`, title: slug, description: 'd', author: 'a', ownerName: 'o', ownerEmail: 'o@x', explicit: false, preventIndexing: true, userId: base.admin.id })
  const feeds = {
    gamma: await feed('gamma-feed', 'libraryItem', items.gamma.libraryItem.id),
    beta: await feed('beta-feed', 'libraryItem', items.beta.libraryItem.id),
    alpha: await feed('alpha-feed', 'libraryItem', items.alpha.libraryItem.id),
    epsilon: await feed('epsilon-feed', 'libraryItem', items.epsilon.libraryItem.id),
    kappa: await feed('kappa-feed', 'libraryItem', items.kappa.libraryItem.id),
    mystery: await feed('mystery-feed', 'series', series.mystery.id)
  }
  const share = await Database.mediaItemShareModel.create({ mediaItemId: items.theta.book.id, mediaItemType: 'book', slug: 'theta-share', pash: null, expiresAt: null, extraData: {}, isDownloadable: false, userId: base.admin.id })

  // users
  const users = { ...base }
  users.reader = await createUserWith('reader', 'user', (p) => (p.accessExplicitContent = true))
  users.reader2 = await createUserWith('reader2', 'user', (p) => (p.accessExplicitContent = true), { seriesHideFromContinueListening: [series.mystery.id] })
  users.limited = await createUserWith('limited', 'user') // no explicit content
  users.tagsel = await createUserWith('tagsel', 'user', (p) => {
    p.accessExplicitContent = true
    p.accessAllTags = false
    p.itemTagsSelected = ['fav']
  })
  users.tagdeny = await createUserWith('tagdeny', 'user', (p) => {
    p.accessExplicitContent = true
    p.accessAllTags = false
    p.selectedTagsNotAccessible = true
    p.itemTagsSelected = ['fav', 'old']
  })
  users.tagonly = await createUserWith('tagonly', 'user', (p) => {
    // tag restriction without explicit access: both restrictions at once
    p.accessAllTags = false
    p.itemTagsSelected = ['epic']
  })
  users.bare = await createUserWith('bare', 'user', (p) => (p.accessExplicitContent = true), null)
  users.admin2 = await createUserWith('admin2', 'admin')
  users.otherOnly = await createUserWith('otherOnly', 'user', (p) => {
    p.accessAllLibraries = false
    p.librariesAccessible = [other.library.id]
    p.accessExplicitContent = true
  })

  // progress. reader: finished / in-progress / hidden / ebook in-progress / ebook finished / row with no progress
  const prog = {}
  if (opts.progress !== false) {
    const R = users.reader
    prog.readerAlpha = await createProgress(R, items.alpha.book, { isFinished: true, finishedDaysAgo: 3, createdDaysAgo: 9, updatedDaysAgo: 3 })
    prog.readerBeta = await createProgress(R, items.beta.book, { currentTime: 1000, createdDaysAgo: 8, updatedDaysAgo: 1 })
    prog.readerGamma = await createProgress(R, items.gamma.book, { currentTime: 40, hide: true, createdDaysAgo: 7, updatedDaysAgo: 2 })
    prog.readerEpsilon = await createProgress(R, items.epsilon.book, { ebookProgress: 0.4, createdDaysAgo: 6, updatedDaysAgo: 4 })
    prog.readerOmicron = await createProgress(R, items.omicron.book, { isFinished: true, ebookProgress: 1, finishedDaysAgo: 6, createdDaysAgo: 12, updatedDaysAgo: 6 })
    prog.readerTheta = await createProgress(R, items.theta.book, { currentTime: 0, createdDaysAgo: 5, updatedDaysAgo: 5 })
    prog.readerKappa = await createProgress(R, items.kappa.book, { isFinished: true, finishedDaysAgo: 2, createdDaysAgo: 11, updatedDaysAgo: 2.5 })
    // reader2: finished and in-progress different books, plus a hidden series
    const R2 = users.reader2
    prog.reader2Gamma = await createProgress(R2, items.gamma.book, { isFinished: true, finishedDaysAgo: 5, createdDaysAgo: 14, updatedDaysAgo: 5 })
    prog.reader2Epsilon = await createProgress(R2, items.epsilon.book, { isFinished: true, ebookProgress: 1, finishedDaysAgo: 8, createdDaysAgo: 15, updatedDaysAgo: 8 })
    prog.reader2Omicron = await createProgress(R2, items.omicron.book, { isFinished: true, ebookProgress: 1, finishedDaysAgo: 7, createdDaysAgo: 15, updatedDaysAgo: 7 })
    prog.reader2Iota = await createProgress(R2, items.iota.book, { currentTime: 300, createdDaysAgo: 3, updatedDaysAgo: 0.5 })
    prog.readerZeta = await createProgress(R, items.zeta.book, { ebookProgress: 0, currentTime: 0, createdDaysAgo: 4, updatedDaysAgo: 6.5 })
    // an unfinished row with ebookProgress 0 on a book before the one in progress (so the `> 0` of the ebook progress filters matters)
    prog.readerEta = await createProgress(R, items.eta.book, { ebookProgress: 0, currentTime: 0, createdDaysAgo: 3, updatedDaysAgo: 8.5 })
    prog.readerPsi = await createProgress(R, items.psi.book, { isFinished: true, finishedDaysAgo: 5, createdDaysAgo: 10, updatedDaysAgo: 7.5 })
    // admin2: in-progress, finished and a half-read series (so every shelf has an entry the admin-only `share` include can decorate)
    const A2 = users.admin2
    prog.admin2Beta = await createProgress(A2, items.beta.book, { currentTime: 500, createdDaysAgo: 5, updatedDaysAgo: 1 })
    prog.admin2Kappa = await createProgress(A2, items.kappa.book, { isFinished: true, finishedDaysAgo: 2, createdDaysAgo: 6, updatedDaysAgo: 2 })
    prog.admin2Omicron = await createProgress(A2, items.omicron.book, { isFinished: true, ebookProgress: 1, finishedDaysAgo: 3, createdDaysAgo: 6, updatedDaysAgo: 3 })
    // limited: finished books whose later books they may not see (Pair: only Iota is left and it is explicit; Guarded: Sigma is explicit)
    prog.limitedAlpha = await createProgress(users.limited, items.alpha.book, { isFinished: true, finishedDaysAgo: 4, createdDaysAgo: 9, updatedDaysAgo: 4 })
    prog.limitedEta = await createProgress(users.limited, items.eta.book, { isFinished: true, finishedDaysAgo: 3, createdDaysAgo: 8, updatedDaysAgo: 3 })
    prog.limitedRho = await createProgress(users.limited, items.rho.book, { isFinished: true, finishedDaysAgo: 2, createdDaysAgo: 7, updatedDaysAgo: 2 })
    // tagonly (sees only the "epic" books Alpha and Gamma): both are started, so there is nothing left to discover
    prog.tagonlyAlpha = await createProgress(users.tagonly, items.alpha.book, { isFinished: true, finishedDaysAgo: 4, createdDaysAgo: 9, updatedDaysAgo: 4 })
    prog.tagonlyGamma = await createProgress(users.tagonly, items.gamma.book, { currentTime: 10, createdDaysAgo: 9, updatedDaysAgo: 4 })
  }

  const names = new Map([
    [lf.library.id, '<books>'],
    [other.library.id, '<other>'],
    [lf.folder.id, '<books-folder>'],
    [other.folder.id, '<other-folder>'],
    [elsewhereAuthor.id, '<author:elsewhere-ann>'],
    [elsewhereSeries.id, '<series:elsewhere-saga>'],
    [elsewhereItem.id, '<item:elsewhere>'],
    [elsewhereBook.id, '<book:elsewhere>'],
    [share.id, '<share:theta>']
  ])
  for (const [k, v] of Object.entries(items)) {
    if (k === 'elsewhere') continue
    names.set(v.libraryItem.id, `<item:${k}>`)
    names.set(v.book.id, `<book:${k}>`)
  }
  for (const [k, v] of Object.entries(feeds)) names.set(v.id, `<feed:${k}>`)
  for (const [k, v] of Object.entries(authors)) names.set(v.id, `<author:${k}>`)
  for (const [k, v] of Object.entries(series)) names.set(v.id, `<series:${k}>`)
  for (const [k, v] of Object.entries(users)) names.set(v.id, `<user:${k}>`)
  for (const [k, v] of Object.entries(prog)) names.set(v.id, `<progress:${k}>`)

  return { lf, other, authors, series, items, users, feeds, share, prog, names, b64: (s) => encodeURIComponent(Buffer.from(String(s)).toString('base64')) }
}

module.exports = { seedQueryFilters, createProgress, createUserWith, BOOKS }
