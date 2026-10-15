# Query filters (book side): characterization findings

Area A of the TS migration characterization work: `server/utils/queries/libraryFilters.js`, `libraryItemsBookFilters.js`, `seriesFilters.js` and `libraryItemFilters.js` (the podcast filters, `authorFilters`, admin/user stats and `models/LibraryItem.js` are covered elsewhere). Nothing under `server/` was changed; oddities below are recorded, not fixed.

## What was added
- `test/characterization/QueryFiltersBook.test.js` (top-level describe `QueryFiltersBook (characterization)`), 79 tests, snapshot `snapshots/QueryFiltersBook_characterization_.json` (79 entries).
- `test/characterization/helpers/seed-query-filters.js`: one rich fixture (the harness, `snapshot.js` and `seed-library.js` are untouched).
  - "Books" library: 21 books with authors (one book with two), narrators (one with non-ASCII and `/`, `?` in base64), genres, tags, languages, publishers, years 1899 to 2021 (one non-numeric), ISBN/ASIN, durations, sizes, multi-track and ebook-only and supplementary-ebook items, no-metadata items, explicit books (true and NULL), a missing and an invalid item, abridged books, chapters, items created 2 to 80 days ago, books whose `updatedAt` runs opposite to `createdAt`, 8 series (sequences `1`, `1.5`, `2`, `10`, empty, duplicate sequences, a book in two series, a single-book series, a series older than 60 days, a series of only explicit books), open feeds (items and a series) and a media item share. A second library "Other" holds a same-named author and series to prove library scoping.
  - Users: `root/admin/user/guest` plus `reader`, `reader2` (finished, in-progress, hidden-from-continue, ebook in-progress and finished, unstarted rows; a hidden series), `limited` (no explicit access), `tagsel` (tag allowlist), `tagdeny` (tag denylist), `tagonly` (allowlist without explicit access), `bare` (no `seriesHideFromContinueListening` key), `admin2` (progress, for the admin-only `include=share`), `otherOnly` (library access).
- Every `it` contains `matchSnapshot` (mostly projections: titles in order, totals, a few shelf fields) and most also explicit `expect`s; whole response bodies are kept for a few tests (items with and without collapse, shelves, series, search) so serialization is pinned too.

## What is exercised
- `GET /libraries/:id/items`: every filter group and value (progress x8 values for several users, authors, series incl. `no-series`, narrators, genres, tags, languages, publishers, decades, missing x14, tracks, ebooks incl. supplementary, abridged, explicit, issues, recent, feed-open, share-open, unknown groups, groups without a value, broken and double url encoding), every `sort` ascending and descending (incl. `sequence`, the three progress sorts, `random`, unknown, `sortingIgnorePrefix` on and off), `limit`/`page`, `include=rssfeed|share`, `collapseseries` with every filter group, restricted users, the sub-series collapse through `libraryHelpers`, the unfiltered count cache.
- `GET /libraries/:id/personalized`: all shelves (continue-listening/reading, continue-series, recently-added, recent-series, discover, listen/read-again, newest-authors) for readers, restricted users, `bare`, `admin2`, `limit` per shelf, `include`, `onlyShowLaterBooksInContinueSeries`, `hideSingleBookSeries`, hidden series, empty library, a book without library item.
- `GET /libraries/:id/series` (every sort, all filter groups, progress per user, restrictions, paging, `hideSingleBookSeries`, `include=rssfeed`), `GET /libraries/:id/series/:id` and `GET /series/:id` (progress, restrictions), `filterdata` (cache window, every reload trigger, decade validity, `No Title`), `search`, `stats`, narrators (list, rename, remove), tag and genre rename/merge/delete (`libraryItemFilters`), `GET /authors/:id?include=items`, `GET /collections/:id`, an empty library on every endpoint.
- Direct calls where no route reaches: `getUserPermissionBookWhereQuery`, `getMediaGroupQuery`, `getOrder` (generated order literals), both `getLibraryItemsForCollection` (dead code), `getFilteredLibraryItems` with a series filter and `collapseseries`, `getLibraryItemsForSeries` without user, `decode` of both modules.

