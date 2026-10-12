# Mutation sweep 2 (characterization suite)

Second mutation-only sweep, aimed at the areas the first sweep (`TEST_SWEEP_REPORT.md` section 4, 39 mutations) covered poorly: podcast controller and model code, SessionController, PodcastController, MiscController, CollectionController, NotificationController, RSSFeedController, EmailController, ToolsController, StatsController, SearchController, SeriesController, AuthorController, and server code in models, managers, `Database`, `Logger` and `utils/queries`. No mutation from the first sweep was repeated.

Method: each mutation was a 1-2 line edit of a file under `server/`, applied alone, followed by `npm run build:server`, the most relevant `dist-server/test/characterization/<File>.test.js` file(s), and `git checkout -- server`. Survivors were then confirmed against the whole `dist-server/test` tree (`npm test`: 1308 passing, 7 pending expected). To keep the full-suite runs affordable the 28 survivors were applied in six non-overlapping groups of 3 to 5 mutations (one full run per group, baseline 1308 passing). A group passing means every mutation in it survives individually; the one group with failures (Logger) was resolved by reading the failing test names, which belong to exactly the two Logger mutations. Runs used `NODE_ENV` defaults and no snapshot update flags. Nothing under `server/` is modified at the end.

## 1. Totals

| | Count |
| --- | --- |
| Mutations applied | 86 |
| Source files mutated | 21 |
| CAUGHT by the characterization suite | 58 |
| Survived characterization, CAUGHT by the rest of the suite (`test/server`) | 2 |
| SURVIVED everything, real gap | 24 |
| SURVIVED everything, equivalent mutant | 2 |

Characterization-only kill rate: 58 of 86 (67%). Counting the rest of the suite: 60 of 86 (70%).

Files mutated: `ApiCacheManager.js`, `AuthorController.js`, `Book.js`, `CacheManager.js`, `CollectionController.js`, `Database.js`, `Device.js`, `EmailController.js`, `Logger.js`, `MiscController.js`, `NotificationManager.js`, `PlaybackSession.js`, `Podcast.js`, `PodcastController.js`, `RssFeedManager.js`, `SearchController.js`, `SeriesController.js`, `SessionController.js`, `ToolsController.js`, `adminStats.js`, `userStats.js`.

Mutations that were discarded and are not counted: a no-op edit of the pagination offset (re-done as S04), two edits of `Device.toOldJSON` (it has no callers, so it is dead code; re-done on `getOldDevice`), and three edits whose search text did not match.

## 2. Results

File names are relative to `server/`; the line is where the edited text starts. "Test files run" are the characterization files that were run for that mutation.

