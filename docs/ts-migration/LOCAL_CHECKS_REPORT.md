# Local checks report (macOS / Node 24)

HEAD SHA: `d5c6cba6ef99874795f16d9042eff2e2975375de` (branch `claude/dreamy-ramanujan-l3ozd4`)

## 1. Summary

| Step | Result |
| --- | --- |
| 0 Environment | recorded (ffmpeg/ffprobe present, 0 tests skipped for lack of them) |
| 1 `npm ci`, `build:server`, `lint`, clean `git status` | pass |
| 2 Full suite x3 | **fail**: 1285 passing, 7 pending, 1 failing on every run (same test) |
| 3 Process/timing suites x3 each | ServerBoot **fail** (3/3), ScannerOrchestration **flaky** (1/3), the other 7 files pass 3/3 |
| 4 TZ New_York / Kolkata / odd path | TZ runs: same single failure as Step 2. Odd path: that failure plus the ScannerOrchestration flake (see below) |
| 5 `ratchet` | pass (7576 baseline, 7576 now) |
| 5 `oracle:check` | pass (86 files match) |
| 5 `audit:characterization` | **fail**: exit 1 because the inner suite run had the ServerBoot failure, so no audit counts were printed |
| 6 `smoke:upgrade` | pass (all checks passed, 3 s) |

Failures:
- **ServerBoot "serves nothing for the web client when it has not been built ..."** fails deterministically here. Server serves `client/dist` (200, Nuxt index) where the snapshot expects 404. Likely cause (guess): this working copy has a gitignored, previously built `client/dist/`, so the "client not built" precondition does not hold. The test does not appear to isolate itself from a locally built client.
- **ScannerOrchestration "ScanLogger: same logging API without a library"** is flaky: `json.elapsed` snapshot expects `0`, got `1` (millisecond boundary). Failed 1 of 3 isolated runs and 1 of the full runs in the copy directory; passed in all 5 other full runs.
- **audit:characterization** did not reach "audit passed" because of the ServerBoot failure above.

No run modified any tracked file (`git status --short` was empty after every command).

## 2. Environment

```
Darwin MacBook-Pro-75.local 27.0.0 Darwin Kernel Version 27.0.0: Tue Aug 11 21:02:59 PDT 2026; root:xnu-13432.1.9~1/RELEASE_ARM64_T8142 arm64
macOS 27.0.1 (26A434)
node v24.21.0, npm 11.19.0
ffmpeg 9.0.1, ffprobe 9.0.1
TZ unset, date +%Z = HST
locale: LANG=C.UTF-8, LC_ALL unset
```

## 3. Per-step detail

### Step 1
`npm ci` ok (audit warnings and an `fsevents` install-script notice only), `npm run build:server` clean, `npm run lint` clean, `git status --short` empty.

### Step 2: full suite
| Run | Passing | Pending | Failing | Duration |
| --- | --- | --- | --- | --- |
| 1 | 1285 | 7 | 1 | 72 s |
| 2 | 1285 | 7 | 1 | 72 s |
| 3 | 1285 | 7 | 1 | 72 s |

The failing test each time is ServerBoot "default base path (/audiobookshelf), fresh server > serves nothing for the web client when it has not been built, and a dynamic client route falls through to 404 or the index". Diff summary (full body omitted, it is the whole Nuxt index.html):

```
item:    expected status 404, content-type text/html; charset=utf-8, CSP "default-src 'none'", body "...<pre>Not Found</pre>..."
         actual   status 200, content-type text/html; charset=UTF-8, CSP "frame-ancestors 'self'", body "<!doctype html>...nuxt..."
library: expected 404 / Not Found, actual 200 Nuxt index
root:    expected 404 "Cannot GET /audiobookshelf/", actual 200 Nuxt index (the actual side is the built client)
```

`client/dist` exists locally (ignored by `.gitignore:12 /client/dist/`).

Pending is 7 as expected, so nothing was skipped for lack of ffmpeg. The only count difference from the 1286 baseline is the one failing test.

