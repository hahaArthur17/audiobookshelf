# Stage 1 execution record

Status: in progress. This file records observed events, not planned outcomes.

## Start

- Date/start: 2026-10-10 06:41 UTC (approximate start of Stage 0 evidence collection).
- Branch/worktree: `arthur/phase3-contract-agents` at `/Users/miao/Documents/B学期574/Open Project/audiobookshelf-phase3`, forked from Phase 2 commit `5f37b6a7932ec53ce00d56f2888f6f7c057ae746`.
- Stage 1 scope: exactly 46 first-party `server/utils/**/*.js` targets in `stage1-target-manifest.txt`. Files outside this target and auxiliary types/evidence do not count toward the 46.
- Start environment: Node v24.11.0, npm 11.6.1, TypeScript 5.9.3; linked dependencies; unchanged package lock.
- Start check: `npm run coverage` exit 0, 356 passing, log `logs/stage0-start-coverage.log`.
- Start usage snapshot: five-hour window 8% used, weekly window 22% used from Codex account tool. Exact token and fee data unavailable.

## Batch 01 — core small utilities

- Owner: main Agent. Contract `batch-01-contract.md`, global contract v2. Migrated `globals`, `longTimeout`, `requestUtils` and `stringifySequelizeQuery` from JS to TS; original tests, configuration, dependencies and callers unchanged.
- Strict no-emit check exited 0. Initial clean `npm run build:server` exited 0; original coverage run showed 356 passing. Fixed-sample comparison initially found an instance property order change in `LongTimeout` (`timeout,timer` became `timer,timeout`), despite green tests. The TypeScript class declarations were changed to erased `declare` fields so constructor assignments retain the original order.
- An incremental rebuild then encountered the known TypeScript 5.9.3 internal Debug Failure (log `logs/batch-01-rebuild.log`), matching a Phase 2 environment issue. Moving the stale `dist-server` aside and doing a fresh build succeeded with 0 errors (`logs/batch-01-final-clean-build.log`). Final `npm run coverage` exited 0 with 356 passing (`logs/batch-01-final-coverage.log`).
- `check-batch-01.cjs` exercised direct CommonJS export types, global extension arrays, timeout callback and property order, forwarded protocol cases, symbol/class serialization and circular-input error. Final Phase 2 and candidate output files are byte-equal (`logs/batch-01-baseline.log`, `logs/batch-01-candidate.log`). Emitted JS of `longTimeout`, `globals` and `stringifySequelizeQuery` is the same as the Phase 2 build; `requestUtils` differs only by removed JSDoc comments.
- Accepted at approximately 2026-10-10 06:46 UTC. Account snapshot: five-hour window 20% used, weekly window 24% used. Exact token/fee and main Agent model billing identity unavailable. Four of 46 Stage 1 targets migrated; 42 remain. No unresolved new behavior difference in the exercised paths. This sample does not cover every possible input.

## Batch 02 — parsers and OPML generator

- Isolated Parser Sub-Agent requested `gpt-6-luna` / `xhigh` and owned only four files. Actual billed variant/effort was not exposed. Agent commit `517a6ad5ec0c2f4664b011c1293180b60304b83a` was cherry-picked as `47cb05ae`. Agent reported about three minutes of elapsed work, strict build and 356 original tests passing, and equal local fixed samples.
- Main Agent independently ran a fresh strict build (0 errors), `npm run coverage` (356 passing), and `check-batch-02.cjs` against Phase 2 and candidate builds. The fixed parser/OPML outputs matched; Batch 01 regression sample also remained equal. Raw logs are `logs/batch-02-*`.
- Emitted-JS review found a semantic export change overlooked by the initial sample: `opmlGenerator.generate` had changed from an arrow function to a normal function, adding a constructible prototype. Main Agent restored the arrow export and added callable-shape checks to the fixture. Final fixed outputs match the Phase 2 build and the generator's emitted JavaScript differs only in its comment. This is one integration repair after a green build/test result.
- Accepted at approximately 2026-10-10 06:49 UTC. Account snapshot: five-hour window 29% used, weekly window 25% used. Eight of 46 Stage 1 targets migrated; 38 remain. Exact token/fee per agent unavailable. Real external feeds and all malformed parser inputs were not exercised.

Record subsequent batches with exact file ownership and prompt, model requested versus verified, context/contract version, start/end time, code commit, clean build exit/error count, coverage result, baseline/previous-commit behavior samples and differences, repair work, current usage snapshot, migrated and remaining count.

## Known limits

- Google Books missing-volumeInfo behavior difference originated in Phase 2; group disposition pending.
- No live external provider behavior was checked by this Stage 0 run.