## Coverage of the four files (nyc on `dist-server`)
| | statements | branches |
|---|---|---|
| existing suites only (LibraryController, SeriesController, MiscController, AuthorController, CollectionController, MeController, StatsController, SearchController, PlaylistController, LibraryItemController, ShareController, RSSFeedController) | 73.6% | 57.8% (libraryItemsBookFilters 74.8 / 61.3, seriesFilters 61.1 / 48.5, libraryFilters 72.7 / 55.0) |
| `QueryFiltersBook.test.js` alone | 92.4% | 90.1% (libraryItemsBookFilters 100 / 96.6, seriesFilters 100 / 100, libraryFilters 77.7 / 72.5, libraryItemFilters 83.3 / 50) |

Still uncovered in these files: the podcast branches of `libraryFilters` and `libraryItemFilters` (other agent), `QUERY_PROFILING` branches, and defensive fallbacks that cannot be reached with the data model: `getCollapseSeriesBooksToExclude` default `replacements = {}` and `|| []`, `if (!bookAttributes?.include)` (always true), `collapseSeriesObj?.numBooks || 0`, `bookSeries?.`/`bookAuthors?.` fallbacks in the discover query, the `else` of `if (collapsedSeries)`, `if (li.series)` in continue-series (always set), `au.books.length || 0` (author must have a book). `getUserPermissionBookWhereQuery(null)` is only reachable by a direct call (covered that way).

## Mutation testing
174 one- or two-line mutations of the compiled files (`dist-server/server/utils/queries/*.js`, i.e. the build output of `server/`; `server/` itself was never edited and `git diff -- server/` is empty), each run against `QueryFiltersBook.test.js` with `mocha --bail` and the file restored after every run. Comparators, asc/desc, drops of WHERE clauses and permission checks, AND/OR, defaults, limits and offsets, library scoping, cache windows and so on, spread over the four files:

| File | Mutations | Killed | Survived (equivalent / unreachable) |
|---|---|---|---|
| libraryItemsBookFilters | 95 | 92 | 3 |
| libraryFilters | 42 | 40 | 2 |
| seriesFilters | 29 | 29 | 0 |
| libraryItemFilters | 8 | 8 | 0 |
| total | 174 | 169 | 5 |

The first pass (128 mutations) left 13 survivors and the second (39 more) one more that was not equivalent. They were killed by adding data and tests (listed with the fix), then the whole set was re-run: ebook rows with `ebookProgress` 0 (`>= 0`), a duplicate-sequence series and a restricted user for `onlyShowLaterBooksInContinueSeries` (`>` vs `>=` in SQL and in `bookIndex`), an unfinished zero-progress row without series for discover, a series 30 to 60 days old and an author 45 days old for the 60-day windows, a series of only explicit books for the recent-series permission clause, a book whose size only the library item knows for the size fallback, series `updatedAt` and book `updatedAt` that order differently from `createdAt`, a year `0` that must not produce a decade `0`, double url encoding for `decode`, and a direct call for the (otherwise unreachable) "collapse is switched off for a series filter".

Survivors (all equivalent or unreachable; the other 169 were killed):
- E01 `if (!bookAttributes?.include) bookAttributes = { include: [] }` made unconditional: `bookAttributes` is always `null` there.
- E02 `if (li.series)` before `media.metadata.series = li.series` in continue-series: `series` is always set.
- E03, E04 `numBooks: ... || 0` and `libraryItemIds: ... || []` fallbacks in the collapse mapping: the collapsed series object always exists.
- E05 `au.books.length || 0` in newest authors: the include is `required: true`.

Not mutated because the mutation would make requests hang rather than fail cleanly: `ORDER BY` / column renames that produce SQL errors (see the hangs below).

