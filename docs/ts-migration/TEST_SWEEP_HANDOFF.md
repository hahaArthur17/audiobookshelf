# Handoff: independent sweep of the characterization suite for weak or gamed tests (for a fresh cloud agent)

You are a skeptical reviewer with **no prior context**. Phase 0 of the Audiobookshelf JS -> TypeScript migration wrote ~940 characterization tests (`test/characterization/`, snapshots in `test/characterization/snapshots/`) that are supposed to pin down what `server/` does **today**, so converting it to TypeScript cannot change behaviour unnoticed. Agents wrote those tests, so they may be weaker than they look: the pressure when writing them was to get green. Your job is to **find tests that pass without proving anything**, and report them. You are a reviewer, not a fixer.

Read first: `docs/ts-migration/CHARACTERIZATION.md` (what each suite covers, harness quirks, findings), `docs/ts-migration/STATUS.md`, `test/characterization/helpers/harness.js`, `auth-harness.js`, `snapshot.js`, and `scripts/characterization-audit/audit.js` (what is already checked mechanically).

## Ground rules
- Branch: `claude/dreamy-ramanujan-l3ozd4`. `git fetch origin claude/dreamy-ramanujan-l3ozd4 && git checkout -B claude/dreamy-ramanujan-l3ozd4 origin/claude/dreamy-ramanujan-l3ozd4` first (a fresh worktree can start from an old base). Record the HEAD SHA in the report. **No pull request. Push only to `claude/dreamy-ramanujan-l3ozd4`.**
- **Do not change any tracked file except your report.** Not `server/`, not tests, not snapshots, not `scripts/`. Never `UPDATE_SNAPSHOTS=1`. Never run `oracle.js --update`. (Section C below edits `server/` only inside a throwaway copy that you delete.)
- The only file you create is `docs/ts-migration/TEST_SWEEP_REPORT.md`. Commit it with `[skip ci]` in the subject and the trailer `Co-Authored-By: <your model name> <noreply@anthropic.com>`, then push.
- Findings are claims. Every finding in the report needs `file:line`, the snapshot key if there is one, the quoted evidence, and why it is weak. If you are not sure, say "unsure" rather than guessing. Do not pad the report with style opinions.
- Sandbox is Linux/Node 22. `npm ci && npm run build:server` first. A full `npm test` takes ~3 minutes; run it serially, never two at once.

## A. Mechanical sweeps (scripted; show the commands you used)
Start with `npm run audit:characterization` and read all of its output, including every "identical snapshot value repeated Nx" line: each one is a candidate for a test that records the same trivial value many times. Then search the snapshots (JSON) and tests for these patterns, and **triage every hit** (real weakness / legitimate / unsure):

1. **Snapshots that bake in a failure.** Snapshot values that contain `Cannot read properties`, `is not a function`, `is not defined`, `secretOrPrivateKey`, `ECONNREFUSED`, `SQLITE_`, `<!DOCTYPE`, stack-trace `at ` lines, `undefined` as text, `NaN`, `[object Object]`, or empty containers (`{}`, `[]`, `null`) as the whole value of an entry. For each, decide whether the test title promises success (then the snapshot recorded a harness failure as if it were behaviour) or the oddity is the intended behaviour. Example of the failure mode: an early OIDC auto-register test recorded a 302 to `/login?error=Unauthorized` because the harness had no token secret; it passed and proved nothing.
2. **Success tests that only record errors.** Entries shaped `{res:{status>=400}}` / `{status>=400}` in tests whose title says "creates", "returns", "updates", "logs in", "serves". Per file, list the ratio of error to success entries.
3. **Assertions that cannot fail**: `expect(x).to.equal(x)`, `expect(true)`, `expect(...).to.exist` on something always defined, `expect(arr).to.be.an('array')` as the only check, `expect(res.status).to.be.oneOf([...])` with most statuses, `expect(...).to.be.at.least(0)`, comparisons of a value to itself after the test computed it from the same source.
4. **Tests that assert nothing about their title**: title says X, body never checks X. Read each test body for the files in section B.
5. **Swallowed failures**: `try { ... } catch {}` or `.catch(() => {})` around the code under test or an assertion; `if (...) { expect... }` where the condition can be false; `it.skip` / `this.skip()` / `xit` (list every one and the condition); `return` before assertions; `setTimeout`-based waits instead of waiting on an event.
6. **The test computes its own expected value from the code under test** (calls the same function, or re-implements it) and compares it with itself. Snapshot of an object the test built by hand rather than something the server returned.
7. **Stubs that do the work**: every `sinon.stub`/`replace`/`require.cache` manipulation in `test/characterization/**`. For each: what is stubbed, and is it a true boundary (network, clock, `SocketAuthority`, `Watcher`, child process) or does it hollow out code that the test claims to characterize? The audit only catches some forms.
8. **Over-masking**: `normalize`, `mask`, `scrub`, `strip` helpers in test files that delete or replace so much that the snapshot no longer shows behaviour (e.g. replacing whole bodies with `<x>`, dropping keys that are the point of the test). List what each mask removes.
9. **Label/key collisions and duplicates**: the same snapshot key written by two tests, identical tests copy-pasted with different titles, tests in the same `describe` whose snapshots are identical.
10. **Snapshot machinery integrity**: `helpers/snapshot.js` (does a missing key fail? does an extra/unused key in a snapshot file get detected? is `normalize` lossy in a way that hides real differences, e.g. rounding, sorting that hides ordering bugs, ID renumbering that hides wrong IDs?), and the hash-manifest guard `test/characterization/ORACLE.sha256.json` + `.github/workflows` characterization guard.
11. **Audit integrity**: `git log -p -- scripts/characterization-audit scripts/ts-ratchet` and `.github/workflows/`. Has any threshold, pattern, allowlist or exclusion been loosened since it was introduced? Is there any test file or snapshot the audit does not look at (glob gaps, ignore lists, `describe` names the audit skips)?