### Step 3: single-file runs (3 runs each)
| File | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| ServerBoot | 16 pass, 1 fail (7 s) | 16 pass, 1 fail (7 s) | 16 pass, 1 fail (7 s) |
| AuthRateLimit | 10 pass (7 s) | 10 pass (7 s) | 10 pass (7 s) |
| SocketAuthority | 19 pass (8 s) | 19 pass (8 s) | 19 pass (8 s) |
| OidcFlow | 41 pass (5 s) | 41 pass (5 s) | 41 pass (5 s) |
| HlsRouter | 22 pass (1 s) | 22 pass (1 s) | 22 pass (1 s) |
| ScannerOrchestration | 48 pass, 1 pending, **1 fail** (9 s) | 49 pass, 1 pending (9 s) | 49 pass, 1 pending (9 s) |
| ScannerPodcast | 21 pass (3 s) | 21 pass (3 s) | 21 pass (3 s) |
| ScannerBook | 42 pass (5 s) | 42 pass (5 s) | 42 pass (5 s) |
| ScannerDirectory | 33 pass (<1 s) | 33 pass (<1 s) | 33 pass (<1 s) |

ServerBoot: deterministic, 3 of 3 failed (same test as Step 2).

ScannerOrchestration failure block (run 1):

```
1) ScannerOrchestration (characterization)
     LibraryScan and ScanLogger (no scan)
       ScanLogger: same logging API without a library:
    AssertionError: snapshot "ScannerOrchestration (characterization) > LibraryScan and ScanLogger (no scan) > ScanLogger: same logging API without a library": expected { before: { id: null, …(3) }, …(3) } to deeply equal { before: { id: null, …(3) }, …(3) }
    + expected - actual
         "hasElapsed": true
         "json": {
    -    "elapsed": 1
    +    "elapsed": 0
         "finishedAt": "<t>"
         "id": "<id>"
         "name": "Some/Item"
         "startedAt": "<t>"
    at matchSnapshot (dist-server/test/characterization/helpers/snapshot.js:105:49)
    at snap (dist-server/test/characterization/ScannerOrchestration.test.js:58:41)
    at Context.<anonymous> (dist-server/test/characterization/ScannerOrchestration.test.js:140:13)
```

Flaky: 1 of 3 isolated runs failed. The same failure recurred once in the Step 4 odd-path full run. The snapshot depends on whether the ScanLogger's elapsed time is rounded to 0 or 1 ms.

### Step 4: environment sensitivity
| Run | Passing | Pending | Failing | Duration |
| --- | --- | --- | --- | --- |
| `TZ=America/New_York npm test` | 1285 | 7 | 1 (ServerBoot, same as above) | 72 s |
| `TZ=Asia/Kolkata npm test` | 1285 | 7 | 1 (ServerBoot, same as above) | 72 s |
| copy at `~/abs copy é` (fresh `npm ci` + `build:server`) | 1284 | 7 | 2 (ServerBoot, plus the ScanLogger `elapsed` flake) | 78 s |

No snapshot depended on TZ or the working-copy path. The copy was a `cp -R` of the working tree, so it also carried `client/dist`; `git status --short` was empty there. The copy has been deleted.

### Step 5: guards
- `npm run ratchet`: checkJs type errors 7576 in baseline, 7576 now (0 improved, 0 worse); escape hatches in .ts files 0/0. "Ratchet passed."
- `npm run oracle:check`: "oracle intact: 86 files match the manifest".
- `npm run audit:characterization`: exit 1 after 73 s. It ran the whole suite (1285 passing, 7 pending, 1 failing, the ServerBoot test) and stopped there, so I have no numbers for test files / `it()` blocks / snapshot entries / routes hit and no "identical snapshot value repeated" warnings to report. I did not edit the audit.

### Step 6: upgrade smoke
`npm run smoke:upgrade` exit 0 in 3 s, "all checks passed" (every table row count matched, `playbackSessions` 2 -> 0 as the known delta, `migrationsMeta.version` is now 2.37.0). It did not need the network.

## 4. Differences from the Linux / Node 22 baseline

1. 1285 passing instead of 1286, with 1 failing: ServerBoot "client not built" test. Guess: a locally built, gitignored `client/dist` on this machine; the Linux sandbox has none. Not a macOS or Node 24 difference as such.
2. ScannerOrchestration ScanLogger `elapsed` flake (0 vs 1 ms). Guess: timing-dependent assertion that is sensitive to machine speed or clock granularity; it can occur on any platform.
3. Suite duration is about 72 s here versus about 3 minutes on Linux. No other differences observed (TZ and path independent, 7 pending as expected).

## 5. Not run / could not run

- `audit:characterization` counts and warnings: the run was aborted by the ServerBoot failure. To get them, rerun after the ServerBoot test is isolated from `client/dist` (or with `client/dist` moved aside); I did not do that because the instructions say not to edit or repair anything.
- No other step was skipped.
