# SP-S01 final report: `server/finders/` to TypeScript

- **Date:** 2026-10-02
- **Branch:** `Aung-Min-Myat/phase1` (no worktree, no other branch, nothing pushed or merged)
- **Spec:** `evidence/plans/2026-10-02-SP-S01-finders-ts-design.md`
- **Plan:** `evidence/plans/2026-10-02-SP-S01-finders-ts-plan.md`
- **Code commits:** `8cf42a71` PodcastFinder, `83c1a0ab` AuthorFinder, `ff0c14d0` BookFinder
- **Evidence folder:** `evidence/test-results/SP-S01/` (all file names below are relative to it)

Every claim is labelled:

- **VERIFIED**: a command was run and its output is saved in the file named.
- **UNCHECKED**: not proven by a command. The reason is given.

Line numbers written as `X.js:N` refer to the original JavaScript at commit `5968b516`, as in the spec. Line numbers written as `X.ts:N` refer to HEAD.

---

## 1. Done check (V11): PASSES

| Check | Result | Evidence |
|---|---|---|
| `npm run build:server` | 0 `error TS` lines, 0 `Debug Failure` lines | VERIFIED: `build-final.txt`, counts in `v11-done-check.txt` |
| build exit code | `exit=0` | Transcribed. The plan's BUILD command prints `exit=$?` to the terminal, not into `build-final.txt`. |
| `npm test` | `  356 passing (7s)`. There is no `failing` line (count 0) and no `error TS` or `Debug Failure` line. | VERIFIED: `test-final.txt`, read back in `v11-done-check.txt` |
| test exit code | `exit=0` | Transcribed, for the same reason as the build exit code. |
| SHAPE (export shape of all three modules) | `diff shape-before.txt shape-final.txt` printed nothing (exit 0) | VERIFIED: `shape-final.txt`, `v11-done-check.txt` |

The exact passing line is `  356 passing (7s)`. There is no failing line.

UNCHECKED: the build ran incrementally (`tsconfig.server.json` sets `incremental: true`), using the plan's BUILD command exactly as written. A build from an empty `dist-server/` was not run. The spec's V11 row says "final clean"; this report reads "clean" as "with no errors", following plan Wrap-up Step 5. Note that Task 1 and Task 2 showed tsc 5.9.3 crashing in its incremental declaration path whenever every file is re-fingerprinted (ledger, and the `*-crash.txt` files).

## 2. Inventory with `.ts` lines (C1–C13, N1–N5, D1–D2, K1, U1–U3)

VERIFIED by `report-item-lines.txt`, which holds both the `.ts` lines and the original `.js` lines, and by `v9-counts.txt`.

### 2.1 Casts (13 casts on 8 lines)

