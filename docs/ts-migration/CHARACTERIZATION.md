# Characterization tests: coverage and findings

`test/characterization/` records the server's current HTTP behaviour (real `ApiRouter`, middleware, permissions, controllers, models, serialization; in-memory SQLite; stub login; `SocketAuthority`/`Watcher` stubbed and recorded). See `test/characterization/README.md` for how it works and how to extend it. A failing snapshot means behaviour changed.

## Coverage
All 23 controllers, every route in `ApiRouter`, `PublicRouter` and the controllers' public routes. About 610 tests, 6 skipped. `npm test` runs 967 tests in ~100s.

| Controller | Tests | Controller | Tests |
|---|---|---|---|
| Library | 64 | Playlist | 21 |
| LibraryItem | 110 | Session | 14 |
| Me | 67 | Podcast | 27 |
| User | 35 | Misc | 38 |
| Author | 20 | FileSystem | 15 |
| Series | 8 | Backup | 17 |
| Collection | 11 | CustomMetadataProvider | 8 |
| Search | 19 | Email | 19 |
| Tools | 22 | Notification | 18 |
| Cache | 6 | RSSFeed | 16 |
| ApiKey | 15 | Share | 29 |
| Stats | 9 | | |

`AuthRoutes.test.js` (17 tests) runs the real passport local and jwt strategies, `TokenManager` and `Auth.initAuthRoutes` (via `helpers/auth-harness.js`): `/login`, `/auth/refresh`, `/logout`, bearer/`?token=` auth on `/api`, the unauthenticated cover/author-image GETs, and `/auth/openid/config` without a provider.

`SocketAuthority.test.js` (19 tests) runs a fresh `SocketAuthority` on a real http server with a real socket.io server and a minimal `ws` client (`socket.io-client` is not a dependency): `auth` with jwt and api-key tokens (and every rejection), `init`/`user_online`/`user_offline`, the emitters (`emitter`, `clientEmitter`, `adminEmitter`, `libraryItemEmitter(s)`), `cancel_scan`, `message_all_users`, `set_log_listener`, the `RouterBasePath` second path, cover search events (with `CoverSearchManager` stubbed) and `close`.

`Database.test.js` (47 tests) runs `Database.init()` on a real temp-dir SQLite file (new, existing, version and build upgrade, `init(true)`, triggers, cleanup during init, corrupt file, bad pragmas) and, on the harness database, settings round trips, `libraryFilterData` helpers, playback sessions, `cleanDatabase`, `compareVersions`, `TextSearchQuery`. Migrations are covered by `test/server/migrations` and `scripts/upgrade-smoke`.

`HlsRouter.test.js` (22 tests) mounts the real `HlsRouter` as `Server.js` does, with the real `PlaybackSessionManager` and `Stream`: stream lookup, filename validation and traversal variants, headers (ranges, conditional), odd files, and a real ffmpeg transcode of a generated mp3 (skips if ffmpeg or libmp3lame is missing).

Scanner (written on macOS/Node 24 by a local agent, verified on Linux/Node 22; full detail per step in `SCANNER_REPORT.md`): `ScannerDirectory.test.js` (33; ignore rules, grouping of files into items, folder-name parsing, `scanFolder`, `LibraryItemScanData`), `ScannerBook.test.js` (42; real ffmpeg/ffprobe fixtures, epub/cbz, metadata.json/nfo/opf, cover and chapter handling, rescans), `ScannerPodcast.test.js` (21; tag mapping, episode add/remove/modify, cleanup of progress and playlists), `ScannerOrchestration.test.js` (49 + 1 skipped; `LibraryScanner.scan`, `LibraryItemScanner`, the watcher path, quick match and match-all with `axios` stubbed). Fixtures are generated at test time; the media tests skip if ffmpeg/ffprobe is missing. Durations are rounded and sizes, bit rates and encoder tags are dropped, so the snapshots held on both Homebrew ffmpeg 9.0.1 and Ubuntu ffmpeg 6.1.1.

