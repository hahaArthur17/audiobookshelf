# Query filters B: characterization findings

Area: `server/utils/queries/libraryItemsPodcastFilters.js`, `authorFilters.js`, `adminStats.js`, `userStats.js` and `server/models/LibraryItem.js`.
Tests: `test/characterization/QueryFiltersPodcast.test.js` (41 tests), `test/characterization/LibraryItemModel.test.js` (25 tests), seed helper `helpers/seed-query-filters-podcast.js`.

## Coverage before (statement/branch, whole existing suite, nyc over dist-server)
Before: the five files were at about 78% statements and 61% branches combined. Untouched before these tests: podcast permission clauses (tags and explicit), genre/tag/language/explicit filters, `issues`/`feed-open`/`recent` filters, every sort except addedAt and a few, `numepisodesincomplete`, episode search/tag/genre search, `getFilteredPodcastEpisodes` progress filters, `LibraryItem.findAllExpandedWhere`, `getLibraryItemsIncrement`, continue-listening/continue-reading/listen-again/read-again shelves, `saveMetadataFile` with metadata stored next to the item, and the podcast/cover/time branches of adminStats and userStats.
All of the above is now exercised through the real routes (library items, personalized, recent-episodes, search, stats, filterdata, authors, `/api/stats/*`, `/api/me/stats/year`) or by calling the real model/query functions on the harness database. There are no stubs of the code under test.

Not present in this version of `LibraryItem.js` (listed in the brief but nothing to test): `getByPathAndLibrary` and inode lookups.

## Mutation testing
129 targeted mutations (comparators, asc/desc swaps, dropped WHERE clauses, limits, AND/OR, off-by-one, dropped guards) were applied to the compiled copies in `dist-server/server/...` (never to `server/`; `git diff -- server` is empty), running both new test files after each one.

| Group | Mutations | Killed | Equivalent / invalid |
|---|---|---|---|
| libraryItemsPodcastFilters (P) | 54 | 53 | 1 equivalent (P27) |
| authorFilters (A) | 7 | 7 | 0 |
| adminStats (S) | 14 | 14 | 0 |
| userStats (U) | 12 | 11 | 1 invalid (U09 replacement was identical to the original) |
| LibraryItem (L) | 42 | 41 | 1 equivalent (L01) |
| Total | 129 | 126 | 2 equivalent, 1 invalid |

First pass killed 115; 14 survivors led to new tests (zero-progress episode, itunesArtistId substring search, other-library author counts, direct `authorFilters.search` offset, exact year-boundary rows for books/authors, 25-cover and 5-finished-cover caps, addedAt/updatedAt source) and were all killed on re-mutation, except:
- P27 (count cache used even when permission clauses exist): equivalent, the cache key is the full serialized query including the permission clause.
- L01 (`getExpandedById` without the `!libraryItemId` guard): equivalent, `findByPk(null/undefined)` already returns null.
- U09: no-op mutation, discarded. Ties in `topAuthors`/`mostListenedNarrator` cannot be tested (`order: random()` on sessions), so `>` vs `>=` there is unobservable.
Snapshots mask timestamps, so timestamp fields are asserted with `expect` (see the addedAt test).

## Behaviour oddities (recorded, not fixed)
1. `adminStats.getStatsForYear`: the `totalBooksSize`, `totalBooksDuration` and `numBooks` query has `li.createdAt < ":nextYear-01-01"`; the replacement is inside quotes so it is never substituted and the comparison is against the literal text, which every date is smaller than. Result: these three totals ignore the year (identical for 2000 and 2026).
2. `GET /libraries/:id/recent-episodes` without `limit` returns an empty list (`limit` 0 becomes `LIMIT 0`).
3. The podcast items count cache is only cleared by podcast and episode create/destroy. Moving a library item to another library leaves `total` stale (7 while 6 rows come back) until another podcast/episode is created or destroyed.
4. Search tag and genre matches are not filtered by the user's tag/explicit permissions (a user restricted from the `kids` tag still sees `kids` in the tag results with its count). Podcast and episode matches are filtered.
5. Search treats `%` and `_` as LIKE wildcards (`q=%` matches everything).
6. `getPersonalizedShelves` for podcast libraries shows items that are `isMissing` (Delta in the fixture) in the continue-listening shelf.
7. Users cannot see podcasts whose `explicit` is NULL unless they have explicit access (NULL is not `= 0`), same as books.
8. `LibraryItem.checkExistsById(undefined)` throws (`WHERE parameter "id" has invalid "undefined" value`); `removeById` resolves before the media row is deleted (the `afterDestroy` hook does not await `media.destroy()`), so the media rows disappear slightly later (tests poll).
9. `saveMetadataFile` with metadata stored next to the item pushes the new `metadata.json` entry onto `libraryFiles` in place and then `save()`s; the JSON column change is not detected, so after reload `libraryFiles` does not contain it (size and mtime are persisted).
10. With `collapseseries=1` a multi-series book is collapsed under the first matching series, and the combination `collapseseries=1` + series filter is handled by a separate helper (`seriesSequenceList`, different shape).
11. Library filterdata is cached for 30 minutes per library and is not user-specific, so restricted users see all genres/tags/languages; later podcast changes do not show until it expires.
12. `listening sessions` month bucketing in `userStats` uses the server's local time zone (`getMonth()`); year boundaries for sessions/authors/books use date parsing that depends on the process time zone (tests assume UTC, like the rest of the suite).
13. `GET /libraries/:id/items` accepts non-numeric `limit` (`limit=abc` becomes 0, i.e. unpaginated) but rejects negative and fractional values with 400.

## Flakiness notes
Multi-author books come back in an id-dependent author order from the continue-series shelf, and the discover shelf is random, so those shelves are excluded from full-body snapshots (titles only). Authors/ties with equal counts are avoided in author stats fixtures.
