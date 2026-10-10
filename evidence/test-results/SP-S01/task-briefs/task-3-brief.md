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