`ServerBoot.test.js` (17 tests) boots the real `dist-server/index.js` as a child process (temp config/metadata dirs, free port, `TZ=UTC`, needs ffmpeg/ffprobe paths but skips the binary check) and talks to it over HTTP and websockets: startup log sequence, files created, `/ping` `/healthcheck` `/status`, base-path rewriting, security and CORS headers, auth wiring of `/api` vs `/hls` `/public` `/feed`, the missing web client, socket.io on both paths, SIGINT shutdown, `POST /init` then real login and API access, an empty base path with `ALLOW_CORS`, and a restart on the existing database. A child process because `Server.start()` installs process-wide `SIGINT`/`unhandledRejection` handlers.

`AuthRateLimit.test.js` (10 tests) characterizes the auth rate limiter through the real server in a child process (`helpers/child-server.js`, shared boot helper; the limiter is a process-wide singleton configured from env vars on first use): the 429 and its headers, `RATE_LIMIT_AUTH_MAX` / `_WINDOW` / `_MESSAGE`, `=0` disabling, the default of 40, which routes share the budget, and the client key.

`OidcFlow.test.js` (41 tests) runs the whole OpenID Connect login through the real `OidcAuthStrategy`, openid-client and passport against a fake identity provider (`helpers/fake-idp.js`: discovery, authorize, token with client secret and PKCE check, RS256 id_token plus JWKS, userinfo, end-session, with switches for denied access, bad signature, wrong issuer/audience, expired token, sub mismatch and endpoint failures). The browser is simulated with a cookie jar, so every hop is recorded: start (`/auth/openid` web and mobile, redirect-uri whitelist, PKCE, scope with the group/permission claims, subfolder), `/mobile-redirect`, the callback (success redirect with tokens and cookies, every error redirect together with the error and warning lines that were logged), user matching (sub, email, username, linking, inactive, auto-register), group and advanced-permission claims, the issuer config helper, the mobile app flow with `code_verifier`, logout end-session URLs, and strategy lifecycle. It runs in process on `startAuthApi`; the rate limiter is bypassed there (see `AuthRateLimit.test.js`).

Skipped (6): real zip download (`GET /libraries/:id/download`), author image resize (needs ffmpeg), item cover upload and cover cache-miss resize (LibraryItem), `POST /notifications` without `urls` (hangs), `GET /logger-data` with no log manager (hangs).

## Not covered yet
Nothing planned is left. Not exercised: a real provider (Keycloak, Authentik) and its quirks, `PATCH /api/auth-settings` switching the OIDC strategy on and off (needs the real `Server` wiring; `useAuthStrategy`/`unuse` are covered directly), and Windows. The upgrade smoke test (`scripts/upgrade-smoke`) covers migrations end to end.

## Findings (recorded as-is, nothing fixed)
Reported by the test-writing agents while reading the code and recording responses; not independently verified beyond the snapshots. Candidates for upstream issues, roughly by importance.

**Access control / data exposure**
- `GET /api/series/:id` ignores library access: a user limited to library B gets 200 for a series in library A.
- `PATCH /api/me/progress/:libraryItemId` has no library or tag access check; a restricted user can write progress for items they cannot access, and `GET /me/items-in-progress` then returns them (also items hidden from continue listening).
- `GET /api/items/:id/cover` has no `checkCanAccessLibraryItem` check.
- `GET /api/custom-metadata-providers` returns raw rows including `authHeaderValue` in clear text.
- `PATCH /api/api-keys/:id` with no effective change returns `apiKey.user` as the full user row including `pash` and `token`.
- `POST /api/me/ereader-devices`: the duplicate-name 400 leaks that another user's private device has that name.
- `POST /api/validate-cron` has no permission check.

**Hangs (async handlers without try/catch under Express 4; the request never completes)**
- `POST /api/items/batch/update` with an entry that has `id` but no `mediaPayload`.
- `POST /api/notifications` with `eventName` but no `urls`.
- `GET /api/logger-data` when `Logger.logManager` is null.
- `GET /api/authors/:id/image` when the image cache path is unset.
- `GET /api/sessions` when a device's `extraData` is null.
- `GET /api/users/online` before `SocketAuthority.initialize()`.