| Id | File:line | Mutation | Test files run | Result |
| --- | --- | --- | --- | --- |
| S01 | `controllers/SessionController.js:123` | getOpenSessions admin check removed | SessionController | CAUGHT: requires an admin and lists open sessions with their user and share sessions |
| S02 | `controllers/SessionController.js:47` | sessions list desc flag inverted (DESC/ASC) | SessionController | CAUGHT: lists the first page for admin and root |
| S03 | `controllers/SessionController.js:102` | numPages ceil->floor | SessionController | CAUGHT: lists the first page for admin and root |
| S04 | `controllers/SessionController.js:81` | pagination offset forced to 0 | SessionController | CAUGHT: sorts, filters and paginates |
| S05 | `controllers/SessionController.js:342` | session middleware ownership check disabled (any user may access others sessions) | SessionController | CAUGHT: GET returns the open session with its library item |
| S06 | `controllers/SessionController.js:364` | DELETE canDelete check disabled | SessionController | CAUGHT: deletes as root only, closing open sessions first |
| S07 | `controllers/SessionController.js:234` | batchDelete destroy where-filter removed | SessionController | CAUGHT: validates, requires an admin and deletes in bulk |
| S08 | `controllers/PodcastController.js:448` | updateEpisode enclosure type always null | PodcastController | CAUGHT: updates enclosure, chapters and publishedAt |
| S09 | `controllers/PodcastController.js:451` | updateEpisode chapter validation drops start check | PodcastController | CAUGHT: updates enclosure, chapters and publishedAt |
| S10 | `controllers/PodcastController.js:316` | clearEpisodeDownloadQueue call removed | PodcastController | CAUGHT: clears the queue as admin only |
| S11 | `controllers/PodcastController.js:396` | quickMatchEpisodes override flag forced false | PodcastController | CAUGHT: only overwrites existing details with override=1 |
| S12 | `controllers/PodcastController.js:398` | quickMatchEpisodes item_updated emit condition inverted | PodcastController | CAUGHT: fills missing episode details from the feed, then has nothing left to match |
| S13 | `controllers/PodcastController.js:187` | create: checkUpdatePodcastCron call removed | PodcastController | CAUGHT: creates a podcast as admin and root |
| S14 | `controllers/PodcastController.js:530` | removeEpisode: media progress destroy filter points to no row | PodcastController | CAUGHT: removes an episode but keeps the file, and cleans progress and playlists |
| S15 | `controllers/PodcastController.js:526` | removeEpisode: removeMediaItemsFromPlaylists removed | PodcastController | CAUGHT: removes an episode but keeps the file, and cleans progress and playlists |
| S16 | `controllers/PodcastController.js:547` | removeEpisode: numEpisodes update removed | PodcastController | **SURVIVED** (also full suite). REAL GAP: `Podcast.numEpisodes` column after `DELETE /api/podcasts/:id/episode/:episodeId` is never read back (the response JSON recomputes it). Pin: read the podcast row, or sort/filter by episode count, after a removal. |
| S17 | `controllers/PodcastController.js:500` | removeEpisode: hardDelete default (!== '0') | PodcastController | CAUGHT: removes an episode but keeps the file, and cleans progress and playlists |
| S18 | `controllers/PodcastController.js:374` | downloadEpisodes: empty array no longer 400 | PodcastController | CAUGHT: validates and queues the episodes through the manager |
| S19 | `controllers/MiscController.js:329` | tags list sort reversed | MiscController | CAUGHT: GET /api/tags lists distinct tags sorted case-insensitively |
| S20 | `controllers/MiscController.js:358` | renameTag: replaceTagInFilterData removed | MiscController | CAUGHT: POST /api/tags/rename validates, renames and merges |
| S21 | `controllers/MiscController.js:408` | deleteTag: removeTagFromFilterData removed | MiscController | CAUGHT: DELETE /api/tags/:tag removes a base64 encoded tag everywhere |
| S22 | `controllers/MiscController.js:363` | renameTag: tagMerged flag never set | MiscController | CAUGHT: POST /api/tags/rename validates, renames and merges |
| S23 | `controllers/MiscController.js:375` | renameTag: item_updated emit skipped | MiscController | CAUGHT: POST /api/tags/rename validates, renames and merges |
| S24 | `controllers/MiscController.js:231` | updateSortingPrefixes podcasts: change detection disabled (never updated) | MiscController | CAUGHT: normalises prefixes and recomputes sort titles of books, podcasts and series |
| S25 | `controllers/MiscController.js:266` | updateSortingPrefixes series: updateOnDuplicate column swapped | MiscController | CAUGHT: normalises prefixes and recomputes sort titles of books, podcasts and series |
| S26 | `managers/NotificationManager.js:225` | apprise axios timeout 6000->60000 | NotificationController | CAUGHT: posts the onTest notification to apprise and records the firing |
| S27 | `managers/NotificationManager.js:165` | max failed attempts >= -> > | NotificationController | CAUGHT: counts failures with ?fail=1 and disables after max failed attempts |
| S28 | `managers/NotificationManager.js:188` | queue full check >= -> > | NotificationController | **SURVIVED** (also full suite). REAL GAP: notification queue overflow (`>=` vs `>` on `maxNotificationQueue`) is never exercised. Pin: set `maxNotificationQueue: 1`, hold `sendingNotification = true`, fire three events, assert the queue length and which are dropped. |
| S29 | `managers/NotificationManager.js:175` | notifications_updated emit removed | NotificationController | CAUGHT: posts the onTest notification to apprise and records the firing |
| S30 | `managers/NotificationManager.js:189` | queue-full Logger.warn -> debug | NotificationController | **SURVIVED** (also full suite). REAL GAP: the "queue is full" log level/line. Pin: same overflow test with the Logger recorded. |
| S31 | `managers/NotificationManager.js:167` | notification.enabled=false on max failures removed | NotificationController | CAUGHT: counts failures with ?fail=1 and disables after max failed attempts |
| S32 | `managers/ApiCacheManager.js:88` | cache key without username (cross-user leak) | LibraryController, MeController, BackupController | CAUGHT: LibraryController lists libraries in display order, filtered by access (+7 more) |
| S33 | `managers/ApiCacheManager.js:7` | cache TTL 30min -> 18s | LibraryController, MeController, BackupController | **SURVIVED** (also full suite). REAL GAP: `ApiCacheManager` default TTL (30 min). The existing test injects its own `ttlOptions`; the class default is unpinned. Pin: construct with defaults and assert `cache.set` receives `ttl: 1800000` for a personalized url. |
| S34 | `managers/ApiCacheManager.js:10` | modelsInvalidatingMe drops device | LibraryController, MeController, BackupController | **SURVIVED** (also full suite). REAL GAP: `device` in `modelsInvalidatingMe` (a device change must clear cached `/me` responses). Pin: warm `/me`, create a device row, assert the cache entry is gone. |
| S35 | `managers/ApiCacheManager.js:83` | sort=random cache bypass disabled | LibraryController, MeController, BackupController | **SURVIVED** (also full suite). REAL GAP: `?sort=random` bypasses the cache. Pin: two identical `?sort=random` requests through the middleware must both reach the handler. |
| S36 | `managers/RssFeedManager.js:275` | getFeedOptionsFromReqOptions preventIndexing default flipped (===true) | RSSFeedController | CAUGHT: 7 failing incl. lists no feeds, then all open feeds with episodes |
| S37 | `managers/RssFeedManager.js:187` | public feed Content-Type text/xml -> application/xml | RSSFeedController | **SURVIVED** (also full suite). REAL GAP: `GET /feed/:slug` is not requested by any test; Content-Type `text/xml` is unpinned. Pin: open a feed, then `GET /feed/<slug>` and snapshot status, content-type and body. |
| S38 | `managers/RssFeedManager.js:358` | handleCloseFeed rss_feed_closed emit removed | RSSFeedController | CAUGHT: closes a feed it opened and 404s afterwards |
| S39 | `managers/RssFeedManager.js:44` | init: invalid-feed cleanup disabled | RSSFeedController | **SURVIVED** (also full suite). REAL GAP: `RssFeedManager.init` removal of feeds whose entity is gone. Pin: insert a feed row with a dangling `entityId`, call `init()`, assert the row is deleted. |
| S40 | `managers/RssFeedManager.js:120` | checkFeedRequiresUpdate (libraryItem) always false | RSSFeedController | **SURVIVED** (also full suite). REAL GAP: `checkFeedRequiresUpdate` for `libraryItem` feeds (stale feed is rebuilt on request). Pin: open a feed, touch the item/episode `updatedAt`, `GET /feed/<slug>`, assert the xml changed. |
| S41 | `managers/RssFeedManager.js:253` | getFeedCover mime type fixed to image/png | RSSFeedController | **SURVIVED** (also full suite). REAL GAP: `GET /feed/:slug/cover` mime type. Pin: request the cover of a feed with a `.jpg` cover and snapshot `content-type`. |
| S42 | `models/Device.js:158` | getOldDevice browserName forced null | SessionController, MeController, Database | **SURVIVED** (also full suite). REAL GAP: `Device.getOldDevice` browserName/osName/manufacturer mapping; fixtures have devices with empty extraData. Pin: create a session with a device row carrying extraData and snapshot `deviceInfo` in `GET /api/sessions`. |
| S43 | `models/Device.js:149` | getOldDevice 'Abs Android' -> 'Abs Androidx' (sdkVersion vs browserVersion split) | SessionController, MeController, Database | **SURVIVED** (also full suite). REAL GAP: `Abs Android` routes `deviceVersion` to `sdkVersion` instead of `browserVersion`. Pin: two device rows (web, android) with a `deviceVersion`, snapshot both `deviceInfo`. |
| S44 | `models/Device.js:117` | user->device FK onDelete CASCADE -> SET NULL | SessionController, MeController, Database, UserController | **SURVIVED** (also full suite). REAL GAP: user delete cascade to `devices` (`onDelete: CASCADE`). Pin: delete a user that owns a device and assert zero device rows. |
| S45 | `objects/PlaybackSession.js:86` | getOldPlaybackSession libraryItemId forced null | SessionController, MeController | CAUGHT: SessionController lists the first page for admin and root (+5 more) |
| S46 | `objects/PlaybackSession.js:105` | getOldPlaybackSession startedAt uses updatedAt | SessionController, MeController | **SURVIVED** (also full suite). REAL GAP: `startedAt` mapped from `createdAt`, not `updatedAt`. Pin: seed a session with different `createdAt`/`updatedAt` and snapshot `startedAt`. |
| S47 | `objects/PlaybackSession.js:89` | getOldPlaybackSession mediaType forced 'book' | SessionController, MeController | **SURVIVED** (also full suite). REAL GAP: podcast-episode sessions are mapped to `mediaType: "podcast"` (and `episodeId`/`bookId`). Pin: seed a `podcastEpisode` playback session and snapshot it in `GET /api/sessions` and `GET /api/me/listening-sessions`. |
| S48 | `objects/PlaybackSession.js:152` | getFromOld deviceId forced null | SessionController, MeController, ScannerOrchestration | **SURVIVED** (also full suite). REAL GAP: `PlaybackSession.getFromOld` writes `deviceId` (the session-to-device link). Pin: close a session created with deviceInfo and read `deviceId` from the row or `device` in the sessions list. |
| S49 | `objects/PlaybackSession.js:148` | getFromOld serverVersion forced null | SessionController, MeController | **SURVIVED** (also full suite). REAL GAP: `serverVersion` stored on the session row. Pin: create a session through `createFromOld` and read the column. |
| S50 | `utils/queries/userStats.js:110` | getStatsForYear booksWithCovers cap 25 -> 24 | StatsController, MeController, MiscController | **SURVIVED** (also full suite). REAL GAP: user year-stats cap of 25 `booksWithCovers`. Pin: seed 26 books with cover files and sessions, assert 25 ids. |
| S51 | `utils/queries/userStats.js:143` | genre filter drops 'audio book' exclusion | StatsController, MeController, MiscController | **SURVIVED** (also full suite). REAL GAP: user year-stats genre filter ("audiobook"/"audio book" excluded). Pin: add a session with genres `["Audio Book","Fantasy"]` and assert it is not in `topGenres`. |
| S52 | `utils/queries/userStats.js:164` | topAuthors slice(0,3) -> (0,4) | StatsController, MeController, MiscController | **SURVIVED** (also full suite). REAL GAP: user year-stats `topAuthors` limited to 3. Pin: sessions for four authors, assert three are returned. |
| S53 | `utils/queries/userStats.js:116` | monthListeningMap month index +1 | StatsController, MeController, MiscController | CAUGHT: MeController aggregates the year for the user |
| S54 | `utils/queries/userStats.js:20` | year query upper bound year+2 (getUserListeningSessionsForYear) | StatsController, MeController, MiscController | CAUGHT: MeController aggregates the year for the user |
| S55 | `utils/queries/adminStats.js:85` | getStatsForYear total size not accumulated | StatsController, MiscController | CAUGHT: StatsController aggregates books and listening for 2024 and 2023 |
| S56 | `utils/queries/adminStats.js:126` | topAuthors sorted ascending | StatsController, MiscController | CAUGHT: StatsController aggregates books and listening for 2024 and 2023 |
| S57 | `utils/queries/adminStats.js:30` | numAuthorsAdded forced 0 | StatsController, MiscController | CAUGHT: StatsController aggregates books and listening for 2024 and 2023 |
| S58 | `Logger.js:84` | socket log listener threshold >= -> > | MiscController, SocketAuthority, Database, ServerBoot | SURVIVED characterization; CAUGHT by the full suite only: Logger (test/server/Logger.test.js) "should emit log to all connected sockets with appropriate log level" |
| S59 | `Logger.js:104` | ConsoleMethods WARN 'warn' -> 'info' | MiscController, SocketAuthority, Database, ServerBoot | SURVIVED characterization; CAUGHT by the full suite only: Logger (test/server/Logger.test.js) "should call console.warn for warn logging" |
| S60 | `Logger.js:112` | #log level gate < -> <= | MiscController, SocketAuthority, Database, ServerBoot | CAUGHT: Server boot logs the startup sequence (+3 more) |
| S61 | `models/Book.js:300` | getTracklist startOffset not accumulated | LibraryItemController, SessionController, LibraryController | CAUGHT: LibraryItemController returns the minified item or the expanded item (+11) |
| S62 | `models/Book.js:283` | checkCanDirectPlay every -> some | LibraryItemController, SessionController, LibraryController | **SURVIVED** (also full suite). REAL GAP: `Book.checkCanDirectPlay` requires every included track to be playable (`every`, not `some`). Pin: `POST /api/items/:id/play` with `supportedMimeTypes` covering only one of two track mime types and assert `playMethod` (transcode) in the session. |
| S63 | `models/Book.js:334` | Book.size ignores ebook file size | LibraryItemController, SessionController, LibraryController | CAUGHT: LibraryItemController returns the minified item or the expanded item (+12) |
| S64 | `controllers/EmailController.js:133` | adminMiddleware 404 -> 403 | EmailController | CAUGHT: returns default settings to admins and 404 to user/guest |
| S65 | `controllers/EmailController.js:79` | ereader-devices-updated emit name altered | EmailController | CAUGHT: saves devices, emits to admins and persists |
| S66 | `controllers/ToolsController.js:96` | embedAudioFileMetadata forceEmbedChapters forced true | ToolsController | CAUGHT: starts the embed with parsed options |
| S67 | `controllers/ToolsController.js:128` | batchEmbedMetadata inaccessible item 403 -> 404 | ToolsController | CAUGHT: 403s when the admin cannot access an item |
| S68 | `controllers/ToolsController.js:45` | encodeM4b already-processing check disabled | ToolsController | CAUGHT: rejects an item that is already merging |
| S69 | `controllers/CollectionController.js:116` | findAll library access filter removed | CollectionController | **SURVIVED** (also full suite). REAL GAP: `GET /api/collections` hides collections of libraries the user cannot access. Pin: a user restricted to one library, collections in two libraries, assert only one is listed. |
| S70 | `controllers/CollectionController.js:87` | create: collection book order index+1 -> index | CollectionController | **SURVIVED** (also full suite). REAL GAP: `collectionBooks.order` starts at 1 on create. Pin: read the `collectionBook` rows (or `books` order after an insert) after `POST /api/collections`. |
| S71 | `controllers/CollectionController.js:62` | create: invalid-books count check weakened | CollectionController | CAUGHT: ignores items from another library |
| S72 | `controllers/SeriesController.js:84` | update: series_updated emit removed | SeriesController | CAUGHT: updates name and description |
| S73 | `controllers/SeriesController.js:52` | findOne progress isFinished === -> > 0 | SeriesController | CAUGHT: includes progress and rssfeed |
| S74 | `controllers/AuthorController.js:430` | middleware library access 404 check removed | AuthorController | CAUGHT: 404s for unknown ids and inaccessible libraries |
| S75 | `controllers/SearchController.js:145` | findPodcasts default country us -> uk | SearchController | CAUGHT: validates the term and searches |
| S76 | `controllers/SearchController.js:190` | findChapters region lower-casing removed | SearchController | CAUGHT: validates the asin and returns chapters |
| S77 | `controllers/SearchController.js:226` | getAllProviders audiobookcovers filter removed | SearchController | CAUGHT: lists the built-in providers |
| S78 | `managers/CacheManager.js:45` | handleCoverCache default width 400 -> 401 | CacheController, LibraryItemController, AuthorController | CAUGHT: redirects with X-Accel when configured (+2) |
| S79 | `managers/CacheManager.js:105` | purgeEntityCache startsWith -> includes | CacheController, LibraryItemController, AuthorController | **SURVIVED** (also full suite). EQUIVALENT in practice: cache file names start with the entity UUID (`<uuid>_<w>x<h>.<fmt>`), so `includes` and `startsWith` select the same files; only a name embedding a second id would differ. |
| S80 | `models/Podcast.js:115` | createFromRequest maxNewEpisodesToDownload 3 -> 4 | PodcastController | CAUGHT: creates a podcast as admin and root |
| S81 | `models/Podcast.js:114` | createFromRequest maxEpisodesToKeep 0 -> 1 | PodcastController | CAUGHT: creates a podcast as admin and root |
| S82 | `models/Podcast.js:94` | createFromRequest description sanitize removed | PodcastController | CAUGHT: creates a podcast as admin and root |
| S83 | `models/Podcast.js:281` | Podcast.updateFromRequest lastEpisodeCheck update disabled | PodcastController | **SURVIVED** (also full suite). REAL GAP: `Podcast.updateFromRequest` accepting a numeric `lastEpisodeCheck`. Pin: `PATCH /api/items/:id/media` with `lastEpisodeCheck` and read the column. |
| S84 | `Database.js:232` | sequelize transactionType IMMEDIATE -> DEFERRED | Database | **SURVIVED** (also full suite). EQUIVALENT under test conditions: `transactionType` only changes SQLite lock acquisition under concurrent writers; no single-connection test can observe it. |
| S85 | `Database.js:244` | SQLITE_CACHE_SIZE env name altered | Database | CAUGHT: connect() applies the allowed SQLITE_* pragmas from the environment |
| S86 | `Database.js:203` | ANALYZE query removed | Database | CAUGHT: creates a new database: file, flags, models, tables, triggers and default settings |

