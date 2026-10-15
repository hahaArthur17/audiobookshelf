# Handoff: local verification of the characterization suite (for a local agent)

You are helping with Phase 0 of the Audiobookshelf JS -> TypeScript migration. Phase 0 records what the server does **today** in characterization tests (`test/characterization/`) so the conversion cannot change behaviour unnoticed. The cloud sandbox is Linux + Node 22 and could only verify so much. Your job is to **run the suite on macOS + Node 24 and report what happens**. You are a verifier, not a fixer.

## Ground rules
- Branch: `claude/dreamy-ramanujan-l3ozd4`. Pull it first (`git pull origin claude/dreamy-ramanujan-l3ozd4`). Record the HEAD SHA in your report. **Never push `main`. No pull request.** Commit locally; push to `claude/dreamy-ramanujan-l3ozd4` only if the user says so.
- **Do not edit `server/`, `test/`, `scripts/`, or any snapshot.** If something fails, report it with the exact output; do not repair it. (The cloud session decides whether it is a real macOS difference, a flaky test, or a bug in a test.)
- **Never run with `UPDATE_SNAPSHOTS=1`**, and never run `node scripts/characterization-audit/oracle.js --update`.
- The only file you create or edit is `docs/ts-migration/LOCAL_CHECKS_REPORT.md`. Commit it with `[skip ci]` in the subject and the trailer `Co-Authored-By: <your model name> <noreply@anthropic.com>`.
- Serial, one command at a time. Do not run two test runs in parallel: several suites boot real child servers and bind ports.

## Step 0: environment (record all of it in the report)
`uname -a`, `sw_vers`, `node -v` (should be 24.x), `npm -v`, `ffmpeg -version | head -1`, `ffprobe -version | head -1`, `echo $TZ; date +%Z`, `locale`. Note if ffmpeg or ffprobe is missing: the scanner media tests then skip, and the report must say how many tests were skipped because of it.

## Step 1: clean build and baseline
```
npm ci
npm run build:server
npm run lint
```
Both must be clean. Then confirm nothing regenerates tracked files: `git status --short` must print nothing.

## Step 2: full suite three times
Run `npm test` **three times in a row**, each time capturing the summary lines (`N passing`, `N pending`, `N failing`) and the duration. Expected from the cloud: **1286 passing, 7 pending, 0 failing** (about 3 minutes on Linux). Pending 7 = the intentional skips (six listed in `CHARACTERIZATION.md`, plus one in `ScannerOrchestration`). If the passing count differs, explain whether more tests were skipped (e.g. no ffmpeg).

After **every** run, `git status --short` must stay empty. A test run that modifies a snapshot or any tracked file is a finding.

For any failure: copy the full mocha failure block (title, assertion diff, stack) into the report. Then re-run **only that file** three times (`npx mocha dist-server/test/characterization/<File>.test.js`) and report whether it is deterministic or flaky (x of 3 failed).

## Step 3: the process- and timing-sensitive suites alone, three times each
These boot real child servers, ports, websockets or timers, so they are the most likely to differ on macOS. Run each file on its own, three times, and report pass/fail and duration per run:
- `test/characterization/ServerBoot.test.js`
- `test/characterization/AuthRateLimit.test.js` (includes a 2.5 s window test and a 42-request loop)
- `test/characterization/SocketAuthority.test.js`
- `test/characterization/OidcFlow.test.js`
- `test/characterization/HlsRouter.test.js`
- `test/characterization/ScannerOrchestration.test.js`, `ScannerPodcast.test.js`, `ScannerBook.test.js`, `ScannerDirectory.test.js`

## Step 4: environment sensitivity
The snapshots mask the machine time zone and temp paths. Prove it, once each, with the full suite:
1. `TZ=America/New_York npm test`
2. `TZ=Asia/Kolkata npm test` (a half-hour offset catches date-bucketing mistakes)
3. A different working-copy path, e.g. `cp -R` the repo to a directory with a space and a non-ASCII character in the name (`~/abs copy é`), `npm ci`, `npm test` there. Delete the copy afterwards.
Report pass counts and any failing test names. A snapshot that depends on the TZ or the path is a finding.

## Step 5: guards
```
npm run ratchet                     # checkJs error count must not exceed the baseline in the repo
npm run oracle:check                # must pass at a clean HEAD
npm run audit:characterization      # must print "audit passed" (runs the whole suite once more)
```
Report the numbers it prints (test files, `it()` blocks, snapshot entries, routes hit) and the full list of "identical snapshot value repeated" warnings if there are any. Do not edit the audit.

## Step 6 (optional; skip and say so if it needs the network or more than 15 minutes): upgrade smoke
`npm run smoke:upgrade` (real v2.14.0 / v2.25.1 databases). Report the result.

## Report: `docs/ts-migration/LOCAL_CHECKS_REPORT.md`
Create it with these sections, in this order, and keep it factual:
1. **Summary**: one table of step -> result (pass / fail / skipped) and one sentence per failure.
2. **Environment** (Step 0 output) and the HEAD SHA.
3. **Per-step detail**: the counts and durations for each run, the failure blocks verbatim, flaky vs deterministic.
4. **Differences from the Linux/Node 22 baseline**: anything that behaved differently on macOS/Node 24, with your best guess at the cause (clearly labelled as a guess).
5. **Not run / could not run** and why.

When done, tell the user: "Report is in `docs/ts-migration/LOCAL_CHECKS_REPORT.md` (committed locally; say the word and I will push it)." Push only if told to. The cloud session then reads it from branch `claude/dreamy-ramanujan-l3ozd4`.
