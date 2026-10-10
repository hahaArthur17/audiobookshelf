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