| # | Original | Now | Cast |
|---|---|---|---|
| C1 | BookFinder.js:32 | BookFinder.ts:107 | `await this.openLibrary.isbnLookup(isbn) as OpenLibraryIsbnLookupResult` |
| C2 | BookFinder.js:110 | BookFinder.ts:185 | `await this.openLibrary.searchTitle(…) as BookProviderResponse<OpenLibraryBookResult>` |
| C3 | BookFinder.js:134 | BookFinder.ts:209 | `await this.googleBooks.search(…) as BookProviderResponse<BookSearchResult>` |
| C4 | BookFinder.js:134 | BookFinder.ts:209 | `author as string` |
| C5 | BookFinder.js:151 | BookFinder.ts:226 | `await this.fantLab.search(…) as BookProviderResponse<BookSearchResult>` |
| C6 | BookFinder.js:151 | BookFinder.ts:226 | `author as string` |
| C7 | BookFinder.js:191 | BookFinder.ts:266 | `author as string` |
| C8 | BookFinder.js:191 | BookFinder.ts:266 | `asin as string` |
| C9 | BookFinder.js:191 | BookFinder.ts:266 | `region as string` |
| C10 | BookFinder.js:207 | BookFinder.ts:282 | `author as string` |
| C11 | BookFinder.js:207 | BookFinder.ts:282 | `isbn as string` (bug #1 path, left unchanged) |
| C12 | AuthorFinder.js:29 | AuthorFinder.ts:52 | `region as string` |
| C13 | PodcastFinder.js:18 | PodcastFinder.ts:26 | `options as { country: string }` |

### 2.2 `Number()` rewrites (5 lines, 8 calls)

| # | Original | Now |
|---|---|---|
| N1 | BookFinder.js:80 | BookFinder.ts:155 |
| N2 | BookFinder.js:89 | BookFinder.ts:164 |
| N3 | BookFinder.js:96 | BookFinder.ts:171 (2 calls) |
| N4 | BookFinder.js:121 | BookFinder.ts:196 (2 calls) |
| N5 | BookFinder.js:270 | BookFinder.ts:351 (2 calls) |

The 4 `Number(` lines that already existed are unchanged: AuthorFinder.js:27 is now AuthorFinder.ts:50, and BookFinder.js:376–378 are now BookFinder.ts:462–464.

### 2.3 Declarations, comment and other type claims

| # | Now | Notes |
|---|---|---|
| D1 | BookFinder.ts:20 (comment at :19) | Covers the `isNaN` calls at BookFinder.ts:462–464 (originally :376–378). |
| D2 | AuthorFinder.ts:10 (comment at :9) | Covers the `isNaN` call at AuthorFinder.ts:50 (originally :27). |
| K1 | BookFinder.ts:459 | Directly above `async search(` at BookFinder.ts:460. |
| U1 | AuthorFinder.ts:13 (comment at :12); used at :67 | Spec form `declare global { var MetadataPath: string }` replaced by the file-local `declare const global: typeof globalThis & { MetadataPath: string }`. See deviation 4. `grep -n 'declare global'` finds nothing (exit 1). |
| U2 | AuthorFinder.ts:82 (originally :59) | `.catch((err: Error) => {` |
| U3 | BookFinder.ts:11–16 | Type annotation on the existing `utils` destructuring (4 unchecked claims). See deviation 7. |
| — | BookFinder.ts:591 (originally :505) | `calculateTitleScore` parameters annotated (`titleQuery: string, book: BookSearchResult`). See deviation 5. |

## 3. `any` in the declaration output (V7)

- **Result:** 0 occurrences of `any` in `dts/AuthorFinder.d.ts`, `dts/BookFinder.d.ts` and `dts/PodcastFinder.d.ts`. VERIFIED: `dts-any.txt`, and re-counted in this session in `v11-done-check.txt` (`grep -nw any …` exit 1).
- **There is no `any` to list with file, line and source.**
- **This count is a lower bound.** Declaration output shows only declared and exported types. The `any` flows that V7 cannot see are listed as UNCHECKED in `dts-any.txt`: `fs.pathExists`/`fs.ensureDir` results, the `downloadImageFile` result, untyped JS callee parameters, and possibly the `htmlSanitizer.stripAllTags` return value.
- **Method:** the approved V7 deviation (deviation 9). The spec's `tsc` command crashes, so `program.emit()` was called for the three finder files only.

## 4. V8, V9, V10

### V8: banned tokens. Passes under ruling (deviation 10)

- **Command:** `grep -nE '\bany\b|@ts-ignore|@ts-nocheck|@ts-expect-error|as unknown as' server/finders/*.ts`
- **Output:** 1 match (exit 0), saved in `v8-banned-tokens.txt`:
  `server/finders/BookFinder.ts:765:  cleaned = cleaned.replace(/\s+/g, ' ').trim() // Clean up any resulting multiple spaces`
- **The match is the English word "any" in a comment that predates the migration.** It is not a type. VERIFIED in `v8-banned-tokens.txt`:
  - The line is identical, byte for byte, to `5968b516` BookFinder.js:679 (`cmp` exit 0; 90 bytes each; the same sha256 `5a1cafa7…173e`; `od -c` dumps included).
  - `git blame -C` attributes it to upstream commit `888190a6b`. This was observed in the terminal during this session; the blame output is not saved.
- **Nothing else matched.** There is no `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, `as unknown as`, or `any` used as a type. VERIFIED: the same output.

### V9: counts. Matches; one wording mismatch with the plan

VERIFIED: `v9-counts.txt`.

| Count | Lines | Occurrences | Expected |
|---|---|---|---|
| `as` (whole word) | **8** | **13** | Spec: "exactly 13 `as` matches (C1–C13)". Plan: "must return exactly **13 lines**". |
| `Number(` | **9** | **12** | Spec: the 4 existing lines plus N1–N5 (8 new calls on 5 lines). Plan: 4 + 5 lines. |

- **WORDING MISMATCH (plan):** plan Wrap-up Step 3 says `grep -nw 'as'` returns "exactly 13 lines". It returns 8 lines that hold 13 occurrences, because C3/C4, C5/C6, C7/C8/C9 and C10/C11 share a line. Each of the 13 occurrences is one of C1–C13 (§2.1), so the count matches the spec and the expected number of casts. Only the plan's unit ("lines") is wrong.
- **`Number(` matches both plan and spec:** 9 lines (4 existing + 5 new) and 12 calls (4 existing + 8 new).
- **Baselines** at `5968b516`, in `v9-counts.txt`:
  - the original `.js` files contain 0 whole-word `as`;
  - they contain exactly 4 `Number(` calls, at AuthorFinder.js:27 and BookFinder.js:376, 377, 378.
- **No comment adds the word `as`.** All 8 matching lines are cast lines.

### V10: history. Passes

VERIFIED: `v10-history.txt`.

| File | Commits shown by `git log --follow` | SP-S01 commits | Oldest commit | Rename |
|---|---|---|---|---|
| AuthorFinder.ts | 19 | 1 (`83c1a0ab`) | `53088015` 2021-11-17 | `R052` |
| BookFinder.ts | 83 | 1 (`ff0c14d0`) | `6930e69b` 2021-08-17 | `R074` |
| PodcastFinder.ts | 7 | 1 (`8cf42a71`) | `43f48b65` 2022-03-06 | `R063` |

## 5. Earlier checks (V1–V7), from the task sessions

| Check | Result | Evidence |
|---|---|---|
| V1 baseline | Build exit 0; `emit-before/` and `shape-before.txt` saved | Task 1 session; `emit-before/`, `shape-before.txt` |
| V2 red | Non-zero exit in every task. The red-check `error TS` counts are 7 (PodcastFinder), 13 (AuthorFinder) and 164 (BookFinder), and 0 lines fall outside each renamed file. | VERIFIED by re-counting the saved `red-<F>.txt` files in this session (`v11-done-check.txt`). The red-check method follows deviation 1. |
| V3/V4 per task | Build exit 0, `356 passing` in each task | Task sessions: `build-<F>.txt`, `test-<F>.txt`. Not re-run in this session; V11 supersedes them. |
| V5 compiled-output diff | PodcastFinder 2/2, AuthorFinder 5/6, BookFinder 17/19 (removed/added) | VERIFIED by re-counting `emit-<F>.diff` in this session (`v11-done-check.txt`). BookFinder is 17/19 under E5 (deviation 8). `bookfinder-unlisted-differences.txt` reports `UNLISTED: 0`, and its checker self-test caught 3 of 3 injected defects. |
| V6 rename | All three files show as renames (`R052`, `R074`, `R063`) | VERIFIED: `v11-done-check.txt`, `v10-history.txt` |
| Scope | Outside `evidence/`, the branch changes only the three renames. No test, config, `package*.json`, provider or caller file changed. | VERIFIED: `v11-done-check.txt` (`git diff -M --name-status <merge-base> HEAD -- . ':(exclude)evidence/'`) |

## 6. Follow-up pointers

- **Outdated JSDoc:** spec §8.1 (J1–J17, in the finders, comments kept as they are) and §8.2 (P1–P9, in the providers).
- **Bugs, all reported and left unchanged:** spec §9:
  1. `findCovers` passes options into `isbn` (bug #1).
  2. `Audible.search` can throw instead of returning `[]`.
  3. `Scanner.js:83-84` reads `.length` on a possible `null`.
- **Additional observations found during implementation, not in the spec:**
  - `server/utils/index.js` `levenshteinDistance`/`levenshteinSimilarity` have no JSDoc, so they return `any`. This is the reason for U3.
  - tsc 5.9.3 crashes ("Debug Failure. False expression") in declaration emit for the vendored `server/libs/archiver/buffer-crc32/index.js` and `archiverUtils/stringDecoder/index.js`. The bug predates SP-S01, and those files were not edited. Evidence: `crash-isolated-archiver.txt`, `v7-tsc-crash.txt`, `graph-check-output.txt`.

## 7. Deviations from the plan and spec, stated plainly

Each item is recorded in the ledger (`ledger-progress.md` is the user's copy).

1. **Red-check method (Task 1, user-approved).**
   - The plan's red BUILD crashed tsc 5.9.3 instead of printing type errors.
   - Red evidence is therefore the BUILD crash output plus a whole-project non-incremental no-emit check (`tsconfig.redcheck.json` → `red-<F>.txt`).
2. **Evidence file names (Task 1 ruling).**
   - Red BUILD output goes to `build-red-<F>.txt` and green output to `build-<F>.txt`, so that the green run doesn't overwrite the red one.
   - The PodcastFinder red log was recovered as a labelled transcription (`build-red-PodcastFinder.txt`) plus a direct capture (`crash-repro-PodcastFinder.txt`).
3. **Commit `8cf42a71` also contains `build-PodcastFinder-red-crash.txt`.** The user confirmed this is their own capture. It was kept without rewriting history, and evidence files have been staged by name since then.
4. **U1 replaced (Task 2, user-approved).**
   - The spec's `declare global { var MetadataPath: string }` made tsc's incremental builder re-fingerprint every file, which hit the vendored-file crash.
   - It was replaced by the file-local `declare const global: typeof globalThis & { MetadataPath: string }` with a one-line comment (AuthorFinder.ts:12–13).
   - Cost: `MetadataPath` is typed only inside AuthorFinder.ts.
5. **`calculateTitleScore` parameters annotated (Task 3 ruling).**
   - Spec §5.2 has no row for this local arrow function, but TS7006 requires the annotation.
   - It is type-only and emits nothing (BookFinder.ts:591).
   - The ledger does not mark this ruling as user-approved.
6. **Incident, fixed before commit (Task 3).**
   - A full-file write turned the `̀`/`ͯ` escapes in `replaceAccentedChars` into literal characters. The user found it.
   - The original line was restored by byte copy from `git HEAD:server/finders/BookFinder.js:662`, and only targeted edits were made after that.
7. **U3 (Task 3, user-approved).**
   - The existing `utils` destructuring in BookFinder.ts is annotated (BookFinder.ts:11–16). This adds 4 unchecked type claims: `levenshteinDistance`, `levenshteinSimilarity`, `escapeRegExp` and `isValidASIN`.
   - Why: TS18048 at BookFinder.ts:138, caused by the untyped `levenshteinDistance`.
   - The annotation is type-only.
8. **E5 (Task 3, user-approved).**
   - TypeScript's CommonJS transform moves `module.exports = new BookFinder();` to the end of the compiled file. In BookFinder, only the 6 hoisted function declarations sit between the old and new positions.
   - The expected BookFinder V5 counts therefore become 17 removed / 19 added, against the plan's 16/18.
9. **V7 method (user-approved).**
   - The spec's `tsc` command emits declarations for all 251 program files and crashes on the vendored archiver file.
   - Instead, the same program and options were run through the compiler API, with `program.emit()` called for the 3 finder files only (`v7-dts-emit-finders.js`).
   - The `any` count is a lower bound.
10. **V8 known match (user-approved).** BookFinder.ts:765 is accepted as a known match that predates the migration (§4). The source, the V8 command, the spec and the plan are unchanged.
11. **V9 wording mismatch with the plan.** The plan says 13 lines; the real result is 8 lines with 13 occurrences (§4). Spec and plan text are unchanged.
12. **V8 command transcription.**
    - The spec's table cell writes the alternations as `\|`, which is Markdown's escape for a pipe inside a table.
    - The command was run with plain `|`, as the table renders.
13. **Report file name.** The report is `final-report.md`, not the plan's `report.md`, at the user's instruction.
14. **Wrap-up staging.**
    - Plan Step 7 says `git add evidence/test-results/SP-S01`. Instead, files were staged by name.
    - `evidence/notes/SP-S01-notes.md` and `evidence/test-results/SP-S01/ledger-progress.md` are left out, at the user's instruction.
15. **Not run, at the user's instruction:** the whole-branch reviewer and plan Wrap-up Step 8 (finishing-a-development-branch / "keep branch"). The branch stays as it is, with no push, merge or PR.
16. **V11 "clean" build.** An incremental build was run, not one from an empty `dist-server/` (§1, UNCHECKED).

## 8. UNCHECKED items (summary)

- Whether a build from an empty `dist-server/` also passes (§1).
- The build and test exit codes are transcribed from the terminal, not saved. The saved output shows 0 errors and `356 passing` with no failing line (§1).
- `any` inside function bodies and in imported JS types (§3; listed in `dts-any.txt`).
- The 4 U3 type claims about `server/utils/index.js` (deviation 7). They are argued from the source in the ledger and not checked by the compiler.
- The `git blame` attribution of BookFinder.ts:765 to `888190a6b`, which is not saved. The byte-identity with `5968b516` is saved (§4).