## 3. Real gaps, in priority order

Priority follows how much user-visible or security-relevant behaviour is unpinned, then how cheap the test is.

1. **Public RSS feed routes are not exercised at all (S37, S40, S41, S39).** `GET /feed/:slug`, `/feed/:slug/item/:episodeId` and `/feed/:slug/cover` are served by `RssFeedManager.getFeed*` and no test requests them, so content type, cover mime type, the "feed is stale, rebuild" logic and the startup cleanup of feeds with a missing entity can all change silently. Add `GET /feed/<slug>` after opening a feed (snapshot headers and xml), a stale-feed rebuild test, a cover request, and an `init()` test with a dangling feed row.
2. **Playback session and device mapping (S42, S43, S44, S46, S47, S48, S49).** All fixtures use book sessions with empty device data. Add one podcast-episode session and one session with a web device and an Android device (with `extraData` and `deviceVersion`) and snapshot `GET /api/sessions` and `GET /api/me/listening-sessions`; add a user-delete test that counts device rows.
3. **NotificationManager queue overflow (S28, S30).** Nothing tests the "sending, queue full, drop" branch or the later drain of the queue. Add a test that holds `sendingNotification`, fires `maxNotificationQueue + 2` events and asserts queue length, the dropped events and the logged warning.
4. **ApiCacheManager defaults (S33, S34, S35).** The existing `test/server` test injects its own TTL, and the characterization harness effectively runs without the cache, so the 30 minute default, `?sort=random` bypass and `device` invalidation of `/me` are unpinned. Add default-constructor tests for these three.
5. **CollectionController access and ordering (S69, S70).** `GET /api/collections` library filter for restricted users and the 1-based `order` of new collection books. Add a restricted-user listing test and a row-level order assertion.
6. **User year stats limits (S50, S51, S52).** The 2024 fixture has 2 authors and 2 genres, no "Audiobook" genre and fewer than 25 covers, so the caps and the genre filter never bite. Extend the fixture to 4 authors, an "Audio Book" genre and 26 books with covers.
7. **Direct play decision (S62).** `Book.checkCanDirectPlay` with mixed track mime types. Add a play request whose `supportedMimeTypes` covers only some tracks and assert transcode.
8. **Podcast column updates (S16, S83).** `numEpisodes` after an episode delete and `lastEpisodeCheck` through `PATCH /api/items/:id/media` are not read back. Assert the stored columns.

