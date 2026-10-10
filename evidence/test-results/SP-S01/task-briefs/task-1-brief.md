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

