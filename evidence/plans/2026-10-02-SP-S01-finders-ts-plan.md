# SP-S01: `server/finders/` to TypeScript (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the three finder files to `.ts` and give them real types, with no runtime change.

**Architecture:** Each file uses `import = require` / `export =`, `declare` fields, module-local interfaces, and single-step `as` casts only at provider calls. A diff of the compiled JS against a baseline proves nothing changed at runtime beyond the listed lines.

**Tech Stack:** TypeScript 5.x (`tsconfig.server.json`: strict, allowJs, noEmitOnError, CommonJS, ES2022), mocha/chai/sinon, Git Bash on Windows.

**Spec:** `evidence/plans/2026-10-02-SP-S01-finders-ts-design.md`. Every edit below names the spec item that defines it, and the code shapes live there.

**Departures from the writing-plans defaults, at the user's request:**

- The plan is saved under `evidence/plans/`.
- There is one task per file.
- It contains no full code listings and no tables copied from the spec.
- Baseline capture (spec §11 T1) is folded into Task 1. Final verification (spec §11 T5) is the Wrap-up section.

## Global Constraints

- Spec §2 applies in full.
- `as` may appear only as C1–C13 (§6.1). Outside the provider boundary, the only changes allowed are N1–N5 (§6.2), D1–D2 (§6.3) and K1 (§6.4).
- Existing JSDoc comments are not edited (§2, §8).
- Do not touch tests, `tsconfig.server.json`, `package*.json`, `server/providers/` or any caller file. Install nothing. Stay on `Aung-Min-Myat/phase1`, with no worktree. Never push, merge or open a PR.
- Each commit message starts with `[SP-S01] ` and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Done means `npm run build:server` exits 0 with no errors **and** `npm test` reports 356 passing, 0 failing (§1).
- If any step's result differs from its "Expected" line, **stop**, show the exact output, and do not commit.

## Review Focus

No test exercises any of the following. Each is pinned by a check in the owning task.

1. **AuthorFinder and PodcastFinder load correctly with the same export shape when a JS caller requires them.** No test loads them. Pinned by `SHAPE` in each task and in the Wrap-up.
2. **Callers that pass `null`/`undefined`** (Scanner.js:52-53 isbn/asin, SearchController.js:169 region) must behave exactly as today. Types don't run, so this is pinned by `EMITDIFF` (V5) in Tasks 2 and 3.
3. **Bug #1 path** (`findCovers` sends options into the `isbn` slot of a custom provider) must stay unfixed and unchanged. Pinned by `EMITDIFF` (V5) and the V9 count in Task 3 / Wrap-up.
4. **OpenLibrary 404 error object and the `books.length || 0` debug read** (no test reaches `getOpenLibResults`) must behave as today. Pinned by `EMITDIFF` (V5) in Task 3.
5. **No-author OpenLibrary search** (where `authorDistance` is unset) must still evaluate N2 as `false`. Pinned by `EMITDIFF` (V5) in Task 3: N2 must be the only change on that line, and its equivalence is argued in spec §6.2.

## Shared commands

Run all commands from the repo root in Git Bash. `EV` stands for `evidence/test-results/SP-S01`; always type the literal path, because shell variables don't persist between tool calls. `<F>` is the task's file name.

| Name | Command | Spec |
|---|---|---|
| `BUILD` | `npm run build:server > evidence/test-results/SP-S01/build-<F>.txt 2>&1; echo "exit=$?"` | V2/V3 |
| `TEST` | `npm test > evidence/test-results/SP-S01/test-<F>.txt 2>&1; echo "exit=$?"; grep -E "passing\|failing" evidence/test-results/SP-S01/test-<F>.txt` | V4 |
| `EMITDIFF` | `git diff --no-index -- evidence/test-results/SP-S01/emit-before/<F>.js dist-server/server/finders/<F>.js > evidence/test-results/SP-S01/emit-<F>.diff; grep -c '^-[^-]' evidence/test-results/SP-S01/emit-<F>.diff; grep -c '^+[^+]' evidence/test-results/SP-S01/emit-<F>.diff` | V5, §7 |
| `SHAPE` | `timeout 60 node -e "const a=require('./dist-server/server/finders/AuthorFinder'),p=require('./dist-server/server/finders/PodcastFinder'),b=require('./dist-server/server/finders/BookFinder');const s=(o)=>o.constructor.name+' own:'+Object.getOwnPropertyNames(o).sort().join(',')+' proto:'+Object.getOwnPropertyNames(Object.getPrototypeOf(o)).sort().join(',');console.log([a,p,b].map(s).join('\n'));console.log('BookFinder statics:'+Object.getOwnPropertyNames(b.constructor).sort().join(','));process.exit(0)" > evidence/test-results/SP-S01/shape-<label>.txt` | Review Focus 1, §5.3 |

**Approval needed:** `SHAPE` is a new verification command. It is not a test file, and nothing is added under `test/`. It was dry-run on today's compiled JS: it printed the expected names and exited 0.

---

### Task 1: PodcastFinder