### Full list
| Id | File | Mutation | Result (first failing test) |
|---|---|---|---|
| B01 | libraryItemsBookFilters | explicit restriction flips | killed: progress filters follow the user: reader2, an admin without progress and a user  |
| B02 | libraryItemsBookFilters | explicit check negation dropped | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B03 | libraryItemsBookFilters | denylist/allowlist swapped | killed: explicit and tag restrictions |
| B04 | libraryItemsBookFilters | allowlist needs 2 tags | killed: explicit and tag restrictions |
| B05 | libraryItemsBookFilters | tag restriction && -> // | killed: getUserPermissionBookWhereQuery builds one clause per restriction |
| B06 | libraryItemsBookFilters | progress not-finished: null/false -> null/true | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B07 | libraryItemsBookFilters | progress finished = true -> false | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B08 | libraryItemsBookFilters | audio-in-progress currentTime > 0 -> >= 0 | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B09 | libraryItemsBookFilters | ebook-finished uses audio files == 0 -> == 1 | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B10 | libraryItemsBookFilters | ebook-in-progress ebookProgress > 0 -> >= 0 | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B11 | libraryItemsBookFilters | in-progress ebookProgress branch removed (OR -> AND) | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B12 | libraryItemsBookFilters | collapse not-started currentTime null/0 -> null/1 | killed: collapses with each filter group (progress filters use the series level query) |
| B13 | libraryItemsBookFilters | collapse finished true -> false | killed: payload fields echo the query (minified, collapseseries, include, filterBy) |
| B14 | libraryItemsBookFilters | collapse in-progress isFinished false -> true | killed: collapses with each filter group (progress filters use the series level query) |
| B15 | libraryItemsBookFilters | collapse not-finished null/false -> null/true | killed: collapses with each filter group (progress filters use the series level query) |
| B16 | libraryItemsBookFilters | abridged true -> false | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B17 | libraryItemsBookFilters | explicit true -> false | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B18 | libraryItemsBookFilters | genres/tags/narrators = -> != | killed: authors, series, narrators, genres, tags, languages, publishers |
| B19 | libraryItemsBookFilters | publishers filter uses language | killed: authors, series, narrators, genres, tags, languages, publishers |
| B20 | libraryItemsBookFilters | languages filter uses publisher | killed: authors, series, narrators, genres, tags, languages, publishers |
| B21 | libraryItemsBookFilters | tracks multi > 1 -> >= 1 | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B22 | libraryItemsBookFilters | tracks default single 1 -> 2 | killed: filter values that are not valid base64 or url encoding |
| B23 | libraryItemsBookFilters | tracks none 0 -> 1 | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B24 | libraryItemsBookFilters | ebooks ebook not null -> null | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B25 | libraryItemsBookFilters | missing array fields length 0 -> 1 | killed: missing metadata |
| B26 | libraryItemsBookFilters | missing string fields: empty string no longer missing | killed: missing metadata where empty strings and empty arrays count as missing |
| B27 | libraryItemsBookFilters | decade end year +9 -> +10 | killed: published decades |
| B28 | libraryItemsBookFilters | missing authors id null -> not null | killed: missing metadata |
| B29 | libraryItemsBookFilters | no-series filter id null -> not null | killed: authors, series, narrators, genres, tags, languages, publishers |
| B30 | libraryItemsBookFilters | sort direction swapped | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B31 | libraryItemsBookFilters | size sort uses createdAt | killed: every sort, ascending and descending |
| B32 | libraryItemsBookFilters | sequence nulls first/last swapped | killed: sequence sort needs a series filter, otherwise it falls back to title |
| B33 | libraryItemsBookFilters | progress sort uses createdAt | killed: progress sorts for a reader (with and without a progress filter) |
| B34 | libraryItemsBookFilters | finishedAt sort uses updatedAt | killed: progress sorts for a reader (with and without a progress filter) |
| B35 | libraryItemsBookFilters | authorName sort uses LF | killed: getOrder maps every sort to its column and direction |
| B36 | libraryItemsBookFilters | collapsed title sort by book title | killed: title sort with and without the sortingIgnorePrefix server setting |
| B37 | libraryItemsBookFilters | duration sort desc ignored | killed: every sort, ascending and descending |
| B38 | libraryItemsBookFilters | publishedYear cast dropped | killed: every sort, ascending and descending |
| B39 | libraryItemsBookFilters | collapse first-book order desc | killed: title sort with and without the sortingIgnorePrefix server setting |
| B40 | libraryItemsBookFilters | collapse switched off for series filter removed | killed: getFilteredLibraryItems keeps the sub-series filter uncollapsed even when asked  |
| B41 | libraryItemsBookFilters | sequence fallback removed | killed: sequence sort needs a series filter, otherwise it falls back to title |
| B42 | libraryItemsBookFilters | share include no longer admin only | killed: feed-open and share-open, with and without include=rssfeed / share |
| B43 | libraryItemsBookFilters | feed-open not required | killed: feed-open and share-open, with and without include=rssfeed / share |
| B44 | libraryItemsBookFilters | issues invalid -> not invalid | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B45 | libraryItemsBookFilters | home page hides hidden progress | killed: shelves for readers with different progress |
| B46 | libraryItemsBookFilters | recent window 60 -> 30 days (books) | killed: tracks, ebooks, abridged, explicit, issues, recent |
| B47 | libraryItemsBookFilters | pagination offset ignored (cached path) | killed: limit, page and total |
| B48 | libraryItemsBookFilters | pagination limit +1 (uncached path) | killed: limit, page and total |
| B49 | libraryItemsBookFilters | count cache also for filtered queries | killed: renames and removes a narrator on every book of the library only |
| B50 | libraryItemsBookFilters | count cache also for restricted users | killed: a restricted user does not use the count cache |
| B51 | libraryItemsBookFilters | collapsed series sequence reported null | killed: title sort with and without the sortingIgnorePrefix server setting |
| B52 | libraryItemsBookFilters | series filter sequence fallback | killed: authors, series, narrators, genres, tags, languages, publishers |
| B53 | libraryItemsBookFilters | continue-series needs 2 finished books | killed: shelves for readers with different progress |
| B54 | libraryItemsBookFilters | continue-series in progress currentTime > 0 -> >= 0 | killed: shelves for readers with different progress |
| B55 | libraryItemsBookFilters | continue-series ordered oldest first | killed: shelves for readers with different progress |
| B56 | libraryItemsBookFilters | onlyShowLater: > -> >= | killed: onlyShowLaterBooksInContinueSeries shows only books after the last finished one |
| B57 | libraryItemsBookFilters | onlyShowLater bookIndex: > -> >= | killed: continue series for a user who cannot see the remaining books |
| B58 | libraryItemsBookFilters | hidden series list ignored | killed: shelves for readers with different progress |
| B59 | libraryItemsBookFilters | continue-series sequence order desc | killed: shelves for readers with different progress |
| B60 | libraryItemsBookFilters | discover started series test: currentTime > 0 -> > 1000 | killed: include=share decorates the shelf entries of an admin with progress |
| B61 | libraryItemsBookFilters | discover: unfinished book filter null/0 -> null only | killed: shelves for readers with different progress |
| B62 | libraryItemsBookFilters | discover: first book of series order desc | killed: shelves for readers with different progress |
| B63 | libraryItemsBookFilters | search isbn substring -> equals | killed: finds books by title, subtitle, asin and isbn |
| B64 | libraryItemsBookFilters | search tags ordered ascending | killed: validates the query |
| B65 | libraryItemsBookFilters | search narrators not library scoped | killed: an empty book library has no shelves, no items and zero stats |
| B66 | libraryItemsBookFilters | genres with count ordered ascending | killed: book library stats |
| B67 | libraryItemsBookFilters | stats total duration sums size | killed: book library stats |
| B68 | libraryItemsBookFilters | longest books ascending | killed: book library stats |
| B69 | libraryItemsBookFilters | search series limited by permissions dropped | killed: hides books the user cannot access |
| L01 | libraryFilters | decades group dropped from filter groups | killed: published decades |
| L02 | libraryFilters | continue listening sorted ascending | killed: the limit applies per shelf, default is 10, recent-series is always 5 |
| L03 | libraryFilters | continue listening ignores hidden flag | killed: shelves for readers with different progress |
| L04 | libraryFilters | recently added oldest first | killed: shelves for readers with different progress |
| L05 | libraryFilters | listen again oldest first | killed: shelves for readers with different progress |
| L06 | libraryFilters | recent series oldest first | killed: shelves for readers with different progress |
| L07 | libraryFilters | recent series window 60 -> 30 | killed: shelves for readers with different progress |
| L08 | libraryFilters | recent series hide-single: > 1 -> >= 1 | killed: recent series respects hideSingleBookSeries and the 60 day window |
| L09 | libraryFilters | recent series explicit restriction dropped | killed: shelves for readers with different progress |
| L10 | libraryFilters | recent series denylist swapped | killed: shelves for restricted users |
| L11 | libraryFilters | recent series books sorted non numeric | killed: recent series respects hideSingleBookSeries and the 60 day window |
| L12 | libraryFilters | newest authors need a visible book dropped | killed: shelves for restricted users |
| L13 | libraryFilters | newest authors oldest first | killed: shelves for readers with different progress |
| L14 | libraryFilters | newest authors window | killed: shelves for readers with different progress |
| L15 | libraryFilters | author items oldest first | killed: GET /authors/:id?include=items lists the books newest first for the user |
| L16 | libraryFilters | filter data cache 30 -> 60 minutes | killed: serves the cache for 30 minutes, then reloads only when something changed |
| L17 | libraryFilters | filter data change detection off | killed: serves the cache for 30 minutes, then reloads only when something changed |
| L18 | libraryFilters | decade max year < 3000 -> <= 3000 | killed: valid published years are 1 to 2999 |
| L19 | libraryFilters | decade min year > 0 -> >= 0 | killed: valid published years are 1 to 2999 |
| L20 | libraryFilters | decade rounding | killed: collects the sorted filter values of the library |
| L21 | libraryFilters | filter data authors sorted descending | killed: collects the sorted filter values of the library |
| L22 | libraryFilters | filter data decades sorted descending | killed: collects the sorted filter values of the library |
| L23 | libraryFilters | series without name title | killed: series without a name are listed as "No Title"; empty strings and nulls are skip |
| L24 | libraryFilters | issues counted when missing AND invalid | killed: collects the sorted filter values of the library |
| L25 | libraryFilters | filter data cached count not compared (book count) | killed: reloads when only the number of books, series or authors changed |
| L26 | libraryFilters | filter data series count not compared | killed: reloads when only the number of books, series or authors changed |
| L27 | libraryFilters | filter data author count not compared | killed: reloads when only the number of books, series or authors changed |
| L28 | libraryFilters | decode without url decoding | killed: filter values that are not valid base64 or url encoding |
| L29 | libraryFilters | rssFeed not attached on listen again | killed: include=share decorates the shelf entries of an admin with progress |
| L30 | libraryFilters | continue series metadata series dropped | killed: shelves for readers with different progress |
| L31 | libraryFilters | recently added media size fallback dropped | killed: recently added entries without audio take their size from the library item |
| S01 | seriesFilters | progress group dropped | killed: filters by progress for different users |
| S02 | seriesFilters | hide single book series: > 1 -> >= 1 | killed: include=rssfeed, hideSingleBookSeries and paging |
| S03 | seriesFilters | genre filter = -> != | killed: filters by genre, tag, author, narrator, publisher and language |
| S04 | seriesFilters | authors filter uses wrong column | killed: filters by genre, tag, author, narrator, publisher and language |
| S05 | seriesFilters | publishers filter uses language | killed: filters by genre, tag, author, narrator, publisher and language |
| S06 | seriesFilters | languages filter uses publisher | killed: filters by genre, tag, author, narrator, publisher and language |
| S07 | seriesFilters | progress not-finished null check dropped | killed: filters by progress for different users |
| S08 | seriesFilters | progress finished: unfinished count = 0 -> = 1 | killed: filters by progress for different users |
| S09 | seriesFilters | progress not-started: OR -> AND | killed: filters by progress for different users |
| S10 | seriesFilters | progress in-progress: finished = 0 -> = 1 | killed: filters by progress for different users |
| S11 | seriesFilters | progress in-progress ebook branch dropped | killed: filters by progress for different users |
| S12 | seriesFilters | permissions explicit dropped | killed: respects explicit and tag restrictions |
| S13 | seriesFilters | permissions denylist swapped | killed: respects explicit and tag restrictions |
| S14 | seriesFilters | numBooks sort fixed | killed: sorts |
| S15 | seriesFilters | addedAt sort uses updatedAt | killed: sorts |
| S16 | seriesFilters | name sort ignore prefix uses name | killed: sorts |
| S17 | seriesFilters | totalDuration sorted by count | killed: sorts |
| S18 | seriesFilters | lastBookUpdated uses createdAt | killed: sorts |
| S19 | seriesFilters | lastBookAdded uses min | killed: sorts |
| S20 | seriesFilters | series books sorted non numeric | killed: sorts |
| S21 | seriesFilters | totalDuration not reported | killed: sorts |
| S23 | seriesFilters | limit off by one | killed: include=rssfeed, hideSingleBookSeries and paging |
| F01 | libraryItemFilters | tags lookup requires 2 matches | killed: renames and deletes tags and genres across libraries |
| F02 | libraryItemFilters | genres lookup inverted | killed: renames and deletes tags and genres across libraries |
| F03 | libraryItemFilters | narrators not library scoped | killed: renames and removes a narrator on every book of the library only |
| F04 | libraryItemFilters | largest items ascending | killed: book library stats |
| F06 | libraryItemFilters | tags lookup uses genres | killed: renames and deletes tags and genres across libraries |
| B71 | libraryItemsBookFilters | collapse exclusion notIn -> in | killed: title sort with and without the sortingIgnorePrefix server setting |
| B73 | libraryItemsBookFilters | collapsed libraryItemIds drops first | killed: title sort with and without the sortingIgnorePrefix server setting |
| B74 | libraryItemsBookFilters | numBooks off by one | killed: title sort with and without the sortingIgnorePrefix server setting |
| B76 | libraryItemsBookFilters | author filter not applied | killed: authors, series, narrators, genres, tags, languages, publishers |
| B77 | libraryItemsBookFilters | share-open not required | killed: feed-open and share-open, with and without include=rssfeed / share |
| B78 | libraryItemsBookFilters | author order newest first | killed: whole item bodies (first page, with and without collapseseries, series filter) |
| B79 | libraryItemsBookFilters | series order newest first | killed: whole item bodies (first page, with and without collapseseries, series filter) |
| B80 | libraryItemsBookFilters | search book limit dropped | killed: limit applies to every section |
| B81 | libraryItemsBookFilters | longest books unlimited | killed: book library stats |
| B82 | libraryItemsBookFilters | discover unlimited | killed: the limit applies per shelf, default is 10, recent-series is always 5 |
| B83 | libraryItemsBookFilters | search title OR -> AND | killed: finds books by title, subtitle, asin and isbn |
| B85 | libraryItemsBookFilters | search narrators offset | killed: finds narrators, tags, genres, series and authors |
| B86 | libraryItemsBookFilters | getBookLibraryStats unscoped | killed: an empty book library has no shelves, no items and zero stats |
| B87 | libraryItemsBookFilters | progress filter requires progress row | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B88 | libraryItemsBookFilters | continue-series permission where dropped | killed: shelves for readers with different progress |
| B89 | libraryItemsBookFilters | discover permission where dropped | killed: shelves for readers with different progress |
| L32 | libraryFilters | library items by author unfiltered by user | killed: GET /authors/:id?include=items lists the books newest first for the user |
| L33 | libraryFilters | recent series limit ignored | killed: shelves for readers with different progress |
| L34 | libraryFilters | filter groups: languages dropped | killed: authors, series, narrators, genres, tags, languages, publishers |
| L35 | libraryFilters | filter groups: ebooks dropped | killed: tracks, ebooks, abridged, explicit, issues, recent |
| L36 | libraryFilters | publishers filter group dropped | killed: authors, series, narrators, genres, tags, languages, publishers |
| L37 | libraryFilters | narrators filter group dropped | killed: authors, series, narrators, genres, tags, languages, publishers |
| L38 | libraryFilters | filter data publishers skipped | killed: collects the sorted filter values of the library |
| L39 | libraryFilters | filter data narrators skipped | killed: collects the sorted filter values of the library |
| L40 | libraryFilters | filter data issues counted on missing only | killed: collects the sorted filter values of the library |
| S25 | seriesFilters | series list not scoped to library | killed: an empty book library has no shelves, no items and zero stats |
| S26 | seriesFilters | series books not filtered by permissions | killed: respects explicit and tag restrictions |
| S27 | seriesFilters | series list offset ignored | killed: include=rssfeed, hideSingleBookSeries and paging |
| S28 | seriesFilters | series rssfeed include dropped | killed: include=rssfeed, hideSingleBookSeries and paging |
| F07 | libraryItemFilters | library item search offset | killed: finds books by title, subtitle, asin and isbn |
| F08 | libraryItemFilters | narrator lookup uses tags | killed: renames and removes a narrator on every book of the library only |
| F09 | libraryItemFilters | largest items unlimited | killed: book library stats |
| E01 | libraryItemsBookFilters | collapse: attributes include always initialised | survived |
| E02 | libraryFilters | continue series: li.series always set | survived |
| E03 | libraryItemsBookFilters | collapse numBooks fallback unreachable | survived |
| E04 | libraryItemsBookFilters | collapse libraryItemIds fallback unreachable | survived |
| E05 | libraryFilters | newest authors numBooks fallback unreachable | survived |
| E06 | libraryItemsBookFilters | getUserPermissionBookWhereQuery default for no user (also direct tested) | killed: getUserPermissionBookWhereQuery builds one clause per restriction |
| B84 | libraryItemsBookFilters | collapse in-progress ebook > -> >= | killed: collapses with each filter group (progress filters use the series level query) |
| S24 | seriesFilters | series decode without url decoding | killed: filters by genre, tag, author, narrator, publisher and language |
| B90 | libraryItemsBookFilters | items list not scoped to library | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B91 | libraryItemsBookFilters | continue-series not scoped to library | killed: an empty library has no shelves, a library nobody can see is refused |
| B92 | libraryItemsBookFilters | discover series not scoped to library | killed: the limit applies per shelf, default is 10, recent-series is always 5 |
| B93 | libraryItemsBookFilters | ebook progress filter in main query > -> >= | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| B94 | libraryItemsBookFilters | in-progress main query ebookProgress > -> >= | killed: progress filters (reader, who has finished / in-progress / hidden / ebook rows) |
| S29 | seriesFilters | series in-progress ebookProgress > -> >= | killed: filters by progress for different users |
| S30 | seriesFilters | series not-finished: ignore finished flag | killed: filters by progress for different users |