**Wrong status codes / messages**
- `POST /api/collections/:id/batch/remove` with no body: 500 with the message "Invalid request body".
- `POST /api/items/batch/get` with no ids: 403 "Invalid payload" (should be 400).
- `PATCH /api/items/:id/cover` validation errors, `POST /api/items/:id/chapters` on a podcast/no-audio/missing item, `POST /api/items/:id/scan` on an `isFile` item: bare 500.
- `GET /api/podcasts/:id/search-episode` with no/duplicate `title`, and podcast middleware on a book item: bare 500. `POST /podcasts/opml/parse` and `download-episodes` with empty body: bare 400.
- `POST /api/backups/upload` without multipart: TypeError -> 500.
- `GET /api/users/:id` for a non-admin is let through by middleware, then the handler returns 403, even for their own id.
- Email routes return 404 to user/guest where notification and RSS routes return 403. `GET /api/sessions` for non-admins is 404.
- `GET /api/notifications/test` returns 200 even if nothing fires.
- `PATCH /api/notifications/:id` ignores the URL id and updates by the body id.

**Missing validation**
- `PATCH /api/settings` stores any types (`backupsToKeep: "many"`, `bookshelfView: "bogus"`); `allowIframe: "false"` (string) passes and is stored as a string. `POST /custom-metadata-providers` accepts any `mediaType` and URL scheme.
- `POST /api/libraries` accepts `folders: []` despite a "non-empty" message; `PATCH /libraries/:id` accepts a `mediaType` change; `POST /libraries/order` partially applies entries before failing on an unknown id.
- `POST /api/users` username uniqueness is case-sensitive while login lookup is case-insensitive; `PATCH /users/:id` accepts a case-only rename.
- `PATCH /api/playlists/:id` accepts duplicate item ids (`[A, A, B]`); `POST /playlists` accepts empty `items`; `POST /playlists/collection/:id` silently drops books the user can't see.
- `POST /api/share/mediaitem`: `expiresAt` in the past returns 201 and `share_open` but the row is deleted immediately; no `expiresAt` gives 400 (clients must send 0 for "never"); a podcast-episode share is created (201) but its public GET returns 404.
- `GET /public/share/:slug` reuses an arbitrary cookie value (even a non-uuid) as the new session id.
- `POST /api/upload`: a title that sanitizes to empty puts files in the library root; author `../Evil/Author` becomes the directory `..EvilAuthor`.

**Determinism problems in the server (matter for tests and for reasoning about behaviour)**
- Many queries have no `ORDER BY`, so list/author/episode order follows random UUIDs (series and collection listings, `GET /users/:id` media progress, feed episodes). Year stats use `ORDER BY RANDOM()` for top-N ties; the personalized "discover" shelf is random.
- `LibraryItem` `afterDestroy` calls `media.destroy()` without awaiting; row counts right after library/issue/folder deletion are racy.
- `GET /libraries/:id/series` and `/recent-episodes` return empty `results` (correct `total`) without a `limit`.
- Tag/genre rename-merge leaves duplicates in `Database.libraryFilterData`; `GET /genres` is unsorted while `GET /tags` is sorted.

**Auth routes (from `AuthRoutes.test.js`)**
- A refresh token can be used any number of times: `/auth/refresh` does not rotate it, so a stolen token stays valid until logout.
- `GET /api/items/:id/cover` and `/api/authors/:id/image` skip authentication entirely (by design, via `ignorePatterns`); an unknown id answers 400 rather than 404.
- `/logout` needs no authentication and always answers 200 `{ redirect_url: null }`, even with no token at all.
- An empty or missing login body gives 400 (passport) while a wrong password or unknown user gives 401, which tells a client the body shape was wrong.

**SocketAuthority (from `SocketAuthority.test.js`)**
- `authenticateSocket` accepts a refresh-less jwt only if it has a `userId` and is not `type: 'refresh'`; expiry is checked by the handler, not by `jwt.verify` (`ignoreExpiration`).
- An expired api key is deactivated (`isActive = false`) as a side effect of the failed socket auth.
- A socket can be re-authenticated as a different user; it is only logged as a warning.
- `cancelSocketCoverSearches` does nothing (searches of a disconnected socket just time out).
- `close()` also closes the underlying http server.