**Files:** rename `server/finders/PodcastFinder.js` to `server/finders/PodcastFinder.ts`. Evidence goes under `evidence/test-results/SP-S01/`.

**Interfaces:** consumes `iTunes#searchPodcasts` (unchanged). Produces the same export as `shape-before.txt`: a `PodcastFinder` instance with `iTunesApi`, `search`, `findCovers`.

- [ ] **Step 1: Baseline (V1).** Run `npm run build:server; echo "exit=$?"` and expect `exit=0`. Then run `mkdir -p evidence/test-results/SP-S01/emit-before && cp dist-server/server/finders/*.js evidence/test-results/SP-S01/emit-before/`. Then run `SHAPE` with label `before`. Expected: 3 class lines plus a statics line; `runSearch` appears under BookFinder `proto:`, and `audnexus` under `own:`.
- [ ] **Step 2: Rename (§2).** `git mv server/finders/PodcastFinder.js server/finders/PodcastFinder.ts`
- [ ] **Step 3: Red (V2).** Run `BUILD`. Expected: `exit=` is non-zero. `grep "error TS" evidence/test-results/SP-S01/build-PodcastFinder.txt | grep -v "server/finders/PodcastFinder.ts"` must print nothing.
- [ ] **Step 4: Add types.** Edit `server/finders/PodcastFinder.ts`:
  - imports as `import … = require(…)` (§4)
  - `type iTunesPodcastSearchResult` and `interface PodcastSearchOptions` (§5.1)
  - `declare iTunesApi: iTunes` (§4)
  - signatures for `search` and `findCovers` (§5.2)
  - C13 (§6.1)
  - `export = new PodcastFinder()` (§4)

  Nothing else changes.
- [ ] **Step 5: Green (V3).** Run `BUILD`. Expected: `exit=0`, and the file contains no `error TS`.
- [ ] **Step 6: Tests (V4).** Run `TEST`. Expected: `exit=0`, `356 passing`, and no `failing` line.
- [ ] **Step 7: Compiled-output diff and shape (V5, §7, Review Focus 1).** Run `EMITDIFF`. Expected counts are `2` and `2`: the E1 quote-style change on the 2 require lines, and nothing else. Read the diff to confirm. Then run `SHAPE` with label `after-PodcastFinder`, followed by `diff evidence/test-results/SP-S01/shape-before.txt evidence/test-results/SP-S01/shape-after-PodcastFinder.txt`, which must print nothing.
- [ ] **Step 8: Rename check (V6) and commit.** Run `git add server/finders/PodcastFinder.ts evidence/test-results/SP-S01`, then `git diff --cached -M --stat`. Expected: `server/finders/{PodcastFinder.js => PodcastFinder.ts}`. Commit with the message `[SP-S01] PodcastFinder: migrate to TypeScript (type-only)`.

### Task 2: AuthorFinder

**Files:** rename `server/finders/AuthorFinder.js` to `server/finders/AuthorFinder.ts`.

**Interfaces:** consumes `Audnexus#findAuthorByASIN/findAuthorByName`, `fileUtils.downloadImageFile` and `fsExtra` (all unchanged). Produces the same export as `shape-before.txt`.

- [ ] **Step 1: Rename (§2).** `git mv server/finders/AuthorFinder.js server/finders/AuthorFinder.ts`
- [ ] **Step 2: Red (V2).** Run `BUILD`. Expected: non-zero `exit=`, with every `error TS` line in `server/finders/AuthorFinder.ts` (same grep as Task 1 Step 3).
- [ ] **Step 3: Add types.** Edit `server/finders/AuthorFinder.ts`:
  - imports as `import … = require(…)`, with `fileUtils` in the two-line form (§4)
  - D2 with its comment (§6.3)
  - U1 `declare global` (§6.5)
  - `type AuthorSearchObj`, `AuthorSearchOptions`, `SavedAuthorImage` and `AuthorImageError` (§5.1)
  - `declare audnexus: Audnexus` (§4)
  - signatures for `findAuthorByASIN`, `findAuthorByName` and `saveAuthorImage` (§5.2)
  - C12 (§6.1)
  - U2 `.catch((err: Error) => …)` (§6.5)
  - `export = new AuthorFinder()` (§4)

  Nothing else changes.
- [ ] **Step 4: Green (V3).** Run `BUILD`. Expected: `exit=0` and no `error TS`.
- [ ] **Step 5: Tests (V4).** Run `TEST`. Expected: `356 passing` and no `failing`.
- [ ] **Step 6: Compiled-output diff and shape (V5, §7, Review Focus 1–2).** Run `EMITDIFF`. Expected counts: `5` removed and `6` added. That is E1 on 4 require lines, plus E2, which turns the `fileUtils` destructured require from 1 line into 2. Read the diff. Then run `SHAPE` with label `after-AuthorFinder` and diff it against `shape-before.txt`, which must print nothing.
- [ ] **Step 7: Rename check (V6) and commit.** Run `git add server/finders/AuthorFinder.ts evidence/test-results/SP-S01`, then `git diff --cached -M --stat`, which should show `{AuthorFinder.js => AuthorFinder.ts}`. Commit with the message `[SP-S01] AuthorFinder: migrate to TypeScript (type-only)`.

