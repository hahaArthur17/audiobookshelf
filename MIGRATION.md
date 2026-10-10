# Arthur Phase 3 migration index

Status: Stage 1 (`server/utils/`) resumed on 2026-10-11 Auckland time from accepted commit `54bd5be7`; Batches 01–10 and 12 accepted, **28/46 migrated, 18 remaining**. Batch 11 (OPF/EPUB) is assigned in an isolated parser worktree. Stage 1 is not yet complete or accepted as a whole. Stage 2–8 are outside this run.

## Starting point

- Common experiment baseline: `7d10b8fc4abe57a4e777a07b7b462ca32c33371c`.
- This branch: `arthur/phase3-contract-agents`, created from Arthur Phase 2 commit `5f37b6a7932ec53ce00d56f2888f6f7c057ae746`.
- Frozen Stage 1 target list: `evidence/arthur/phase3/stage1-target-manifest.txt` (46 first-party JS files).
- Full strategy and acceptance plan: `../agentic development report/Arthur-Audiobookshelf-Phase3-Staged-Migration-Plan-2026-10-10.md` outside this repository.
- Phase 2 contract/context and run evidence: `evidence/arthur/phase2-*.md`.

## Rules

1. For each small batch: inspect target files and callers; fix the input/output, CommonJS, side-effect and error contract; delegate nonoverlapping file ownership; integrate; run a clean strict build and all original tests; compare observable behavior with the immediately prior accepted commit and the common baseline; record differences.
2. Preserve runtime behavior, existing test files and `tsconfig.server.json`. No new explicit `any`, `@ts-ignore` or double assertions to hide typing problems. Main agent owns shared types, contract, evidence and commits.
3. Phase 2 already has one documented Google Books behavior difference for missing `volumeInfo`. Treat it as a pre-existing exception candidate, not a new Stage 1 change; group acceptance of this exception remains unconfirmed.
4. Baseline bugs are logged separately from language migration. An unexplained new behavior difference blocks batch acceptance.
5. Keep accepted batches as reviewable commits. Do not start Stage 2 automatically, even if account quota remains.

## Current Stage 1 evidence

- `evidence/arthur/phase3/stage1-context.md`
- `evidence/arthur/phase3/stage1-contract.md`
- `evidence/arthur/phase3/stage1-run.md`
- `evidence/arthur/phase3/logs/`

Update this index after each accepted batch with its commit, migrated/remaining count, exception list and next action.

## Accepted batches

| Batch | Files | Checks | Result |
| --- | --- | --- | --- |
| 01 | `globals`, `longTimeout`, `requestUtils`, `stringifySequelizeQuery` | Fresh strict build 0 errors; unchanged tests 356/356; fixed sample equal to Phase 2 baseline; emitted JS review | Accepted; see `stage1-run.md` and `logs/batch-01-*` |
| 02 | `parseNfoMetadata`, `parseOPML`, `parseUserAgent`, `opmlGenerator` | Fresh strict build 0 errors; unchanged tests 356/356; fixed parser/OPML sample equal to baseline; emitted JS review | Accepted after main-agent export-shape repair; see `stage1-run.md` and `logs/batch-02-*` |
| 03 | `authorFilters`, `userStats`, `adminStats` | Fresh strict build 0 errors; unchanged tests 356/356; fixed offline query sample equal to baseline; emitted JS review | Accepted after main-agent require-order repair; see `stage1-run.md` and `logs/batch-03-*` |
| 04 | `constants`, `notifications`, `htmlEntities`, `htmlSanitizer` | Fresh strict build 0 errors; unchanged tests 356/356; fixed static/HTML sample and Phase 2 metadata JSON equal to baseline | Accepted; see `stage1-run.md` and `logs/batch-04-*` |
| 05 | `parseSeriesString`, `abmetadataGenerator` | Fresh strict build 0 errors; unchanged tests 356/356; fixed series/metadata sample, prior batch samples and Phase 2 metadata JSON equal to baseline | Accepted after main-agent emitted-JS repair; see `stage1-run.md` and `logs/batch-05-*` |
| 06 | `seriesFilters`, `libraryItemFilters` | Fresh strict build 0 errors; unchanged tests 356/356; fixed offline query sample and all prior batch samples equal to baseline | Accepted after main-agent emitted-JS repair; see `stage1-run.md` and `logs/batch-06-*` |
| 07 | `hlsPlaylistGenerator`, `profiler`, `rateLimiterFactory` | Fresh strict build 0 errors; unchanged tests 356/356; fixed HLS/profiler/disabled-rate-limit sample and Batches 01–04 samples equal to baseline | Accepted; see `stage1-run.md` and `logs/batch-07-*` |
| 08 | `parseComicInfoMetadata`, `parseComicMetadata`, `parseEbookMetadata` | Fresh strict build 0 errors; unchanged tests 356/356; fixed mock archive/XML/EPUB sample and all prior batch samples equal to baseline | Accepted; see `stage1-run.md` and `logs/batch-08-*` |
| 09 | `areEquivalent` | Fresh strict build 0 errors; unchanged tests 356/356; fixed nested/function/date/circular sample and all prior batch samples equal to baseline | Accepted; see `stage1-run.md` and `logs/batch-09-*` |
| 10 | `parseNameString` | Fresh strict build 0 errors; unchanged tests 356/356; fixed name/CJK/invalid-input sample and all prior batch samples equal to baseline | Accepted; see `stage1-run.md` and `logs/batch-10-*` |
| 12 | `parseOverdriveMediaMarkers` | Fresh strict build 0 errors; unchanged tests 356/356; fixed XML/marker/time/error sample and all prior batch samples equal to baseline | Accepted; see `stage1-run.md` and `logs/batch-12-*` |

Next: integrate and independently verify Batch 11 when its isolated parser work is ready; review the read-only query survey, freeze a bounded contract, then continue Stage 1 in small batches. Do not count isolated or unverified work as complete. The larger query, media and migration files require their own later batches.

Remaining Stage 1 targets:

```text
server/utils/comicBookExtractors.js
server/utils/ffmpegHelpers.js
server/utils/fileUtils.js
server/utils/index.js
server/utils/libraryHelpers.js
server/utils/migrations/absMetadataMigration.js
server/utils/migrations/dbMigration.js
server/utils/migrations/oldDbFiles.js
server/utils/parsers/parseEpubMetadata.js
server/utils/parsers/parseFullName.js
server/utils/parsers/parseOpfMetadata.js
server/utils/podcastUtils.js
server/utils/prober.js
server/utils/queries/libraryFilters.js
server/utils/queries/libraryItemsBookFilters.js
server/utils/queries/libraryItemsPodcastFilters.js
server/utils/scandir.js
server/utils/zipHelpers.js
```
