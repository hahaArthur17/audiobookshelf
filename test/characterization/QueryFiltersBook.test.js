const { expect } = require('chai')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const { seedQueryFilters, createProgress } = require('./helpers/seed-query-filters')
const { createLibrary } = require('./helpers/seed-library')
const Database = require('../../server/Database')
const ShareManager = require('../../server/managers/ShareManager')

// The book query layer behind the library pages: libraryFilters, libraryItemsBookFilters, seriesFilters, libraryItemFilters.
// Reached through LibraryController (items, series, personalized, filterdata, search, stats, narrators), SeriesController,
// AuthorController, MiscController (tag/genre rename and delete). One rich fixture (helpers/seed-query-filters.js): 14 books in
// "Books" plus 1 in "Other"; users reader/reader2 (progress), limited (no explicit), tagsel/tagdeny/tagonly (tag restrictions).
// Results are projected to titles (and a few key fields) so a snapshot diff shows which item moved; a few tests keep whole bodies.
describe('QueryFiltersBook (characterization)', function () {
  this.timeout(30000)
  let api, f

  beforeEach(async () => {
    api = await startApi()
    f = await seedQueryFilters(api)
    // the share the items list attaches comes from the in-memory ShareManager
    ShareManager.openMediaItemShares.push({ id: f.share.id, mediaItemShare: f.share.toJSON() })
    for (const k of ['alpha', 'beta', 'epsilon', 'kappa', 'iota', 'zeta']) ShareManager.openMediaItemShares.push({ id: `share-${k}`, mediaItemShare: { id: `share-${k}`, mediaItemId: f.items[k].book.id, mediaItemType: 'book', slug: `${k}-share`, expiresAt: null, isDownloadable: false } })
  })
  afterEach(async () => {
    ShareManager.openMediaItemShares = []
    await api.stop()
  })

  const L = () => `/api/libraries/${f.lf.library.id}`
  // GET /libraries* answers come from ApiCacheManager (per user and url) until a model hook fires; a unique query param keeps
  // every request a real query, so repeating a url after a raw change (settings, SQL) is not served from that cache
  let nonce = 0
  const get = (url, as = 'admin') => api.request('GET', `${url}${url.includes('?') ? '&' : '?'}_nc=${++nonce}`, { as })
  const b64 = (v) => f.b64(v)
  const ids = () => new Map(f.names)
  const titleOf = (li) => li.media.metadata.title
  const row = (li) => {
    let s = titleOf(li)
    const c = li.collapsedSeries
    if (c) s += ` [collapsed ${c.name} #${c.sequence} of ${c.numBooks}, ${c.libraryItemIds.length} ids]`
    const se = li.media.metadata.series
    if (se) s += ` (series ${se.name} #${se.sequence})`
    if (li.rssFeed) s += ` {feed ${li.rssFeed.feedUrl}}`
    if (li.mediaItemShare) s += ' {share}'
    return s
  }
  const proj = (res) => (res.status === 200 && res.body.results ? { total: res.body.total, count: res.body.results.length, rows: res.body.results.map(row) } : { status: res.status, body: res.body })
  const sortedProj = (res) => ({ ...proj(res), rows: proj(res).rows?.slice().sort() })
  const items = (query, as) => get(`${L()}/items?${query}`, as)
  const T = 'sort=media.metadata.title'

  // runs every [label, query, user] against /items and returns { label: projection }
  const runItems = async (cases, project = proj) => {
    const out = {}
    for (const [label, query, as] of cases) out[label] = project(await items(query, as))
    return out
  }

  describe('GET /libraries/:id/items filters', () => {
    it('progress filters (reader, who has finished / in-progress / hidden / ebook rows)', async function () {
      const filters = ['not-finished', 'not-started', 'finished', 'in-progress', 'audio-in-progress', 'ebook-in-progress', 'ebook-finished', 'unknown-value']
      const out = await runItems(filters.map((v) => [v, `${T}&filter=progress.${b64(v)}`, 'reader']))
      out['no value'] = proj(await items(`${T}&filter=progress`, 'reader'))
      expect(out.finished.rows).to.deep.equal(['Kappa Alone', 'Omicron Ebook', 'Psi Twin', 'The Alpha Quest'])
      expect(out['in-progress'].rows).to.deep.equal(['Beta Chronicle', 'Epsilon Ebook', 'Gamma Ray'])
      expect(out['audio-in-progress'].rows).to.deep.equal(['Beta Chronicle', 'Gamma Ray'])
      expect(out['ebook-in-progress'].rows).to.deep.equal(['Epsilon Ebook'])
      expect(out['ebook-finished'].rows).to.deep.equal(['Omicron Ebook'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('progress filters follow the user: reader2, an admin without progress and a user without explicit access', async function () {
      const filters = ['not-finished', 'not-started', 'finished', 'in-progress', 'audio-in-progress', 'ebook-in-progress', 'ebook-finished']
      const out = {}
      for (const as of ['reader2', 'admin', 'limited']) {
        out[as] = await runItems(filters.map((v) => [v, `${T}&filter=progress.${b64(v)}`, as]))
      }
      expect(out.admin.finished.total).to.equal(0)
      expect(out.admin['not-started'].total).to.equal(21)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('authors, series, narrators, genres, tags, languages, publishers', async function () {
      const cases = [
        ['author ann', `filter=authors.${b64(f.authors.ann.id)}`],
        ['author bob', `filter=authors.${b64(f.authors.bob.id)}`],
        ['author dee', `filter=authors.${b64(f.authors.dee.id)}`],
        ['author of another library', `filter=authors.${b64('00000000-0000-4000-8000-000000000000')}`],
        ['series saga (sequence order is the secondary sort)', `filter=series.${b64(f.series.saga.id)}`],
        ['series mystery', `filter=series.${b64(f.series.mystery.id)}`],
        ['series pair', `filter=series.${b64(f.series.pair.id)}`],
        ['series solo', `filter=series.${b64(f.series.solo.id)}`],
        ['series no-series', `${T}&filter=series.${b64('no-series')}`],
        ['series with unknown id', `filter=series.${b64('nope')}`],
        ['narrator Nora', `${T}&filter=narrators.${b64('Nora Narrator')}`],
        ['narrator with odd characters', `${T}&filter=narrators.${b64('Zoë Z??')}`],
        ['narrator Ned', `${T}&filter=narrators.${b64('Ned Narrator')}`],
        ['narrator unknown', `${T}&filter=narrators.${b64('Nobody')}`],
        ['genre Fantasy', `${T}&filter=genres.${b64('Fantasy')}`],
        ['genre Sci-Fi', `${T}&filter=genres.${b64('Sci-Fi')}`],
        ['genre Mystery', `${T}&filter=genres.${b64('Mystery')}`],
        ['genre unknown', `${T}&filter=genres.${b64('Nope')}`],
        ['tag fav', `${T}&filter=tags.${b64('fav')}`],
        ['tag epic', `${T}&filter=tags.${b64('epic')}`],
        ['tag spicy', `${T}&filter=tags.${b64('spicy')}`],
        ['language English', `${T}&filter=languages.${b64('English')}`],
        ['language Spanish', `${T}&filter=languages.${b64('Spanish')}`],
        ['language German', `${T}&filter=languages.${b64('German')}`],
        ['publisher Orbit', `${T}&filter=publishers.${b64('Orbit')}`],
        ['publisher Tor', `${T}&filter=publishers.${b64('Tor')}`],
        ['publisher Pub B', `${T}&filter=publishers.${b64('Pub B')}`]
      ]
      const out = await runItems(cases.map(([l, q]) => [l, q.includes('sort=') ? q : `${q}`, 'admin']))
      expect(out['author ann'].rows.length).to.equal(4)
      expect(out['narrator with odd characters'].rows).to.deep.equal(['Kappa Alone'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('filter values that are not valid base64 or url encoding', async function () {
      const out = await runItems([
        ['raw (not base64) genre', `${T}&filter=genres.Fantasy`],
        ['broken url encoding', `${T}&filter=genres.%25zz`],
        ['url encoded twice', `${T}&filter=narrators.${encodeURIComponent(b64('Zoë Z??'))}`],
        ['unencoded plus and slash', `${T}&filter=tags.${Buffer.from('fav').toString('base64')}`],
        ['unknown group', `${T}&filter=bogus.${b64('x')}`],
        ['unknown group without value', `${T}&filter=bogus`],
        ['empty filter', `${T}&filter=`],
        ['group without a value: genres', `${T}&filter=genres`],
        ['group without a value: authors', `${T}&filter=authors`],
        ['group without a value: series', `${T}&filter=series`],
        ['group without a value: missing', `${T}&filter=missing`],
        ['group without a value: tracks', `${T}&filter=tracks`],
        ['group without a value: ebooks', `${T}&filter=ebooks`],
        ['group without a value: progress', `${T}&filter=progress`]
      ])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('published decades', async function () {
      const out = await runItems(['1890', '1990', '2000', '2010', '2020', '2030', '1999'].map((d) => [d, `${T}&filter=publishedDecades.${b64(d)}`]))
      expect(out['2000'].rows).to.deep.equal(['Iota Intro', 'Kappa Alone', 'The Alpha Quest', 'Beta Chronicle'].sort())
      matchSnapshot(this, out, { ids: ids() })
    })
    it('missing metadata', async function () {
      const values = ['asin', 'isbn', 'subtitle', 'publishedYear', 'description', 'publisher', 'language', 'cover', 'genres', 'tags', 'narrators', 'chapters', 'authors', 'series', 'something-else']
      const out = await runItems(values.map((v) => [v, `${T}&filter=missing.${b64(v)}`]))
      expect(out.authors.rows).to.deep.equal(['Nu Unknown', 'Zeta Zero'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('missing metadata where empty strings and empty arrays count as missing', async function () {
      await Database.bookModel.update({ asin: '', subtitle: '', coverPath: '', language: '', publishedYear: '', description: '' }, { where: { id: f.items.alpha.book.id } })
      await Database.bookModel.update({ tags: [], genres: [], narrators: [], chapters: [] }, { where: { id: f.items.beta.book.id } })
      const values = ['asin', 'subtitle', 'publishedYear', 'description', 'language', 'cover', 'genres', 'tags', 'narrators', 'chapters']
      const out = await runItems(values.map((v) => [v, `${T}&filter=missing.${b64(v)}`]))
      expect(out.asin.rows).to.include('The Alpha Quest')
      expect(out.chapters.rows).to.include('Beta Chronicle')
      matchSnapshot(this, out, { ids: ids() })
    })
    it('tracks, ebooks, abridged, explicit, issues, recent', async function () {
      const out = await runItems([
        ['tracks none', `${T}&filter=tracks.${b64('none')}`],
        ['tracks single', `${T}&filter=tracks.${b64('single')}`],
        ['tracks multi', `${T}&filter=tracks.${b64('multi')}`],
        ['tracks other value is treated as single', `${T}&filter=tracks.${b64('whatever')}`],
        ['ebooks ebook', `${T}&filter=ebooks.${b64('ebook')}`],
        ['ebooks no-ebook', `${T}&filter=ebooks.${b64('no-ebook')}`],
        ['ebooks supplementary', `${T}&filter=ebooks.${b64('supplementary')}`],
        ['ebooks no-supplementary', `${T}&filter=ebooks.${b64('no-supplementary')}`],
        ['ebooks other value', `${T}&filter=ebooks.${b64('other')}`],
        ['abridged', `${T}&filter=abridged`],
        ['explicit', `${T}&filter=explicit`],
        ['issues (missing or invalid)', `${T}&filter=issues`],
        ['recent (last 60 days)', `${T}&filter=recent`]
      ])
      expect(out['tracks none'].rows).to.deep.equal(['Epsilon Ebook', 'Omicron Ebook', 'Zeta Zero'])
      expect(out['issues (missing or invalid)'].rows).to.deep.equal(['Lambda Missing', 'Mu Invalid'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('feed-open and share-open, with and without include=rssfeed / share', async function () {
      const out = await runItems([
        ['feed-open', `${T}&filter=feed-open`],
        ['feed-open include rssfeed', `${T}&filter=feed-open&include=rssfeed`],
        ['no filter include rssfeed', `${T}&include=rssfeed`],
        ['no filter include RSSFeed (case) and spaces', `${T}&include=%20RSSFeed%20,`],
        ['share-open as admin', `${T}&filter=share-open`],
        ['share-open include share as admin', `${T}&filter=share-open&include=share`],
        ['share-open include share as reader', `${T}&filter=share-open&include=share`, 'reader'],
        ['include unknown', `${T}&include=bogus`]
      ])
      expect(out['feed-open'].rows.length).to.equal(5)
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/items sorting and paging', () => {
    const sorts = ['addedAt', 'size', 'birthtimeMs', 'mtimeMs', 'media.duration', 'media.metadata.publishedYear', 'media.metadata.authorNameLF', 'media.metadata.authorName', 'media.metadata.title']
    it('every sort, ascending and descending', async function () {
      const cases = []
      for (const s of sorts) for (const desc of [0, 1]) cases.push([`${s} ${desc ? 'desc' : 'asc'}`, `sort=${s}&desc=${desc}`])
      const out = await runItems(cases, (res) => proj(res).rows)
      expect(out['media.metadata.title asc'][0]).to.equal('An Apple a Day')
      expect(out['size desc'][0]).to.equal('Beta Chronicle')
      matchSnapshot(this, out, { ids: ids() })
    })
    it('title sort with and without the sortingIgnorePrefix server setting', async function () {
      const out = {}
      out.default = proj(await items(`${T}`)).rows
      global.ServerSettings.sortingIgnorePrefix = true
      out['ignore prefix asc'] = proj(await items(`${T}`)).rows
      out['ignore prefix desc'] = proj(await items(`${T}&desc=1`)).rows
      out['author LF with ignore prefix'] = proj(await items('sort=media.metadata.authorNameLF')).rows
      out['author FL with ignore prefix desc'] = proj(await items('sort=media.metadata.authorName&desc=1')).rows
      out['collapsed by title with ignore prefix'] = proj(await items(`${T}&collapseseries=1`)).rows
      expect(out.default).to.not.deep.equal(out['ignore prefix asc'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('sorting without a sort, with an unknown sort and random', async function () {
      const out = {}
      out['unknown sort (set)'] = sortedProj(await items('sort=bogus'))
      out['no sort (set)'] = sortedProj(await items(''))
      out.random = sortedProj(await items('sort=random'))
      out['random paged'] = { count: (await items('sort=random&limit=5&page=1')).body.results.length }
      expect(out.random.rows).to.deep.equal(out['no sort (set)'].rows)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('sequence sort needs a series filter, otherwise it falls back to title', async function () {
      const saga = `filter=series.${b64(f.series.saga.id)}`
      const out = await runItems([
        ['series saga sort=sequence asc', `${saga}&sort=sequence`],
        ['series saga sort=sequence desc', `${saga}&sort=sequence&desc=1`],
        ['series saga sort=title', `${saga}&${T}`],
        ['series saga sort=title desc', `${saga}&${T}&desc=1`],
        ['series saga sort=size (secondary sort by sequence)', `${saga}&sort=size`],
        ['series mystery sequence desc', `filter=series.${b64(f.series.mystery.id)}&sort=sequence&desc=1`],
        ['series pair sequence asc (null sequence last)', `filter=series.${b64(f.series.pair.id)}&sort=sequence`],
        ['series pair sequence desc (null sequence first)', `filter=series.${b64(f.series.pair.id)}&sort=sequence&desc=1`],
        ['sequence without a series filter', 'sort=sequence'],
        ['sequence with a genre filter', `sort=sequence&filter=genres.${b64('Fantasy')}`]
        // (sort=sequence with filter series.no-series never answers: the order refers to a column that query does not select)
      ])
      expect(out['series saga sort=sequence asc'].rows.map((r) => r.split(' (')[0])).to.deep.equal(['The Alpha Quest', 'Eta Interlude', 'Beta Chronicle', 'Gamma Ray'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('progress sorts for a reader (with and without a progress filter)', async function () {
      const filtered = ['finished', 'in-progress', 'not-finished', 'ebook-finished']
      const cases = []
      for (const s of ['progress', 'progress.createdAt', 'progress.finishedAt']) {
        for (const desc of [0, 1]) {
          cases.push([`${s} desc=${desc} filter finished`, `sort=${s}&desc=${desc}&filter=progress.${b64('finished')}`, 'reader'])
          // (in-progress rows have no finishedAt: they would tie)
          if (s !== 'progress.finishedAt') cases.push([`${s} desc=${desc} filter in-progress`, `sort=${s}&desc=${desc}&filter=progress.${b64('in-progress')}`, 'reader'])
        }
      }
      const out = await runItems(cases, (res) => proj(res).rows)
      // without a progress filter the books with progress come first, the rest tie (so only the head is stable)
      for (const s of ['progress', 'progress.createdAt', 'progress.finishedAt']) {
        for (const desc of [0, 1]) out[`${s} desc=${desc} unfiltered head`] = proj(await items(`sort=${s}&desc=${desc}`, 'reader')).rows.slice(0, s === 'progress.finishedAt' ? 4 : 9)
      }
      out['progress, reader2, filter not-finished head'] = proj(await items(`sort=progress&filter=progress.${b64(filtered[2])}`, 'reader2')).rows.slice(0, 1)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('limit, page and total', async function () {
      const out = await runItems([
        ['limit 4 page 0', `${T}&limit=4&page=0`],
        ['limit 4 page 1', `${T}&limit=4&page=1`],
        ['limit 4 page 3 (last, partial)', `${T}&limit=4&page=3`],
        ['limit 4 page 4 (past the end)', `${T}&limit=4&page=4`],
        ['limit 5 page 2 desc', `${T}&limit=5&page=2&desc=1`],
        ['limit 1 page 13', `${T}&limit=1&page=13`],
        ['limit 100', `${T}&limit=100`],
        ['limit 0', `${T}&limit=0&page=3`],
        ['page without limit', `${T}&page=2`],
        ['filtered paging (no count cache)', `${T}&limit=2&page=1&filter=genres.${b64('Fantasy')}`],
        ['restricted user paging', `${T}&limit=3&page=1`, 'limited']
      ])
      expect(out['limit 4 page 1'].rows.length).to.equal(4)
      expect(out['limit 4 page 3 (last, partial)'].count).to.equal(4)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('payload fields echo the query (minified, collapseseries, include, filterBy)', async function () {
      const res = await items(`${T}&limit=2&page=1&minified=1&collapseseries=1&include=rssfeed,share&desc=1&filter=progress.${b64('finished')}`, 'reader')
      const body = { ...res.body, results: res.body.results.map(row) }
      body.filterBy = Buffer.from(decodeURIComponent(body.filterBy.split('.')[1]), 'base64').toString()
      expect(res.body.minified).to.equal(true)
      matchSnapshot(this, body, { ids: ids() })
    })
    it('whole item bodies (first page, with and without collapseseries, series filter)', async function () {
      const out = {
        plain: (await items(`${T}&limit=3&include=rssfeed`)).body.results,
        collapsed: (await items(`${T}&desc=1&limit=3&collapseseries=1&include=rssfeed`)).body.results,
        seriesFilter: (await items(`filter=series.${b64(f.series.saga.id)}&limit=2`)).body.results
      }
      expect(out.collapsed.some((r) => r.collapsedSeries)).to.equal(true)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('the unfiltered count is cached: a change that skips the Book hooks is not seen until the query changes', async function () {
      const first = await items(`${T}&limit=2`)
      await Database.libraryItemModel.update({ libraryId: f.other.library.id }, { where: { id: f.items.nu.libraryItem.id } })
      const second = await items(`${T}&limit=2`)
      const differentQuery = await items(`${T}&limit=3`)
      const filtered = await items(`${T}&filter=issues`)
      const otherSort = await items('sort=size&limit=2')
      const other = { before: first.body.total, afterCached: second.body.total, sameQueryOtherLimit: differentQuery.body.total, otherSort: otherSort.body.total, rowsActuallyInLibrary: (await items(`${T}`)).body.results.length }
      expect(other.afterCached).to.equal(other.before)
      matchSnapshot(this, { ...other, filtered: proj(filtered) }, { ids: ids() })
    })
    it('a restricted user does not use the count cache', async function () {
      const first = await items(`${T}`, 'limited')
      await Database.libraryItemModel.update({ libraryId: f.other.library.id }, { where: { id: f.items.apple.libraryItem.id } })
      const second = await items(`${T}`, 'limited')
      expect([first.body.total, second.body.total]).to.deep.equal([17, 16])
      matchSnapshot(this, { before: proj(first), after: proj(second) }, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/items permissions', () => {
    it('explicit and tag restrictions', async function () {
      const out = {}
      for (const as of ['admin', 'reader', 'limited', 'tagsel', 'tagdeny', 'tagonly', 'guest', 'user']) {
        const cases = [
          ['all', T],
          ['explicit filter', `${T}&filter=explicit`],
          ['tag fav filter', `${T}&filter=tags.${b64('fav')}`],
          ['series saga', `filter=series.${b64(f.series.saga.id)}`],
          ['no-series', `${T}&filter=series.${b64('no-series')}`],
          ['missing authors', `${T}&filter=missing.${b64('authors')}`],
          ['collapsed', `${T}&collapseseries=1`]
        ]
        out[as] = await runItems(cases.map(([l, q]) => [l, q, as]))
      }
      expect(out.limited.all.rows).to.not.include('Iota Intro')
      expect(out.limited.all.rows).to.not.include('Nu Unknown')
      expect(out.tagsel.all.rows).to.deep.equal(['Epsilon Ebook', 'Beta Chronicle', 'Kappa Alone', 'The Alpha Quest', 'Theta Tale'].sort((a, b) => a.localeCompare(b)))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('users restricted to another library are refused', async function () {
      const res = await items(T, 'otherOnly')
      const other = await get(`/api/libraries/${f.other.library.id}/items?${T}`, 'otherOnly')
      const ownLibrary = await get(`/api/libraries/${f.other.library.id}/items?${T}`, 'admin')
      expect(res.status).to.equal(403)
      matchSnapshot(this, { refused: res.status, other: proj(other), admin: proj(ownLibrary) }, { ids: ids() })
    })
  })

  describe('collapseseries', () => {
    it('collapses each series to its first book, with sorts and paging', async function () {
      const out = await runItems([
        ['title asc', `${T}&collapseseries=1`],
        ['title desc', `${T}&collapseseries=1&desc=1`],
        ['addedAt desc', 'sort=addedAt&desc=1&collapseseries=1'],
        ['size asc', 'sort=size&collapseseries=1'],
        ['duration desc', 'sort=media.duration&desc=1&collapseseries=1'],
        ['author LF', 'sort=media.metadata.authorNameLF&collapseseries=1'],
        ['paged 4 page 1', `${T}&collapseseries=1&limit=4&page=1`],
        ['paged 4 page 2', `${T}&collapseseries=1&limit=4&page=2`]
      ])
      expect(out['title asc'].total).to.equal(11)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('collapses with each filter group (progress filters use the series level query)', async function () {
      const progress = ['not-finished', 'not-started', 'finished', 'in-progress', 'audio-in-progress', 'ebook-in-progress', 'ebook-finished', 'unknown']
      const cases = progress.map((v) => [`progress ${v}`, `${T}&collapseseries=1&filter=progress.${b64(v)}`, 'reader'])
      cases.push(
        ['progress finished (reader2)', `${T}&collapseseries=1&filter=progress.${b64('finished')}`, 'reader2'],
        ['progress not-started (reader2)', `${T}&collapseseries=1&filter=progress.${b64('not-started')}`, 'reader2'],
        ['missing authors', `${T}&collapseseries=1&filter=missing.${b64('authors')}`],
        ['missing series', `${T}&collapseseries=1&filter=missing.${b64('series')}`],
        ['genre Fantasy', `${T}&collapseseries=1&filter=genres.${b64('Fantasy')}`],
        ['genre Mystery', `${T}&collapseseries=1&filter=genres.${b64('Mystery')}`],
        ['narrator Nora', `${T}&collapseseries=1&filter=narrators.${b64('Nora Narrator')}`],
        ['author ann', `${T}&collapseseries=1&filter=authors.${b64(f.authors.ann.id)}`],
        ['tracks multi', `${T}&collapseseries=1&filter=tracks.${b64('multi')}`],
        ['ebooks ebook', `${T}&collapseseries=1&filter=ebooks.${b64('ebook')}`],
        ['issues', `${T}&collapseseries=1&filter=issues`],
        ['recent', `${T}&collapseseries=1&filter=recent`],
        ['feed-open', `${T}&collapseseries=1&filter=feed-open`],
        ['feed-open include rssfeed', `${T}&collapseseries=1&filter=feed-open&include=rssfeed`],
        ['abridged', `${T}&collapseseries=1&filter=abridged`],
        ['series no-series', `${T}&collapseseries=1&filter=series.${b64('no-series')}`],
        ['series saga (collapse is switched off)', `collapseseries=1&filter=series.${b64(f.series.saga.id)}`]
      )
      const out = await runItems(cases)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('collapses for restricted users and with the single-book-series setting', async function () {
      const cases = []
      for (const as of ['limited', 'tagsel', 'tagdeny', 'tagonly', 'reader']) cases.push([as, `${T}&collapseseries=1`, as])
      const out = await runItems(cases)
      await f.lf.library.update({ settings: { ...f.lf.library.settings, hideSingleBookSeries: true } })
      out['hideSingleBookSeries set'] = proj(await items(`${T}&collapseseries=1`))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('collapse of a sub-series filter goes through the library helper', async function () {
      const saga = `filter=series.${b64(f.series.saga.id)}&collapseseries=1`
      const out = await runItems([
        ['default sort', saga],
        ['sort=sequence desc', `${saga}&sort=sequence&desc=1`],
        ['sort=title', `${saga}&${T}`],
        ['invalid sort is ignored', `${saga}&sort=bogus`],
        ['restricted user', saga, 'limited'],
        ['unknown series', `filter=series.${b64('nope')}&collapseseries=1`]
      ])
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/personalized', () => {
    const shelfRow = (e) => {
      if (e.books) return `${e.name} [${e.books.map(titleOf).join(', ')}]${e.rssFeed ? ` {feed ${e.rssFeed.feedUrl}}` : ''}`
      if (e.numBooks !== undefined && e.media === undefined) return `${e.name} (${e.numBooks} books)`
      const se = e.media.metadata.series
      return `${titleOf(e)}${se ? ` (series ${se.name} #${se.sequence})` : ''}${e.rssFeed ? ` {feed ${e.rssFeed.feedUrl}}` : ''}${e.mediaItemShare ? ' {share}' : ''}`
    }
    const shelves = (res) => (res.status === 200 ? res.body.map((s) => ({ id: s.id, label: s.label, type: s.type, total: s.total, entities: s.id === 'discover' ? s.entities.map(shelfRow).sort() : s.entities.map(shelfRow) })) : { status: res.status, body: res.body })
    const personalized = (query = '', as) => get(`${L()}/personalized?${query}`, as)

    it('shelves for readers with different progress', async function () {
      const out = {}
      for (const as of ['reader', 'reader2', 'admin', 'limited']) out[as] = shelves(await personalized('limit=20', as))
      expect(out.reader.map((s) => s.id)).to.include.members(['continue-listening', 'continue-reading', 'continue-series', 'recently-added', 'recent-series', 'discover', 'listen-again', 'read-again', 'newest-authors'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('shelves for restricted users', async function () {
      const out = {}
      for (const as of ['tagsel', 'tagdeny', 'tagonly', 'guest', 'user']) out[as] = shelves(await personalized('limit=20', as))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('the limit applies per shelf, default is 10, recent-series is always 5', async function () {
      const out = {}
      for (const limit of ['1', '2', '3']) out[`limit ${limit}`] = shelves(await personalized(`limit=${limit}`, 'reader'))
      out['default limit'] = shelves(await personalized('', 'reader')).map((s) => ({ id: s.id, total: s.total, n: s.entities.length }))
      const discover = out['limit 2'].find((s) => s.id === 'discover')
      expect(discover.entities.length).to.equal(2)
      // the discover shelf picks at random: only its size and total are stable when the limit is below the candidates
      for (const k of Object.keys(out).filter((x) => x.startsWith('limit'))) out[k] = out[k].map((s) => (s.id === 'discover' ? { id: s.id, total: s.total, n: s.entities.length } : s))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('include=rssfeed and include=share', async function () {
      const out = {}
      out.rssfeed = shelves(await personalized('limit=20&include=rssfeed', 'admin'))
      out['rssfeed + share (admin)'] = shelves(await personalized('limit=20&include=rssfeed,share', 'admin'))
      out['share (reader)'] = shelves(await personalized('limit=20&include=share', 'reader'))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('onlyShowLaterBooksInContinueSeries shows only books after the last finished one', async function () {
      const out = {}
      const settings = f.lf.library.settings
      out.off = shelves(await personalized('limit=20', 'reader')).find((s) => s.id === 'continue-series')
      await f.lf.library.update({ settings: { ...settings, onlyShowLaterBooksInContinueSeries: true } })
      out.on = shelves(await personalized('limit=20', 'reader')).find((s) => s.id === 'continue-series')
      out['on, reader2 (no later book after the last finished)'] = shelves(await personalized('limit=20', 'reader2')).find((s) => s.id === 'continue-series') || null
      expect(out.on.entities).to.not.deep.equal(out.off.entities)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('continue series: hidden series, none in progress, restrictions', async function () {
      const out = {}
      // reader2 hides the Mystery trio; un-hide it and add a finished Saga book
      out['reader2 (mystery hidden)'] = shelves(await personalized('limit=20', 'reader2')).find((s) => s.id === 'continue-series') || null
      await Database.userModel.update({ extraData: { seriesHideFromContinueListening: [] } }, { where: { id: f.users.reader2.id } })
      out['reader2 stored un-hidden (cached user is unchanged)'] = shelves(await personalized('limit=20', 'reader2')).find((s) => s.id === 'continue-series') || null
      // a finished book with another in progress in the same series removes it from the shelf
      await createProgress(f.users.admin, f.items.gamma.book, { isFinished: true })
      await createProgress(f.users.admin, f.items.kappa.book, { isFinished: true })
      out['admin: finished gamma, kappa'] = shelves(await personalized('limit=20', 'admin')).find((s) => s.id === 'continue-series') || null
      matchSnapshot(this, out, { ids: ids() })
    })
    it('recent series respects hideSingleBookSeries and the 60 day window', async function () {
      const out = {}
      out.default = shelves(await personalized('limit=20', 'admin')).find((s) => s.id === 'recent-series')
      await f.lf.library.update({ settings: { ...f.lf.library.settings, hideSingleBookSeries: true } })
      out.hideSingleBookSeries = shelves(await personalized('limit=20', 'admin')).find((s) => s.id === 'recent-series')
      out.limited = shelves(await personalized('limit=20', 'limited')).find((s) => s.id === 'recent-series')
      out['tag restricted'] = shelves(await personalized('limit=20', 'tagsel')).find((s) => s.id === 'recent-series')
      out['tag denylist'] = shelves(await personalized('limit=20', 'tagdeny')).find((s) => s.id === 'recent-series')
      out['explicit and tags'] = shelves(await personalized('limit=20', 'tagonly')).find((s) => s.id === 'recent-series') || null
      matchSnapshot(this, out, { ids: ids() })
    })
    it('a user without a hide-from-continue-listening list, and a user with nothing left to discover', async function () {
      const out = {}
      out.bare = shelves(await personalized('limit=20', 'bare')).map((x) => ({ id: x.id, total: x.total, n: x.entities.length }))
      const tagonly = shelves(await personalized('limit=20', 'tagonly'))
      out.tagonly = tagonly.map((x) => ({ id: x.id, total: x.total, entities: x.entities }))
      expect(tagonly.find((x) => x.id === 'discover')).to.equal(undefined)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('continue series for a user who cannot see the remaining books', async function () {
      const out = {}
      const cs = async (as) => shelves(await personalized('limit=20', as)).find((x) => x.id === 'continue-series') || null
      out.limited = await cs('limited')
      await f.lf.library.update({ settings: { ...f.lf.library.settings, onlyShowLaterBooksInContinueSeries: true } })
      out['limited, only later books'] = await cs('limited')
      out['reader, only later books'] = await cs('reader')
      matchSnapshot(this, out, { ids: ids() })
    })
    it('a series whose book has no library item is listed without it', async function () {
      const orphanSeries = await Database.seriesModel.create({ name: 'Orphans', nameIgnorePrefix: 'Orphans', libraryId: f.lf.library.id })
      const orphan = await Database.bookModel.create({ title: 'Orphan', audioFiles: [], tags: [], narrators: [], genres: [], chapters: [], explicit: false })
      await Database.bookSeriesModel.create({ bookId: orphan.id, seriesId: orphanSeries.id, sequence: '1' })
      const shelf = shelves(await personalized('limit=20', 'admin')).find((x) => x.id === 'recent-series')
      expect(shelf.entities).to.include('Orphans []')
      matchSnapshot(this, shelf, { ids: ids() })
    })
    it('include=share decorates the shelf entries of an admin with progress', async function () {
      const out = {}
      out.withShare = shelves(await personalized('limit=20&include=share,rssfeed', 'admin2'))
      out.withoutShare = shelves(await personalized('limit=20&include=rssfeed', 'admin2'))
      expect(out.withShare.find((x) => x.id === 'continue-listening').entities[0]).to.contain('{share}')
      matchSnapshot(this, out, { ids: ids() })
    })
    it('an empty book library has no shelves, no items and zero stats', async function () {
      const empty = await createLibrary({ name: 'Nothing', path: '/test/nothing' })
      await empty.library.update({ settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('book') })
      const base = `/api/libraries/${empty.library.id}`
      const out = {
        personalized: (await get(`${base}/personalized?limit=5`, 'admin')).body,
        items: proj(await get(`${base}/items?limit=5&sort=media.metadata.title`)),
        collapsed: proj(await get(`${base}/items?collapseseries=1&sort=media.metadata.title`)),
        series: (await get(`${base}/series?limit=5&sort=name`)).body.total,
        stats: (await get(`${base}/stats`)).body,
        filterdata: (await get(`${base}/filterdata`)).body,
        search: (await get(`${base}/search?q=a`)).body
      }
      out.filterdata.loadedAt = typeof out.filterdata.loadedAt
      matchSnapshot(this, out, { ids: new Map([...f.names, [empty.library.id, '<empty>']]) })
    })
    it('recently added entries without audio take their size from the library item', async function () {
      const res = await personalized('limit=30', 'admin')
      const recent = res.body.find((x) => x.id === 'recently-added')
      const sizes = Object.fromEntries(recent.entities.map((e) => [titleOf(e), e.media.size]))
      expect(sizes['Zeta Zero']).to.equal(10)
      matchSnapshot(this, sizes, { ids: ids() })
    })
    it('whole shelf bodies for one reader', async function () {
      const res = await personalized('limit=2&include=rssfeed', 'reader')
      const body = res.body.map((s) => (s.id === 'discover' ? { id: s.id, n: s.entities.length, total: s.total } : s))
      matchSnapshot(this, body, { ids: ids() })
    })
    it('an empty library has no shelves, a library nobody can see is refused', async function () {
      const emptyLib = await get(`/api/libraries/${f.other.library.id}/personalized`, 'reader')
      const refused = await get(`${L()}/personalized`, 'otherOnly')
      expect(refused.status).to.equal(403)
      matchSnapshot(this, { other: shelves(emptyLib), refused: refused.status }, { ids: ids() })
    })
    it('library without any progress still shows recently added, discover and newest authors', async function () {
      const res = await personalized('limit=3', 'admin')
      const out = shelves(res).map((s) => (s.id === 'discover' ? { id: s.id, total: s.total, n: s.entities.length } : s))
      expect(out.map((s) => s.id)).to.deep.equal(['recently-added', 'recent-series', 'discover', 'newest-authors'])
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/series', () => {
    const seriesRow = (s) => `${s.name} [${s.books.map(titleOf).join(', ')}]${s.totalDuration ? ` dur=${s.totalDuration}` : ''}${s.rssFeed ? ` {feed ${s.rssFeed.feedUrl}}` : ''}`
    const sproj = (res) => (res.status === 200 ? { total: res.body.total, count: res.body.results.length, rows: res.body.results.map(seriesRow) } : { status: res.status, body: res.body })
    const listSeries = async (cases) => {
      const out = {}
      for (const [label, query, as] of cases) out[label] = sproj(await get(`${L()}/series?limit=50&${query}`, as))
      return out
    }
    it('sorts', async function () {
      const cases = []
      for (const s of ['name', 'numBooks', 'addedAt', 'totalDuration', 'lastBookAdded', 'lastBookUpdated']) for (const desc of [0, 1]) cases.push([`${s} desc=${desc}`, `sort=${s}&desc=${desc}`])
      const out = await listSeries(cases)
      out.random = { ...sproj(await get(`${L()}/series?limit=50&sort=random`)), rows: undefined }
      out['no sort (set)'] = { ...sproj(await get(`${L()}/series?limit=50`)), rows: sproj(await get(`${L()}/series?limit=50`)).rows.sort() }
      global.ServerSettings.sortingIgnorePrefix = true
      out['name, ignore prefix asc'] = sproj(await get(`${L()}/series?limit=50&sort=name`))
      out['name, ignore prefix desc'] = sproj(await get(`${L()}/series?limit=50&sort=name&desc=1`))
      expect(out['name desc=0'].rows[0]).to.match(/^Adults/)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('filters by genre, tag, author, narrator, publisher and language', async function () {
      const out = await listSeries([
        ['genres Fantasy', `sort=name&filter=genres.${b64('Fantasy')}`],
        ['genres Mystery', `sort=name&filter=genres.${b64('Mystery')}`],
        ['genres unknown', `sort=name&filter=genres.${b64('Nope')}`],
        ['tags fav', `sort=name&filter=tags.${b64('fav')}`],
        ['tags spicy', `sort=name&filter=tags.${b64('spicy')}`],
        ['authors ann', `sort=name&filter=authors.${b64(f.authors.ann.id)}`],
        ['authors dee', `sort=name&filter=authors.${b64(f.authors.dee.id)}`],
        ['narrators Nora', `sort=name&filter=narrators.${b64('Nora Narrator')}`],
        ['narrators Ned', `sort=name&filter=narrators.${b64('Ned Narrator')}`],
        ['narrators with odd characters', `sort=name&filter=narrators.${b64('Zoë Z??')}`],
        ['publishers Orbit', `sort=name&filter=publishers.${b64('Orbit')}`],
        ['publishers Pub B', `sort=name&filter=publishers.${b64('Pub B')}`],
        ['languages Spanish', `sort=name&filter=languages.${b64('Spanish')}`],
        ['languages German', `sort=name&filter=languages.${b64('German')}`],
        ['unknown group', `sort=name&filter=bogus.${b64('x')}`],
        ['broken encoding', `sort=name&filter=genres.%25zz`],
        ['url encoded twice', `sort=name&filter=narrators.${encodeURIComponent(b64('Zoë Z??'))}`]
      ])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('filters by progress for different users', async function () {
      const cases = []
      for (const as of ['reader', 'reader2', 'admin']) for (const v of ['not-finished', 'finished', 'not-started', 'in-progress', 'unknown']) cases.push([`${as} ${v}`, `sort=name&filter=progress.${b64(v)}`, as])
      const out = await listSeries(cases)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('respects explicit and tag restrictions', async function () {
      const cases = []
      for (const as of ['limited', 'tagsel', 'tagdeny', 'tagonly']) {
        cases.push([`${as} all`, 'sort=name', as])
        cases.push([`${as} genres Thriller`, `sort=name&filter=genres.${b64('Thriller')}`, as])
        cases.push([`${as} progress finished`, `sort=name&filter=progress.${b64('finished')}`, as])
        cases.push([`${as} progress in-progress`, `sort=name&filter=progress.${b64('in-progress')}`, as])
      }
      const out = await listSeries(cases)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('include=rssfeed, hideSingleBookSeries and paging', async function () {
      const out = await listSeries([
        ['rssfeed', 'sort=name&include=rssfeed'],
        ['rssfeed (case and spaces)', 'sort=name&include=%20RssFeed']
      ])
      for (const [label, query] of [
        ['page 0 of 3', 'sort=name&limit=3&page=0'],
        ['page 1 of 3', 'sort=name&limit=3&page=1'],
        ['page 5 of 3', 'sort=name&limit=3&page=5'],
        ['desc page 1 of 3', 'sort=name&limit=3&page=1&desc=1']
      ]) {
        out[label] = sproj(await get(`${L()}/series?${query}`))
      }
      out['no limit returns an empty page but a total'] = sproj(await get(`${L()}/series?sort=name`))
      await f.lf.library.update({ settings: { ...f.lf.library.settings, hideSingleBookSeries: true } })
      out['hideSingleBookSeries'] = sproj(await get(`${L()}/series?limit=50&sort=name`))
      out['hideSingleBookSeries + genre filter'] = sproj(await get(`${L()}/series?limit=50&sort=name&filter=genres.${b64('Fantasy')}`))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('whole series bodies', async function () {
      const res = await get(`${L()}/series?limit=2&sort=totalDuration&include=rssfeed`)
      matchSnapshot(this, res.body, { ids: ids() })
    })
    it('series books are ordered by sequence (numeric, empty last)', async function () {
      const res = await get(`${L()}/series?limit=50&sort=name`)
      const saga = res.body.results.find((s) => s.name === 'The Saga')
      const pair = res.body.results.find((s) => s.name === 'Pair')
      expect(saga.books.map(titleOf)).to.deep.equal(['The Alpha Quest', 'Eta Interlude', 'Beta Chronicle', 'Gamma Ray'])
      expect(pair.books.map(titleOf)).to.deep.equal(['Iota Intro', 'Eta Interlude'])
      matchSnapshot(this, { saga: saga.books.map(row), pair: pair.books.map(row) }, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/series/:seriesId', () => {
    const seriesBody = async (id, query = '', as = 'admin') => {
      const res = await get(`${L()}/series/${id}?${query}`, as)
      return res.status === 200 ? res.body : { status: res.status }
    }
    it('series with progress and feed for different users', async function () {
      const out = {
        'admin plain': await seriesBody(f.series.saga.id),
        'reader progress': await seriesBody(f.series.saga.id, 'include=progress', 'reader'),
        'reader mystery progress+rssfeed': await seriesBody(f.series.mystery.id, 'include=progress,rssfeed', 'reader'),
        'reader2 mystery progress': await seriesBody(f.series.mystery.id, 'include=progress', 'reader2'),
        'limited pair progress (restricted book hidden)': await seriesBody(f.series.pair.id, 'include=progress', 'limited'),
        'tagsel saga progress': await seriesBody(f.series.saga.id, 'include=progress', 'tagsel'),
        'series of another library': await seriesBody(f.series.saga.id, '', 'admin').then(async () => (await get(`/api/libraries/${f.other.library.id}/series/${f.series.saga.id}`)).status),
        unknown: (await get(`${L()}/series/nope`)).status
      }
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('GET /series/:id (SeriesController)', () => {
    it('answers only for series with a book the user may see, with progress for that user', async function () {
      const out = {}
      for (const [as, series] of [
        ['admin', 'pair'],
        ['limited', 'pair'],
        ['tagsel', 'pair'],
        ['tagdeny', 'pair'],
        ['reader', 'saga'],
        ['reader2', 'mystery'],
        ['tagsel', 'saga'],
        ['tagonly', 'mystery']
      ]) {
        const res = await get(`/api/series/${f.series[series].id}?include=progress`, as)
        out[`${as} ${series}`] = res.status === 200 ? { name: res.body.name, progress: res.body.progress } : { status: res.status }
      }
      out.unknown = (await get('/api/series/nope')).status
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('direct calls', () => {
    const libraryFilters = require('../../server/utils/queries/libraryFilters')
    const libraryItemsBookFilters = require('../../server/utils/queries/libraryItemsBookFilters')
    const describeWhere = (q) => ({ clauses: q.bookWhere.length, replacements: q.replacements })
    it('getUserPermissionBookWhereQuery builds one clause per restriction', async function () {
      const user = (explicit, perms) => ({ canAccessExplicitContent: explicit, permissions: { accessAllTags: true, itemTagsSelected: [], selectedTagsNotAccessible: false, ...perms } })
      const out = {
        'no user': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(null)),
        'no restrictions': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(true))),
        'no explicit': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(false))),
        'tag allowlist': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(true, { accessAllTags: false, itemTagsSelected: ['a', 'b'] }))),
        'tag denylist': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(true, { accessAllTags: false, itemTagsSelected: ['a'], selectedTagsNotAccessible: true }))),
        'tags selected but all tags allowed': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(true, { accessAllTags: true, itemTagsSelected: ['a'] }))),
        'all tags not allowed but none selected': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(true, { accessAllTags: false, itemTagsSelected: [] }))),
        'both restrictions': describeWhere(libraryItemsBookFilters.getUserPermissionBookWhereQuery(user(false, { accessAllTags: false, itemTagsSelected: ['a'] })))
      }
      expect(out['both restrictions'].clauses).to.equal(2)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('getMediaGroupQuery without a group or with an unknown group has no conditions', async function () {
      const none = libraryItemsBookFilters.getMediaGroupQuery(null, 'x')
      const unknown = libraryItemsBookFilters.getMediaGroupQuery('bogus', 'x')
      const missing = libraryItemsBookFilters.getMediaGroupQuery('missing', 'bogus')
      expect(Object.keys(none.mediaWhere)).to.deep.equal([])
      matchSnapshot(this, { none: [Object.keys(none.mediaWhere), none.replacements], unknown: [Object.keys(unknown.mediaWhere), unknown.replacements], missing: [Object.keys(missing.mediaWhere), missing.replacements], genres: libraryItemsBookFilters.getMediaGroupQuery('genres', 'Fantasy').replacements }, { ids: ids() })
    })
    it('getOrder maps every sort to its column and direction', async function () {
      const show = (order) => JSON.parse(JSON.stringify(order, (k, v) => (typeof v === 'function' ? undefined : v)))
      const out = {}
      for (const sortBy of ['addedAt', 'size', 'birthtimeMs', 'mtimeMs', 'media.duration', 'media.metadata.publishedYear', 'media.metadata.authorNameLF', 'media.metadata.authorName', 'media.metadata.title', 'sequence', 'progress', 'progress.createdAt', 'progress.finishedAt', 'bogus', undefined]) {
        out[`${sortBy} asc`] = show(libraryItemsBookFilters.getOrder(sortBy, false, false))
        out[`${sortBy} desc`] = show(libraryItemsBookFilters.getOrder(sortBy, true, false))
      }
      out['title collapsed'] = show(libraryItemsBookFilters.getOrder('media.metadata.title', false, true))
      global.ServerSettings.sortingIgnorePrefix = true
      out['title ignore prefix'] = show(libraryItemsBookFilters.getOrder('media.metadata.title', true, false))
      out['title collapsed ignore prefix'] = show(libraryItemsBookFilters.getOrder('media.metadata.title', true, true))
      out['authorNameLF ignore prefix'] = show(libraryItemsBookFilters.getOrder('media.metadata.authorNameLF', false, false))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('getLibraryItemsForCollection (not used by any route) returns the books of the collection', async function () {
      const collection = { books: [f.items.theta.libraryItem.id, f.items.alpha.libraryItem.id, f.items.zeta.libraryItem.id] }
      const fromBookFilters = await libraryItemsBookFilters.getLibraryItemsForCollection(collection)
      const fromLibraryFilters = await libraryFilters.getLibraryItemsForCollection(collection)
      const empty = await libraryItemsBookFilters.getLibraryItemsForCollection({ books: [] })
      const missing = await libraryFilters.getLibraryItemsForCollection(undefined)
      const out = {
        bookFilters: fromBookFilters.map((li) => ({ title: li.media.title, authors: li.media.authors.map((a) => a.name), series: li.media.series.map((se) => `${se.name} #${se.bookSeries.sequence}`) })).sort((a, b) => a.title.localeCompare(b.title)),
        sameFromLibraryFilters: fromLibraryFilters.map((li) => li.media.title).sort(),
        empty,
        missing
      }
      expect(out.bookFilters).to.have.length(3)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('getFilteredLibraryItems keeps the sub-series filter uncollapsed even when asked to collapse', async function () {
      const run = async (collapse, sortBy) => {
        const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(f.lf.library.id, f.users.admin, 'series', f.series.saga.id, sortBy, false, collapse, [], 50, 0)
        return { count, rows: libraryItems.map((li) => `${li.media.title}${li.collapsedSeries ? ` [collapsed ${li.collapsedSeries.name}]` : ''}${li.series ? ` (series ${li.series.name} #${li.series.sequence})` : ''}`) }
      }
      const out = { plain: await run(false, 'sequence'), collapse: await run(true, 'sequence'), 'collapse, title sort': await run(true, 'media.metadata.title') }
      expect(out.collapse).to.deep.equal(out.plain)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('getLibraryItemsForSeries without a user applies no restrictions', async function () {
      const all = await libraryItemsBookFilters.getLibraryItemsForSeries(f.series.pair)
      const limited = await libraryItemsBookFilters.getLibraryItemsForSeries(f.series.pair, f.users.limited)
      matchSnapshot(this, { all: all.map((li) => li.media.title), limited: limited.map((li) => li.media.title) }, { ids: ids() })
    })
    it('decode reverses url encoding and base64, and returns null for a broken escape (library and series filters)', async function () {
      const seriesFilters = require('../../server/utils/queries/seriesFilters')
      const encoded = encodeURIComponent(Buffer.from('Zoë Z??').toString('base64'))
      matchSnapshot(this, { library: libraryFilters.decode(encoded), libraryBroken: libraryFilters.decode('%E0%A4%A'), series: seriesFilters.decode(encoded), seriesBroken: seriesFilters.decode('%E0%A4%A') }, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/filterdata', () => {
    const cache = () => Database.libraryFilterData[f.lf.library.id]
    it('collects the sorted filter values of the library', async function () {
      const res = await get(`${L()}/filterdata`)
      const body = res.body
      expect(body.numIssues).to.equal(2)
      expect(body.publishedDecades).to.deep.equal(['1890', '1990', '2000', '2010', '2020'])
      matchSnapshot(this, body, { ids: ids() })
    })
    it('is not restricted by the user (a user without explicit access sees every value)', async function () {
      const limited = await get(`${L()}/filterdata`, 'limited')
      const admin = await get(`${L()}/filterdata`, 'admin')
      expect(limited.body.tags).to.include('spicy')
      matchSnapshot(this, { limited: limited.body.tags, same: JSON.stringify(limited.body) === JSON.stringify(admin.body), other: (await get(`/api/libraries/${f.other.library.id}/filterdata`, 'reader')).body }, { ids: ids() })
    })
    it('valid published years are 1 to 2999', async function () {
      await Database.bookModel.update({ publishedYear: '3000' }, { where: { id: f.items.lambda.book.id } })
      await Database.bookModel.update({ publishedYear: '0' }, { where: { id: f.items.nu.book.id } })
      await Database.bookModel.update({ publishedYear: '2999' }, { where: { id: f.items.theta.book.id } })
      await Database.bookModel.update({ publishedYear: '10' }, { where: { id: f.items.apple.book.id } })
      await Database.bookModel.update({ publishedYear: '-50' }, { where: { id: f.items.eta.book.id } })
      const res = await get(`${L()}/filterdata`)
      matchSnapshot(this, { decades: res.body.publishedDecades }, { ids: ids() })
    })
    it('series without a name are listed as "No Title"; empty strings and nulls are skipped', async function () {
      await Database.seriesModel.update({ name: null }, { where: { id: f.series.solo.id } })
      await Database.bookModel.update({ publisher: '', language: '', tags: null, genres: null, narrators: null }, { where: { id: f.items.zeta.book.id } })
      const res = await get(`${L()}/filterdata`)
      matchSnapshot(this, { series: res.body.series, publishers: res.body.publishers, languages: res.body.languages }, { ids: ids() })
    })
    // the filter data is reloaded when it is older than 30 minutes AND (a book and its library item, a series or an author has an
    // updatedAt after the last load, or the book / series / author counts differ). These helpers age the rows without touching hooks.
    const DAY_AGO = () => new Date(Date.now() - 24 * 3600 * 1000)
    const setUpdated = (model, date, where = null) => Database.sequelize.query(`UPDATE ${model.tableName} SET updatedAt = :d${where ? ' WHERE id = :id' : ''}`, { replacements: { d: date.toISOString().replace('T', ' ').replace('Z', ' +00:00'), id: where?.id ?? null } })
    const freeze = async () => {
      for (const model of [Database.bookModel, Database.libraryItemModel, Database.seriesModel, Database.authorModel]) await setUpdated(model, DAY_AGO())
      cache().loadedAt = Date.now() - 31 * 60 * 1000
    }
    it('serves the cache for 30 minutes, then reloads only when something changed', async function () {
      const first = await get(`${L()}/filterdata`)
      const loadedAt = cache().loadedAt
      // 1. within 30 minutes: cached even though the data changed (and its updatedAt is newer)
      await Database.bookModel.update({ genres: ['Fantasy', 'Brand New'] }, { where: { id: f.items.alpha.book.id } })
      const cached = await get(`${L()}/filterdata`)
      // 2. older than 30 minutes, nothing updated since the last load and the same counts: still the cached data, loadedAt refreshed
      await freeze()
      const stillCached = await get(`${L()}/filterdata`)
      const refreshed = cache().loadedAt > Date.now() - 60 * 1000
      // 3. older than 30 minutes and a book (with its library item) changed since the last load: reloaded
      cache().loadedAt = Date.now() - 31 * 60 * 1000
      await setUpdated(Database.bookModel, new Date(), { id: f.items.beta.book.id })
      await setUpdated(Database.libraryItemModel, new Date(), { id: f.items.beta.libraryItem.id })
      const reloaded = await get(`${L()}/filterdata`)
      expect(first.body.genres).to.not.include('Brand New')
      expect(cached.body.genres).to.not.include('Brand New')
      expect(reloaded.body.genres).to.include('Brand New')
      matchSnapshot(this, { first: first.body.genres, cachedWithinWindow: cached.body.genres, stillCached: stillCached.body.genres, loadedAtRefreshed: refreshed, reloaded: reloaded.body.genres, loadedAtMoved: cache().loadedAt > loadedAt }, { ids: ids() })
    })
    it('reloads when only the number of books, series or authors changed', async function () {
      const out = {}
      await get(`${L()}/filterdata`)
      await freeze()
      // a book moves to another library (no updatedAt change): the book count differs
      await Database.libraryItemModel.update({ libraryId: f.other.library.id }, { where: { id: f.items.apple.libraryItem.id }, silent: true })
      out.afterBookMoved = { genres: (await get(`${L()}/filterdata`)).body.genres, bookCount: cache().bookCount }
      await freeze()
      await Database.seriesModel.destroy({ where: { id: f.series.solo.id } })
      out.afterSeriesRemoved = { series: (await get(`${L()}/filterdata`)).body.series.map((s) => s.name), seriesCount: cache().seriesCount }
      await freeze()
      await Database.authorModel.destroy({ where: { id: f.authors.gil.id } })
      out.afterAuthorRemoved = { authors: (await get(`${L()}/filterdata`)).body.authors.map((a) => a.name), authorCount: cache().authorCount }
      matchSnapshot(this, out, { ids: ids() })
    })
    it('a changed series or author alone is enough to reload', async function () {
      const out = {}
      await get(`${L()}/filterdata`)
      await freeze()
      await Database.seriesModel.update({ name: 'Renamed Saga' }, { where: { id: f.series.saga.id }, silent: true })
      await setUpdated(Database.seriesModel, new Date(), { id: f.series.saga.id })
      out.seriesChanged = (await get(`${L()}/filterdata`)).body.series.map((s) => s.name)
      await freeze()
      await Database.authorModel.update({ name: 'Renamed Ann' }, { where: { id: f.authors.ann.id }, silent: true })
      await setUpdated(Database.authorModel, new Date(), { id: f.authors.ann.id })
      out.authorChanged = (await get(`${L()}/filterdata`)).body.authors.map((a) => a.name)
      matchSnapshot(this, out, { ids: ids() })
    })
    it('a book changed without its library item (or the other way round) does not count as a change', async function () {
      const out = {}
      await get(`${L()}/filterdata`)
      await freeze()
      await Database.bookModel.update({ genres: ['Hidden Change'] }, { where: { id: f.items.zeta.book.id }, silent: true })
      await setUpdated(Database.libraryItemModel, new Date())
      out.onlyLibraryItems = (await get(`${L()}/filterdata`)).body.genres.includes('Hidden Change')
      await freeze()
      await setUpdated(Database.bookModel, new Date())
      out.onlyBooks = (await get(`${L()}/filterdata`)).body.genres.includes('Hidden Change')
      await freeze()
      await setUpdated(Database.bookModel, new Date())
      await setUpdated(Database.libraryItemModel, new Date())
      out.both = (await get(`${L()}/filterdata`)).body.genres.includes('Hidden Change')
      expect(out).to.deep.equal({ onlyLibraryItems: false, onlyBooks: false, both: true })
      matchSnapshot(this, out, { ids: ids() })
    })
    it('counts issues (missing or invalid) in the filter data', async function () {
      const first = await get(`${L()}/filterdata`)
      await Database.libraryItemModel.update({ isMissing: false, isInvalid: false }, { where: { libraryId: f.lf.library.id } })
      await freeze()
      await setUpdated(Database.bookModel, new Date())
      await setUpdated(Database.libraryItemModel, new Date())
      const second = await get(`${L()}/filterdata`)
      expect([first.body.numIssues, second.body.numIssues]).to.deep.equal([2, 0])
      matchSnapshot(this, { before: first.body.numIssues, after: second.body.numIssues }, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/search', () => {
    const tiedByCount = (list) => {
      const counts = list.map((x) => x.numItems)
      expect(counts).to.deep.equal([...counts].sort((a, b) => b - a))
      return [...list].sort((x, y) => y.numItems - x.numItems || x.name.localeCompare(y.name))
    }
    const sres = (res) => {
      if (res.status !== 200) return { status: res.status, body: res.body }
      const b = res.body
      return {
        book: b.book.map((m) => titleOf(m.libraryItem)).sort(),
        narrators: [...b.narrators].sort((x, y) => x.name.localeCompare(y.name)),
        // tags and genres come back by number of books (ties in no fixed order): ties are sorted by name here, descending counts are asserted
        tags: tiedByCount(b.tags),
        genres: tiedByCount(b.genres),
        series: b.series.map((s) => ({ name: s.series.name, books: s.books.map(titleOf).sort() })).sort((x, y) => x.name.localeCompare(y.name)),
        authors: b.authors.map((a) => `${a.name} (${a.numBooks})`).sort()
      }
    }
    const search = (q, as = 'admin', extra = '') => get(`${L()}/search?q=${encodeURIComponent(q)}${extra}`, as)
    it('finds books by title, subtitle, asin and isbn', async function () {
      const out = {}
      for (const q of ['alpha', 'The Alpha', 'Book One', 'B000000002', '97800000000', 'chronicle', 'zzz-nothing', 'Ebook']) out[q] = sres(await search(q))
      expect(out.alpha.book).to.deep.equal(['The Alpha Quest'])
      matchSnapshot(this, out, { ids: ids() })
    })
    it('finds narrators, tags, genres, series and authors', async function () {
      const out = {}
      for (const q of ['nora', 'ned', 'fav', 'epic', 'fantasy', 'sci', 'saga', 'mystery', 'ann', 'dunn', 'gray', 'fox']) out[q] = sres(await search(q))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('limit applies to every section', async function () {
      const out = {}
      for (const limit of [1, 2, 50]) out[`limit ${limit}`] = sres(await search('a', 'admin', `&limit=${limit}`))
      out.default = sres(await search('a'))
      matchSnapshot(this, out, { ids: ids() })
    })
    it('hides books the user cannot access', async function () {
      const out = {}
      for (const as of ['limited', 'tagsel', 'tagdeny', 'tagonly', 'reader']) {
        out[as] = {}
        for (const q of ['intro', 'a', 'saga', 'pair', 'spicy', 'Dunn']) out[as][q] = sres(await search(q, as))
      }
      matchSnapshot(this, out, { ids: ids() })
    })
    it('validates the query', async function () {
      const out = {
        missing: (await get(`${L()}/search`)).status,
        empty: (await get(`${L()}/search?q=`)).status,
        'array of terms': (await get(`${L()}/search?q=a&q=b`)).status,
        'whitespace only': sres(await search('   '))
      }
      matchSnapshot(this, out, { ids: ids() })
    })
    it('whole search body', async function () {
      const res = await search('saga', 'admin', '&limit=2')
      matchSnapshot(this, res.body, { ids: ids() })
    })
  })

  describe('GET /libraries/:id/stats', () => {
    it('book library stats', async function () {
      const res = await get(`${L()}/stats`)
      expect(res.body.largestItems).to.have.length(10)
      expect(res.body.longestItems).to.have.length(10)
      // authors and genres with the same count come back in no fixed order: check the counts descend, then fix the order of ties
      const counts = (list) => list.map((x) => Number(x.count))
      expect(counts(res.body.authorsWithCount)).to.deep.equal(counts(res.body.authorsWithCount).sort((a, b) => b - a))
      expect(counts(res.body.genresWithCount)).to.deep.equal(counts(res.body.genresWithCount).sort((a, b) => b - a))
      const tied = (list, key) => [...list].sort((a, b) => b.count - a.count || a[key].localeCompare(b[key]))
      const body = { ...res.body, authorsWithCount: tied(res.body.authorsWithCount, 'name'), genresWithCount: tied(res.body.genresWithCount, 'genre') }
      matchSnapshot(this, body, { ids: ids() })
    })
    it('stats ignore user restrictions and other libraries', async function () {
      const limited = await get(`${L()}/stats`, 'limited')
      const other = await get(`/api/libraries/${f.other.library.id}/stats`, 'admin')
      matchSnapshot(this, { limitedTotals: [limited.body.totalItems, limited.body.totalGenres, limited.body.totalSize, limited.body.totalDuration, limited.body.numAudioTracks], other: other.body }, { ids: ids() })
    })
  })

  describe('narrators, tags and genres by name', () => {
    it('lists narrators with their book counts', async function () {
      const res = await get(`${L()}/narrators`)
      matchSnapshot(this, res.body, { ids: ids() })
    })
    it('renames and removes a narrator on every book of the library only', async function () {
      const out = {}
      out.rename = (await api.request('PATCH', `${L()}/narrators/${b64('Nora Narrator')}`, { as: 'admin', json: { name: 'Nora N.' } })).body
      out.afterRename = proj(await items(`${T}&filter=narrators.${b64('Nora N.')}`))
      out.elsewhere = (await Database.bookModel.findByPk(f.items.elsewhere.book.id)).narrators
      out.renameToExisting = (await api.request('PATCH', `${L()}/narrators/${b64('Ned Narrator')}`, { as: 'admin', json: { name: 'Nora N.' } })).body
      out.afterMerge = proj(await items(`${T}&filter=narrators.${b64('Nora N.')}`))
      out.remove = (await api.request('DELETE', `${L()}/narrators/${b64('Nora N.')}`, { as: 'admin' })).body
      out.afterRemove = proj(await items(`${T}&filter=narrators.${b64('Nora N.')}`))
      out.removeUnknown = (await api.request('DELETE', `${L()}/narrators/${b64('Nobody')}`, { as: 'admin' })).body
      matchSnapshot(this, out, { ids: ids() })
    })
    it('renames and deletes tags and genres across libraries', async function () {
      const out = {}
      out.renameTag = (await api.request('POST', '/api/tags/rename', { as: 'admin', json: { tag: 'fav', newTag: 'favourite' } })).body
      out.afterRenameTag = proj(await items(`${T}&filter=tags.${b64('favourite')}`))
      out.elsewhereTags = (await Database.bookModel.findByPk(f.items.elsewhere.book.id)).tags
      out.mergeTag = (await api.request('POST', '/api/tags/rename', { as: 'admin', json: { tag: 'epic', newTag: 'favourite' } })).body
      out.afterMergeTag = proj(await items(`${T}&filter=tags.${b64('favourite')}`))
      out.deleteTag = (await api.request('DELETE', `/api/tags/${b64('favourite')}`, { as: 'admin' })).body
      out.afterDeleteTag = proj(await items(`${T}&filter=tags.${b64('favourite')}`))
      out.renameGenre = (await api.request('POST', '/api/genres/rename', { as: 'admin', json: { genre: 'Fantasy', newGenre: 'Fiction' } })).body
      out.afterRenameGenre = proj(await items(`${T}&filter=genres.${b64('Fiction')}`))
      out.mergeGenre = (await api.request('POST', '/api/genres/rename', { as: 'admin', json: { genre: 'Thriller', newGenre: 'Fiction' } })).body
      out.deleteGenre = (await api.request('DELETE', `/api/genres/${b64('Fiction')}`, { as: 'admin' })).body
      out.afterDeleteGenre = proj(await items(`${T}&filter=genres.${b64('Fiction')}`))
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('items of an author', () => {
    it('GET /authors/:id?include=items lists the books newest first for the user', async function () {
      const out = {}
      for (const as of ['admin', 'limited', 'tagsel', 'tagdeny']) {
        const res = await get(`/api/authors/${f.authors.dee.id}?include=items`, as)
        out[as] = { status: res.status, items: (res.body.libraryItems || []).map(row) }
      }
      const ann = await get(`/api/authors/${f.authors.ann.id}?include=items,series`, 'reader')
      out.ann = { items: (ann.body.libraryItems || []).map(row), series: (ann.body.series || []).map((s) => `${s.name} [${(s.items || []).map(titleOf).join(', ')}]`) }
      matchSnapshot(this, out, { ids: ids() })
    })
  })

  describe('collections', () => {
    it('GET /collections/:id returns the books of the collection the user may see', async function () {
      const collection = await Database.collectionModel.create({ libraryId: f.lf.library.id, name: 'Mixed', description: 'x' })
      let order = 1
      for (const k of ['theta', 'alpha', 'iota', 'zeta']) await Database.collectionBookModel.create({ collectionId: collection.id, bookId: f.items[k].book.id, order: order++ })
      const out = {}
      for (const as of ['admin', 'limited', 'tagsel']) {
        const res = await get(`/api/collections/${collection.id}`, as)
        out[as] = { status: res.status, books: (res.body.books || []).map(titleOf) }
      }
      matchSnapshot(this, out, { ids: ids() })
    })
  })
})