## B. Read-through (this is the core of the job; do not skip it)
Read the test bodies, not just titles. Priority order is "written most recently, least scrutinized, most complex":
1. `OidcFlow.test.js`, `AuthRateLimit.test.js`, `ServerBoot.test.js` (+ `helpers/fake-idp.js`, `helpers/child-server.js`)
2. `SocketAuthority.test.js`, `Database.test.js`, `HlsRouter.test.js`
3. `ScannerDirectory.test.js`, `ScannerBook.test.js`, `ScannerPodcast.test.js`, `ScannerOrchestration.test.js` (+ `helpers/seed-scanner-*.js`; written on macOS by another agent, never reviewed line by line)
4. `AuthRoutes.test.js`
5. A sample of **10 of the controller suites** you choose by risk (largest, most branches: `LibraryItemController`, `LibraryController`, `UserController`, `PodcastController`, `MeController`, `SessionController`, ...). Pick by reading, not alphabetically.

For each file give a verdict: **solid / mixed / weak**, with the three strongest and three weakest tests and why. For each weak test say what real behaviour change would still pass it.

## C. Mutation spot-checks (the strongest evidence; do at least 20)
A test suite that cannot detect a change to the code is not a safety net. Prove it with mutations, **in a throwaway copy**:
1. `git worktree add ../abs-mutate HEAD` (or `cp -R`), `npm ci` there (or symlink `node_modules`), `npm run build:server`.
2. Pick 20 to 30 small behaviour changes spread across areas (controllers, models, `Auth`, `TokenManager`, `OidcAuthStrategy`, `SocketAuthority`, scanner, `Database`, `HlsRouter`, utils, migrations loader). Examples: flip a permission check (`isAdminOrUp`), change a status code (403 -> 401, 404 -> 400), drop a field from a JSON response, change a default value, invert a `>`/`>=`, remove a `await`, skip an `emit`, remove a `where` filter, change the rate-limit default, swap `S256` for `plain`, change an array sort order, remove a cascade delete. Keep each mutation to one or two lines.
3. For each: apply it **to the source in the throwaway copy only**, `npm run build:server`, run the most relevant test file(s) (and, if none fails, the full suite once to be sure), record **CAUGHT (which test failed) / SURVIVED**, then revert (`git checkout -- .`).
4. Report the table: file:line, mutation, result. Every SURVIVED mutation is a coverage gap or a weak test; say which behaviour is unpinned. Survived mutations that sit in code the docs claim is covered are the most important findings.
5. When finished, remove the throwaway copy (`git worktree remove --force ../abs-mutate`). Confirm `git status` in the real checkout is clean except for your report.

## Report: `docs/ts-migration/TEST_SWEEP_REPORT.md`
Sections, in this order:
1. **Verdict** (3 to 6 sentences): is the suite trustworthy enough to start converting `server/` to TypeScript, and what must be fixed first. Be direct.
2. **Counts**: findings by severity. **High** = a test that passes while the behaviour it claims to pin could change or is already broken (baked-in failure, assertion that cannot fail, survived mutation in claimed-covered code). **Medium** = weak but partly useful. **Low** = cosmetic or duplicate.
3. **Findings table**: id, severity, file:line, snapshot key (if any), evidence (quoted), why it is weak, suggested fix (one line; you do not apply it).
4. **Mutation results table** (section C) with the CAUGHT/SURVIVED totals.
5. **Per-file verdicts** (section B).
6. **Mechanical sweep results** (section A): one short paragraph per pattern 1 to 11 with the commands used and the hit count, including patterns with zero hits (say so).
7. **Not checked** and why.

Finish by telling the user: "Report is in `docs/ts-migration/TEST_SWEEP_REPORT.md` on branch `claude/dreamy-ramanujan-l3ozd4`." Then stop; the orchestrating session will triage the findings with the user and fix the tests.