**Database (from `Database.test.js`)**
- A new DB stores no settings rows: `ServerSettings` defaults already carry the package version and buildNumber, so defaults live in memory until something saves them. Email and notification settings are never persisted by `init`.
- `createRootUser` sets `Database.hasRootUser`; seeding users directly leaves it false while `userModel.getHasRootUser()` says true.
- A corrupt db file passes `authenticate()` and fails only in the migration manager (`SQLITE_NOTADB`, logged as "Database migration failed"); the sequelize stays set on the singleton and `isNew` is false.
- `init()` with a nonexistent config dir succeeds (sqlite creates it); "Database connection failed" is reached only when `connect()` returns false (e.g. unloadable `NUSQLITE3_PATH`).
- `compareVersions('v2.3.0','2.3.0')` is 1, `('2.3.0','2.3.0-beta')` is -1, empty/null is 0; `convertToSnakeCase('ABC')` is `_a_b_c`.
- `authorNamesLastFirst` is filled only by the authors-update trigger, not the bookAuthors insert trigger. `cleanDatabase` keeps the newest duplicate `mediaProgress` row (smallest id on a tie).
- `Database` has no `getLibraryItem(s)` or `getPodcastEpisode`; only playback-session wrappers exist.
- `ServerSettings` defaults read `Logger.logLevel`, and `new ServerSettings()` throws without `global.MetadataPath`.

**HlsRouter (from `HlsRouter.test.js`)**
- `/hls` has no authentication at all: the `auth` argument is stored and never used, and `Server.js` mounts it before any auth. Anyone with a session id can fetch that user's playlist and segments.
- Traversal is blocked lexically only: a symlink inside the stream dir that points outside it is served with 200.
- A GET for a segment far from the current position triggers a reset and broadcasts `stream_reset` without authentication; the event is emitted before the reset has run, so a failing `writeConcatFile` emits `stream_error` after the 404 was sent.
- `parseSegmentFilename` is loose (`output.ts` gives NaN, `output--3.ts` gives 0, `a-5-6.ts` gives 5, `output-1e2.ts` gives 100).
- Dotfiles and a 416 Range error return express error pages whose body contains a stack trace with absolute server paths; a directory named `x.ts` gives the "Cannot GET" HTML page. `validateStreamFilePath` returns `''` rather than `false` for the stream dir itself. No request hung.

**Scanner (details and inputs in `SCANNER_REPORT.md`)**
- The copy of `metadata.json` saved under `<metadata>/items/<id>/` is read back as the last metadata source on every rescan and wins over tags: changing an audio file's tags, or deleting the folder's metadata.json, does not change the book; adding or removing audio files does not rebuild chapters.
- A corrupt replacement of the only audio file keeps the old audio entry (books and podcast episodes alike); the item is not set missing.
- `.ignore` in the library root is ignored (treated as a dotfile); in a subfolder it hides that folder. `@eaDir` matches anywhere in a path as a substring (`my@eaDirbook.mp3` is ignored). `.partial` is not an ignored extension.
- Folder parsing: only the last three folder levels feed metadata; `Series Title 2 of 3/Book` gives author `Series Title of 3`; `Title[B0015T963C]` is not an ASIN; sequence is only parsed with a series folder; a CD dir counts only directly below the item folder.
- Podcast libraries: every subfolder with audio is its own podcast (`Season 1`/`Season 2` become two podcasts); season and episode numbers are not parsed from file names (only from tags); show metadata comes from the first scanned episode, in filesystem order; if all audio disappears but the folder stays the podcast is not set missing.
- `getTrackAndDiscNumberFromFilename` calls `replace(publishedYear)` with no replacement, inserting the text `undefined`. `hasLibraryFileChanges` returns a number, not a boolean.
- Every first scan logs `metadata precedence changed ... From [Unset]` and runs as forced. `LibraryScanner.scan` does not await `saveLog()`; it rejects with ENOENT (unhandled) if `<metadata>/logs` does not exist. A cancelled scan reports `No changes needed` in its text.
- A renamed or moved item folder is matched by inode and counts as `updated`; the watcher path counts the old path's delete as an extra `missing`. `scanLibraryItem` on an `isFile` item without watcher details scans the file as a folder (`ENOTDIR`) and marks the item missing. Deleting a library leaves its items with a null `libraryId`.
- Quick match fills only empty fields unless `overrideDetails` (or the server setting `scannerPreferMatchedMetadata`, which mutates the passed options) is set.
- `hideSingleBookSeries` and `epubsAllowScriptedContent` are not read by the scanner (the first only by the query layer, the second nowhere in `server/`).