## Behaviour oddities and bugs found (recorded as-is, nothing fixed)

**Requests that never answer (async handlers without try/catch under Express 4; the harness drops them from the tests)**
- `GET /libraries/:id/items?filter=publishedDecades.<base64 of a non-number>` (e.g. `abc`): `parseInt` gives `NaN`, the `BETWEEN NaN AND NaN` query throws and the request hangs.
- `GET /libraries/:id/items?sort=sequence&filter=series.<base64 of no-series>` (with or without `collapseseries=1`): that query selects the series through a plain join without the `bookSeries` columns, but the `ORDER BY CAST(series.bookSeries.sequence ...)` still refers to them; SQL error, request hangs.

**Permission gaps and inconsistencies**
- `filterdata`, `narrators`, `stats` and every section of `search` except the book list ignore explicit and tag restrictions: a user without explicit access sees the tag `spicy` (1 book) and the author `Dee Dunn (2)` in search, all genres/tags/narrators in `filterdata`, and library-wide counts in `stats`, although the hidden books are not in any item list.
- Continue Series applies the permission clause only to the final book include, not to the series sub-queries (a TODO in the code): a series whose only unfinished books are hidden is counted in `total` and then dropped (`limited`: `total` 3, 2 entities; a series with only hidden remaining books for the "later books only" setting is dropped after counting too).
- Collections use a different tag check than the item lists: `Collection.js` only tests tags when the book has some, so a user with a tag allowlist sees untagged books in `GET /collections/:id` (`Zeta Zero` for `tagsel`) that the items, series and shelf queries hide (`checkCanAccessLibraryItemWithTags` and `getUserPermissionBookWhereQuery` both hide untagged books from an allowlist user).
- Books with `explicit = NULL` (what `seed-library.createBook` leaves) are invisible to every user without explicit access, in every query.
- `include=share` is silently ignored for non-admins (no 403); it needs the in-memory `ShareManager` entry, not the database row.

