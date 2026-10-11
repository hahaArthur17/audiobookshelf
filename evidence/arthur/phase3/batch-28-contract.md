# Batch 28 frozen contract — `dbMigration`

Status: frozen by the main Agent before source migration. The read-only Sub-Agent survey and fixture were reviewed against the Phase 2 compiled module and accepted Stage 1 checkout; their outputs matched byte-for-byte (SHA-256 `6996109dffccefa2b16c297bbde92f06c1d86ba6961063399525224c2dc87fa5`).

## Scope and baseline

- Convert only `server/utils/migrations/dbMigration.js` to `.ts`, deleting the `.js` source after the rename. Do not edit caller, tests, config, lockfiles, shared declarations, or other source.
- Baseline is accepted commit `3ad91fe2` (Phase 2 source ancestry). The target JS file is byte-identical to Phase 2. The isolated worktree had a fresh strict server build before the behavior fixture ran; fixture dependencies at this boundary are deterministic stubs.
- The sole direct caller is `server/Database.js`: it calls `checkShouldMigrate`, `migrate`, `migrationPatch`, and `migrationPatch2` during database load. No existing test directly imports this module.

## CommonJS and module state

- Keep the direct CommonJS object with exactly these enumerable own keys, in this order: `migrate`, `checkShouldMigrate`, `migrationPatch`, `migrationPatch2`. Each is an `async` arrow function assigned as a property; the observed function arities are 1, 0, 1, 1 and none has an own `prototype`. Preserve the named-property `require()` shape without a default wrapper.
- `oldDbIdMap` and `prefixesToIgnore` are module-scope mutable state. `oldDbIdMap` is not reset at the beginning of a migration or patch. `migrateSettings` can replace the ignored-prefix array when legacy server settings contain `sortingPrefixes`; patch2 can replace it from `global.ServerSettings`. Preserve the current lifetime and mutation points.
- Keep caller receiver use where present (`ctx`, model instances, `queryInterface.sequelize.transaction`) and preserve promise settlement and thrown error identity/wrapping.

## Main `migrate` behavior

- Load/mutate/write stages are sequential: `libraries` → `settings` → `libraryItems` → `authors` → `series` → `users` → `sessions` → `collections` → `playlists` → `feeds`; authors and series require the complete old library-item list loaded before their own writes. `libraryItems` and sessions are processed in chunks of 1000.
- Preserve each stage's model write order. The fixture observes the complete nonempty order as `library`, `libraryFolder`, `setting`, `author`, `series`, `book`, `podcast`, `podcastEpisode`, `bookSeries`, `bookAuthor`, `libraryItem`, `user`, `mediaProgress`, `device`, `playbackSession`, `collection`, `collectionBook`, `playlist`, `playlistMediaItem`, `feed`, `feedEpisode`.
- Keep old→new ID mapping dependencies and omission behavior for unresolved references. Keep input mutations such as assigning podcast episode `audioFile.index = 1`, supplying missing `libraryFiles[].isSupplementary = null`, and mutating legacy bookmark IDs. The fixed sample also records deterministic UUID assignment, sorting-prefix titles, duration calculation, relation rows, and playlist ordering/type behavior.
- Preserve nontransactional writes. A model write rejection stops later stages and escapes as the same error object; cache purge failures are logged/caught, then `zipWrapOldDb` still runs. A failed earlier write prevents subsequent model writes and archive wrapping.
- `checkShouldMigrate` checks legacy directories first and short-circuits true; otherwise it checks the old-db zip.

## `migrationPatch` behavior

- Describe `libraries`; when `extraData` is absent, add `libraryItems.extraData`, `podcastEpisodes.extraData`, and `libraries.extraData` inside one Sequelize transaction. It then checks `ConfigPath/oldDb.zip`; missing zip and failed extraction return `undefined` after their observed preceding work.
- With an extracted zip, load old items and match by `ino`; map old item and episode IDs; bulk-update matched podcast episodes before library items, both with `updateOnDuplicate: ['extraData']`. Then map libraries by exact name and ordered folder-path join, mutate `extraData.oldLibraryId`, call `changed` and `save` sequentially; mutate/save users' old bookmarks, accessible library IDs, and legacy `se_` series-hide entries; finally remove extracted legacy folders.
- The success fixture pins these writes/mutations and the final cleanup order. A row update failure is not caught/wrapped: the same error rejects the patch, later library/user writes and folder cleanup do not occur. The schema transaction's async rejection also escapes with original identity; the local `try/catch` does not catch a rejected promise returned without `await`.

## `migrationPatch2` behavior

- Describe `feeds`, `authors`, then `bookAuthors`. Return `false` without a transaction or backfill when all three sentinel columns (`coverPath`, `lastFirst`, `createdAt`) exist.
- Otherwise run conditional column additions in one transaction. If `authors.lastFirst` was missing, preserve the ordered 500-row backfills for library-item sizes, book duration/title prefix, podcast title prefix, author `lastFirst`, and series name prefix. If `bookAuthors.createdAt` was missing, backfill book-author then book-series dates via their existing raw SQL statements. Keep the current short-page termination and exact-multiple extra page query.
- Column transaction and backfills share a `try/catch`: failures log once and reject with a new `Error('Migration 2.3.3+ failed ' + error)`. Backfill failure happens after the schema transaction has committed and may follow earlier successful row updates. Preserve generated row order, update-on-duplicate columns, `isNaN`/`Number` coercion, title-prefix handling, date formatting, and SQL string construction.

## Fixture and acceptance checks

`check-batch-28.cjs <checkout-root>` requires the compiled `dist-server/server/utils/migrations/dbMigration.js`, intercepts its direct dependencies with in-memory deterministic stubs, and emits stable JSON. It covers:

- export order/arity/own-prototype observations and `checkShouldMigrate` short-circuit cases;
- full main-migration load/write order, ID mapping, related rows, sorting/duration, playlist ordering, input mutation, cache failure, zip call, and same-error partial-write behavior;
- patch1 no-zip and extraction-false skip paths, column transaction, transaction rejection identity, extracted-zip inode mappings, item/episode update order, library/user mutations and save calls, directory cleanup, and row-update error/partial behavior;
- patch2 already-present-column skip, conditional column transaction, 500+1 size pages, fixed values and raw SQL, transaction rejection wrapping, and post-commit backfill failure wrapping/logging.

Two consecutive baseline invocations produced byte-identical output at `logs/batch-28-baseline.json`. This is an offline behavior fixture. The main Agent's separate `check-batch-28-sqlite.cjs` uses an in-memory SQLite database to verify schema creation and repeated-patch skip behavior against the compiled Phase 2 baseline. These fixtures do not exercise full Sequelize model validation, actual zip extraction/filesystem behavior, or production legacy data. Before acceptance, run a fresh strict server build, all unchanged 356 tests, both fixtures against baseline and candidate, and review emitted JavaScript and source diffs.