The two equivalent mutants (S79, S84) need no test.

## 4. Not covered / limits

- `ScannerPodcast.test.js` skips without ffmpeg, and no scanner-podcast file under `server/scanner/` was mutated; podcast coverage here comes from `PodcastController`, `Podcast`, `PodcastManager`-adjacent controller paths only. `PodcastManager.js` itself was not mutated (its download/RSS paths need network stubs I did not read).
- `PlaybackSessionManager.js` was read but not mutated: `SessionController.test.js` replaces it with a fake, and `HlsRouter.test.js` needs ffmpeg. Its sync/close/stale-session (36 hour cutoff) logic is therefore only reachable through `test/server`, which I did not mutate against. This is itself a finding: the real manager is not under characterization.
- `utils/queries/libraryFilters.js`, `libraryItemsBookFilters.js`, `libraryItemsPodcastFilters.js`, `seriesFilters.js`, `authorFilters.js` and `models/LibraryItem.js` were not mutated (large; time).
- Mutations touching only log text were limited to the `Logger` level machinery; log message strings snapshotted by `ServerBoot`/`OidcFlow` were not re-sampled.
- The ServerBoot-dependent mutation (Logger level gate) takes about 45 s per run; the other Logger and Database mutations were run against ServerBoot only where listed.
- Survivors were batched in groups for the full-suite confirmation (see the method note); the per-mutation "also full suite" label means "survived inside its group".
- One flake guard: no mutation result depended on a retry. The F13 `elapsed` flake from the first sweep did not occur in these runs.