### Task 3: BookFinder

**Files:** rename `server/finders/BookFinder.js` to `server/finders/BookFinder.ts`. Tests `test/server/finders/BookFinder.test.js` stay read-only.

**Interfaces:** consumes the 8 providers, `Logger`, `utils/index` and `htmlSanitizer` (all unchanged). Produces the same export as `shape-before.txt`. In particular:

- `runSearch` stays a prototype method.
- `audnexus` stays an own property.
- `TitleCandidates` and `AuthorCandidates` stay static members (§5.3).

- [ ] **Step 1: Rename (§2).** `git mv server/finders/BookFinder.js server/finders/BookFinder.ts`
- [ ] **Step 2: Red (V2).** Run `BUILD`. Expected: non-zero `exit=`, with every `error TS` line in `server/finders/BookFinder.ts`.
- [ ] **Step 3: Add types.** Edit `server/finders/BookFinder.ts`:
  - 10 imports as `import … = require(…)`, plus `utils` in the two-line form (§4)
  - D1 with its comment (§6.3)
  - all BookFinder interfaces and type aliases (§5.1)
  - `declare` fields on `BookFinder`, `TitleCandidates` and `AuthorCandidates` (§4)
  - every signature in the BookFinder, TitleCandidates, AuthorCandidates and helper rows (§5.2)
  - the local annotations listed under §5.2
  - C1–C11, with result casts written as `await … as T` and no parentheses (§4, §6.1)
  - N1–N5 (§6.2)
  - K1 directly above `async search(` (§6.4)
  - `export = new BookFinder()` (§4)

  Nothing else changes, and the `#private` members, `static` fields and the `loop_author:` label stay exactly as they are.
- [ ] **Step 4: Green (V3).** Run `BUILD`. Expected: `exit=0` and no `error TS`.
- [ ] **Step 5: Tests (V4).** Run `TEST`. Expected: `356 passing` and no `failing`. These include the stubs on `runSearch` and `audnexus.authorASINsRequest`.
- [ ] **Step 6: Compiled-output diff and shape (V5, §7, Review Focus 1–5).** Run `EMITDIFF`. Expected counts: `16` removed and `18` added. That is E1 on 10 require lines, E2 turning `utils` from 1 line into 2, E3 on the 5 N1–N5 lines, and E4 adding the 1 K1 line. Read the diff. Every changed line must map to one of E1–E4. The `customProviderAdapter.search(…)` line (C11, bug #1 path) must not appear in the diff at all, and the N2 line may differ only by the `Number(…)` wrap. Then run `SHAPE` with label `after-BookFinder` and diff it against `shape-before.txt`, which must print nothing.
- [ ] **Step 7: Rename check (V6) and commit.** Run `git add server/finders/BookFinder.ts evidence/test-results/SP-S01`, then `git diff --cached -M --stat`, which should show `{BookFinder.js => BookFinder.ts}`. Commit with the message `[SP-S01] BookFinder: migrate to TypeScript (type-only)`.

### Wrap-up: final verification and report (spec §10 V7–V11, §11 T5)

- [ ] **Step 1: Count `any` in the declaration output (V7).** Run the spec V7 `tsc` command with `--outDir` set to the session scratchpad's `dts/` folder. Copy the three `server/finders/*.d.ts` files to `evidence/test-results/SP-S01/dts/`. Run `grep -nw any` on them and save the output as `evidence/test-results/SP-S01/dts-any.txt`. Then run `git status --porcelain`: nothing may appear outside `evidence/`.
- [ ] **Step 2: Banned tokens (V8).** Run the V8 grep. Expected: no output.
- [ ] **Step 3: Counts (V9).** `grep -nw 'as' server/finders/*.ts` must return exactly 13 lines (C1–C13). `grep -n 'Number(' server/finders/*.ts` must return the 4 existing lines plus the 5 N1–N5 lines.
- [ ] **Step 4: History (V10).** Run `git log --follow --oneline -- server/finders/<F>.ts` for each of the three files. Each must list commits from before SP-S01.
- [ ] **Step 5: Done check (V11).** Run `BUILD` and `TEST` with `<F>` = `final`, then `SHAPE` with label `final`, diffed against `shape-before.txt`. Expected: `exit=0`, `356 passing`, no `failing`, and no shape difference.
- [ ] **Step 6: Report.** Write `evidence/test-results/SP-S01/report.md` containing:
  - the Done-check result, quoting the exact passing/failing lines
  - the `.ts` line for every C1–C13, N1–N5, D1–D2, K1 and U1–U2 item
  - every `any` from `dts-any.txt`, each with its source
  - the V8–V10 results
  - pointers to spec §8 (outdated JSDoc) and §9 (bugs)
  - any deviation from this plan, stated plainly
- [ ] **Step 7: Commit.** Run `git add evidence/test-results/SP-S01`, then commit with the message `[SP-S01] evidence: final verification and report`.
- [ ] **Step 8: Finish.** Use superpowers:finishing-a-development-branch, choose **keep branch**, and stop. No push, merge or PR.
