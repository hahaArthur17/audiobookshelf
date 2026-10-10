# Arthur Phase 3 migration index

Status: Stage 1 (`server/utils/`) in progress; Batches 01–03 accepted, **11/46 migrated, 35 remaining**. Stage 2–8 are outside this run; stop after Stage 1 and report to the user. If the Codex five-hour usage window is too low to implement and verify the next batch, stop at the last accepted batch and report partial progress.

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

Next: complete Batch 04 static definitions and HTML utilities. Quota is checked before each new batch.