**Server boot (from `ServerBoot.test.js`)**
- `POST /init` without `newRoot` throws inside the async handler; the `unhandledRejection` handler logs FATAL and exits the whole process with code 1, so one malformed request from an unauthenticated client on a fresh (uninitialized) server stops it.
- `Access-Control-Allow-Origin` is sent as the string `undefined` when CORS is enabled (`ALLOW_CORS=1`, dev mode, or allowed origins) and the request has no `Origin` header.
- `ALLOW_IFRAME=1` is ignored on a fresh database (the env override is applied only when settings are loaded from a stored row), so the first start still sends `frame-ancestors 'self'`; it takes effect after a restart.
- A request without the base path is served as if it had it (`/ping` works as `/audiobookshelf/ping`); a lookalike prefix (`/audiobookshelfx/ping`) is a 404. Unauthenticated unknown `/api/*` paths answer 401, not 404.
- Without a built web client every client route answers 404 (an express "Not Found" page); `/hls`, `/public` and `/feed` need no authentication.
- `/status` includes `ConfigPath` and `MetadataPath` until the server has a root user.
- A first start logs `JWT secret key not found, generating one` and creates `absdatabase.sqlite`, `migrations/` under the config dir and `backups`, `cache`, `logs`, `streams` under metadata (no `items`, `tmp`, `covers`).

**Auth rate limit (from `AuthRateLimit.test.js`)**
- One budget is shared by `POST /login`, `POST /auth/refresh`, the `/auth/openid*` routes and `PATCH /api/me/password`; it counts successful requests too, so N correct logins also exhaust it. `/logout`, `/ping`, `/status` and bearer-authenticated `/api` calls are not counted.
- The limiter runs before authentication is checked, so a 429 also answers a correct password and a token-less refresh.
- The client key is `requestIp.getClientIp`, which trusts `X-Forwarded-For`: each forwarded address has its own budget, so an attacker who can set the header gets a fresh budget per value (the limit is bypassable unless a proxy overwrites the header).
- The window is `RATE_LIMIT_AUTH_WINDOW` in ms (the policy header rounds it up to whole seconds); a non-numeric or non-positive `RATE_LIMIT_AUTH_MAX` silently keeps the default of 40, and only `0` disables the limiter. The env vars are read once, the first time the limiter is created.
- The 429 body is `{ error: <message> }` (default `Too many authentication requests`) with standard `RateLimit-*` and `Retry-After` headers; every rejection logs a WARN with IP, endpoint and user agent. The 401 for a wrong password is a bare `Unauthorized` text, so clients see a different body type before and after the limit.