**Caches**
- The unfiltered `/items` total is cached by the stringified Sequelize options (without `limit`/`offset`) and only cleared by `Book` instance create/destroy hooks. A change that skips them (a library item moved with `Model.update`, a bulk delete) leaves `total` stale while the rows are right (`total` 21 with 20 rows, in the test), until another query shape is used. Only users without restrictions and without a filter use this cache.
- `GET /libraries*` answers are cached per user and url by `ApiCacheManager` until any non-progress model hook fires, so a changed server setting (`sortingIgnorePrefix`) or a raw SQL change is not seen on a repeated url. The tests add a unique query parameter for that reason.
- `filterdata` is served from `Database.libraryFilterData` for 30 minutes whatever changed. After that it reloads only if a book AND its library item both have `updatedAt` after the last load (the count joins the two tables), or a series or author is newer, or the book/series/author counts differ. A book changed alone, or a library item alone, is never noticed (`filterdata` keeps the old genres); the cache time is then refreshed anyway.
- `User.update` of `extraData` (hidden series) is not seen by a cached user (known harness quirk; shown by `reader2`).

**Odd result shapes**
- Shelf `total`: Continue Listening and Continue Reading share one `total` (the in-progress count of both), and so do Listen Again and Read Again (`total` 2 beside 1 entity each).
- `filter=<group>` without a value (`genres`, `authors`, `series`) answers 200 with no items; `missing`, `ebooks` and `progress` without a value answer all items; `tracks` without a value means "single track". Unknown values of `progress`, `missing`, `ebooks` or an unknown group apply no filter. A value that is not base64 simply matches nothing. A broken `%` escape decodes to `null` (matches nothing).
- `GET /libraries/:id/series` and the series sorts: without `limit` the page is empty with a correct `total` (known); the `finished` and `not-started` filters of the series list count books without the permission clause, so a series is never "finished" for a restricted user while a book hidden from them is unfinished (`limited` gets no finished series), whereas the other series filters do add the clause.
- A book in two series (`Eta Interlude`, series `Saga` #1.5 and `Pair` without sequence) is shown under whichever of its series produces the first book of the collapse query, so the collapsed card name depends on the other filters (`The Saga` when listed alone, `Pair` when `Iota Intro` is filtered out). The `libraryItemIds`/`numBooks` of that card describe the chosen series.
- `collapseseries=1` with the progress filters `audio-in-progress`, `ebook-in-progress` and `ebook-finished` has no series-level variant (empty `seriesWhere`), so only books that are the first of their series (or have no series) survive.
- `hideSingleBookSeries` hides single-book series in the series list and the Recent Series shelf, but not in `collapseseries` (a single-book series still collapses).
- With `desc=1` the `sequence` sort puts books without a sequence first, ascending puts them last; recent series and series books use `localeCompare` numeric ordering and put books without a sequence last.
- `libraryItem.title`/`authorNames*` are denormalized by triggers that only exist after `Database.init()`; the harness database has none, so the seed fills them (`titleIgnorePrefix` sorting and author sorting depend on those columns, not on the book).

**Determinism (matters for anyone extending these tests or porting the queries)**
- No `ORDER BY`: `search` book/series/narrator sections with `limit`, `getAllLibraryItemsWith*`, the collection fetch, the unsorted `/items` list.
- Ties without a tiebreaker: `getAuthorsWithCount` and `getGenresWithCount` (`ORDER BY count DESC`), tags/genres in `search`, `sort=duration` and the progress sorts for equal values, `progress.finishedAt` for unfinished rows. The tests use distinct values, sort ties by name after asserting the counts descend, or compare sets.
- Authors of a book inside `GET /libraries/:id/series` and `search` come back in no fixed order (`Beta Chronicle`: `Ann Author, Bob Builder` or the reverse); the item lists order them by `bookAuthors.createdAt`.
- The Discover shelf picks books at random (`ORDER BY RANDOM()`, also the series it starts from); the tests assert its set when the limit exceeds the candidates and its size otherwise.

**Dead or unreachable code**
- `libraryFilters.getLibraryItemsForCollection` and `libraryItemsBookFilters.getLibraryItemsForCollection` are not called by anything in `server/` (tested by direct call).
- `getUserPermissionBookWhereQuery(null)` and the `bookAttributes?.include` guard cannot be reached through the HTTP layer.

## Notes for whoever re-records
- The tests assume the fixture's relative dates (`now - N days`): items 2 to 80 days old, series 1 to 100, authors 2 to 100. A re-record at any date gives the same snapshots because only order and flags are stored.
- Run `npm run build:server` before mocha: the tests run from `dist-server`.
- The change to `test/characterization/` is not accompanied by an `ORACLE.sha256.json` update or the `[oracle-update]` marker (not part of this task); `npm run oracle:check` will report the three new files until a reviewed commit runs `node scripts/characterization-audit/oracle.js --update`.