**OIDC (from `OidcFlow.test.js`)**
- The `auth_state` cookie is dead code: the web flow rejects a `state` query param (400) and the API-based flows skip the cookie, so it is never set.
- A mobile login that fails at the callback answers with the web redirect `/login?error=...`, never the 401/500 text. The callback checks `session.mobile === true`, but the login route stores the `redirect_uri` string there.
- With auto-register off and no matching user, `verifyCallback` logs "auto-register is disabled" and then throws `Cannot read properties of null (reading 'isActive')`; the catch turns it into the same `Unauthorized`, so only the log differs.
- If `authOpenIDSubfolderForRedirectURLs` was never set, the redirect uri is built from the literal string `undefined` (`/undefined/auth/openid/callback`); migration 2.17.4 writes `''` for existing OIDC installs.
- `GET /auth/openid` with invalid or incomplete settings answers 500 with Express' HTML error page including the stack and file paths (`getClient()` throws outside the try block).
- `/auth/openid/mobile-redirect` forwards a missing `code` as the text `undefined`. Entries in `openIdAuthSession` (mobile logins started) are removed only when `/mobile-redirect` is called for that state, so abandoned logins accumulate in memory. The route is unauthenticated and rate limited by a spoofable key.
- The `setToken` redirect parameter is the literal `null` for a user whose legacy `token` column is empty (the seeded users), and a JWT for a user created by auto-register.
- Matching: the sub is linked on the first email/username match, email and username comparisons are case insensitive, a missing `email_verified` counts as verified for matching but a new auto-registered user only gets an email if `email_verified` is truthy, and a username match works for preferred_username first, then `username`.
- Root can log in with the `admin` group (type unchanged) but is refused for any other group; the advanced-permissions claim is ignored for admins and the login is refused when it is missing, contains an unknown key, or has non-string library ids. A user created by auto-register is deleted again when any of these fail.
- Every OIDC failure the user sees is `Unauthorized` or `Error in callback`; the cause (OPError/RPError text, group claim, linked sub) is only in the server log.

**Harness/seed quirks to remember when writing more tests**
- `User.js` keeps a module-private LRU of users that outlives the database; the harness now evicts them in `stop()`, otherwise a later test's username lookup returns a previous test's user.
- The auth rate limiter is a process-wide singleton; `startAuthApi` bypasses it on its own `Auth` instance. Its real behaviour is characterized in `AuthRateLimit.test.js` via a child process.
- Scanner tests: the scanner recognizes moved folders by inode, and ext4/overlayfs reuse a freed inode for the next new file (APFS does not). Create replacement files before deleting the old ones in a test, or a "delete folder, create other folder" case turns into a rename on Linux.
- `User.createUserFromOpenIdUserInfo` signs with the `TokenManager` module the model loaded, not the fresh copy `startAuthApi` configures, so a test that auto-registers users must set `TokenManager.TokenSecret` on that one too (`OidcFlow.test.js` does); without it every auto-register fails with "secretOrPrivateKey must have a value" and the error is only in the (stubbed) log.
- Use an instance update (`row.update(...)`), not `Model.update`, to change a user in a test: `Model.update` leaves the module-private user cache stale.
- The server serves `<appRoot>/client/dist` when it exists, and a developer machine usually has one (gitignored). `ServerBoot.test.js` therefore starts the child from a temp app dir that symlinks `dist-server`, `node_modules` and `package.json` (`node --preserve-symlinks --preserve-symlinks-main`), so the "web client not built" responses hold with or without a local build. Found by the macOS check run (`LOCAL_CHECKS_REPORT.md`).
- Never snapshot a wall-clock difference: `ScanLogger.elapsed` is `finishedAt - startedAt` in ms and came out 0 or 1; the test now asserts the range and snapshots `<ms>`.
- Login responses carry `serverSettings.timeZone`, which defaults to the machine's `TZ`; `AuthRoutes.test.js` masks it (`<env>`), as it does `logLevel`.
- `createBook` leaves `explicit` NULL, which hides books from `user`/`guest`; `createLibrary` leaves `library.settings` NULL (public share GET then 500s).
- Singletons leak between tests unless reset: `CacheManager` (reset by the harness), `ShareManager`, `Logger.logLevel`, `Database.libraryFilterData`, the rate limiter on `PATCH /me/password` (40 calls per 10 minutes per process).
- `api.request` returns only `content-type` in `headers`; `set-cookie` values are on the non-enumerable `res.cookies`. It still cannot send a body on GET; use `fetch` against `api.base` for that.

### Found while closing sweep findings F1 and F2 (recorded, not fixed)

- Tag restrictions are enforced inconsistently. Item GET uses `User.checkCanAccessLibraryItemWithTags`; library item lists filter in SQL (`libraryItemsBookFilters.getUserPermissionBookWhereQuery`), which also hides books whose `explicit` is NULL from non-admins. `GET /api/collections` and `GET /api/libraries/:id/collections` do not filter books by tag at all (a restricted user sees books there that item GET answers 403). `GET /api/collections/:id` skips the check for untagged books, so an allowlist user sees an untagged book in a collection that item GET refuses. Pinned in `CollectionController` "tag restricted users".
- `Database.userModel.update(values, {where})` (the static update) leaves the in-memory user cache stale, so a deactivated user's bearer token or API key still authenticates until the cache entry is replaced. Instance `row.update()` invalidates it. The same pattern probably applies to `ApiKey`. Tests deactivate through the instance. An expired API key is also deactivated in the database as a side effect of a rejected request (pinned in `AuthRoutes`).

### Found while closing sweep findings F3 and F4 (recorded, not fixed)

- `api.request(..., { responseHeaders: [names] })` returns the requested response headers (dates, etags masked). Use it whenever a route sets a header, redirect or cookie. Pinned so far: BackupController download (`Content-disposition` unquoted and unencoded, `Cache-Control: public, max-age=0` from `sendFile` defaults, X-Accel), LibraryController OPML (no Content-Disposition), AuthorController image. Not pinned: `zipHelpers` `res.attachment` (stubbed), RssFeedManager public feed routes, cookie masking in the option itself.
- `CacheManager.handleAuthorCache` ignores `global.XAccel` on a cache hit and streams the file; `handleCoverCache` answers X-Accel.
- Emitted payloads are now recorded (scanner suites and every `item_updated` route of LibraryItemController): full item JSON, with ids as labels. Masked: ino, bitRate, timeBase, tagEncoder, lastScanVersion, time fields (replaced by `<masked>`, so a dropped field still fails), nonzero `size`; durations rounded to seconds; item lists in `items_added`/`items_updated` sorted by relPath (filesystem order differs per machine).
- Scanner: a renamed folder with the same inode is a move (`items_updated`, `isMissing: false`), not missing. A watcher move emits two `item_updated` events for one row (first `isMissing: true`, then `false`). `scanLibraryItem` with the folder gone emits `item_updated` with `isMissing: true` and `size: 0`. `authors_num_books_updated` and `author_added` come out with item events during a scan. No controller route emits `item_added`.

### Found while closing sweep findings F7, F8, F10 and F15 (recorded, not fixed)

- `GET /api/me/items-in-progress` passes `limit` through `Number(limit) || 25` and then `slice`: a negative limit drops items from the end (`-1` returns 27 of 28), `2.5` truncates, `1e1`, `0x10`, `+3` parse as numbers, `0`, `abc`, `10abc`, `NaN` fall back to 25, and a repeated `limit` (an array) falls back to 25.
- Finishing an existing progress with `{isFinished: true}` sets `progress` to 1 but leaves `currentTime` as it was, and does not unhide a hidden item; an explicit `finishedAt` is kept.
- OIDC mobile login: the body has no legacy `token`; `POST /auth/refresh` with `x-refresh-token` also sets a `refresh_token` cookie (HttpOnly, SameSite=Lax) and rotates the refresh token; the callback sets an `openid_id_token` cookie with the Secure flag; the app's `state` is passed through unchanged.
- Deleting an audio file does not reset ebook state; `isMissing` is set only when no media files remain; deleting the primary ebook nulls `ebookFile` and `ebookFormat` while a supplementary pdf stays in `libraryFiles`.

### Found while closing mutation-sweep-2 gaps 1 to 4 (recorded, not fixed)

- Public RSS feeds (`RssFeedPublic`): `.jpg` covers are served as `image/jpg` (not a valid mime type) and the requested cover path is ignored; the m4b item route serves `audio/mp4` while the XML enclosure says `audio/mpeg`; a missing audio file returns an Express HTML error page containing the full path; `updateFeedForEntity` rebuilds a stale feed without the original options (`preventIndexing: false` / `ownerName` come back as `itunes:block yes` and the author); `<item>` order has no ORDER BY, so tests sort items.
- Sessions and devices: `DeviceInfo.construct` strips tags, so a null `sdkVersion` becomes `''` for non-Android devices; `GET /api/sessions` spreads the PlaybackSession object for sessions with a joined user and uses `toJSON()` for the others (different shapes, e.g. `lastSave`); `Device.toOldJSON` and `getOldDevice` duplicate the same mapping. Raw `startedAt`/`updatedAt` are asserted because snapshots mask timestamps.
- Harness quirk: the harness hands out strictly increasing timestamps that can run ahead of the wall clock, so `Model.update` (which stamps "now") is not reliably newer than a row created earlier in the same test. Staleness checks that compare `updatedAt` (feeds) need the changed row stamped explicitly in the future via SQL; CI exposed this where local runs did not.
- NotificationManager: the queue holds `maxNotificationQueue` events plus the one sending (drops start at max+2); dropped events only log at warn; `sendingNotification` stays true for `notificationDelay` after a send finishes, so a new event in that window is still queued or dropped; `PATCH` accepts `maxNotificationQueue` 0 but `construct()` turns 0 into 20 on reload; the `onXxx` methods do not await `triggerNotification`.
- ApiCacheManager: the real `ApiRouter` caches only `GET /libraries/*` (never `/api/me`); only personalized URLs get the 30 minute TTL, others live until a hook clears them; 404 responses are cached; the manager has no method check (non-GET is uncached only because the router uses `router.get`); `afterBulkCreate` resolves the model name as `'Array'` and clears everything; any model other than device/session/playbackSession/mediaProgress clears the whole cache including `/me`. lru-cache captured `performance`, so tests stub `performance.now` (sinon fake timers do not reach it).

### Found while closing the remaining mutation-sweep gaps (collections, podcast columns, year stats, direct play, PlaybackSessionManager; recorded, not fixed)

- Collections: a single add of a book already in a collection returns 400 but a batch add returns 200 and changes nothing; removing a book renumbers the rest from 1; a normal user can access all libraries by default, so only an explicitly restricted user is filtered out of `GET /api/collections`.
- Podcast: `PATCH /api/items/:id/media` with a non-number `lastEpisodeCheck` (string, null) returns 200 and changes nothing; only a JS number is stored.
- Year stats: the genre filter uses substring `includes` ('Audiobook Classics' and 'AUDIOBOOKS' are dropped too); the cover-book and finished-book queries use `ORDER BY RANDOM()`, so tests pin counts and membership only; the year bounds compare stored `YYYY-MM-DD HH:MM:SS.SSS +00:00` strings with date strings, so `>=` vs `>` is an equivalent mutation.
- Direct play: `forceDirectPlay` wins over `forceTranscode`; a missing or non-array `supportedMimeTypes` silently transcodes (the model logs an error); excluded audio files are ignored.
- PlaybackSessionManager (real manager under test, only `Stream.prototype.start` stubbed): a progress row created by a sync is never checked against the finish thresholds (only a later sync finishes the book); `/api/session/local` stamps new progress with server time and ignores the session's `updatedAt`; `closeStaleOpenSessions` only removes sessions (no save, no emit); `saveSession` is not awaited in `syncSession`; an admin syncing another user's session writes the progress for the admin; the `user_stream_update` on close still lists the closing session; a client without `deviceId` gets a new device row per play request; a session whose episode was deleted still syncs 200 with no progress written; the server caches users with their progress, so progress changed directly in the database is invisible to the next request.

## How the suite is kept honest
`npm run audit:characterization` (see `test/characterization/README.md`) measures instead of trusting claims: 202 of 202 route handlers are hit and each has at least one 2xx/3xx response; every snapshot entry is compared by a test; no `.only`, no assertion-free test, no stub that replaces code under test; the only reshaping of responses before snapshotting is sorting where the server's own order is random, masking of times/versions/ids, and reducing the random "discover" shelf to its size. `npm run oracle:check` plus the Characterization Guard workflow stop the oracle from changing without a deliberate `[oracle-update]` commit.

Found by this sweep: a flaky snapshot on macOS (rows seeded in the same millisecond tie on `createdAt`, which the server sorts by; fixed in the harness and covered by a self-test) and two stale snapshot entries (removed).
