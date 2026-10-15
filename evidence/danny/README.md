# Danny Pham: Audiobookshelf JavaScript to TypeScript (COMPX574 A4)

This folder holds Danny Pham's part of the group's agentic development work for COMPX574 Assignment 4. The task was to convert the Audiobookshelf server (v2.37.0, baseline commit `7d10b8fc`) from JavaScript to TypeScript with an AI agent, and then evaluate the workflow.

Final state: the whole server is TypeScript (all 182 first-party server files plus `index.js`). The build has 0 type errors, 356/356 tests pass, lint is clean, and Docker builds and runs. The original Vue frontend works against the new server.

## Start here

1. `MIGRATION.md` on branch `danny/phase3` of the shared fork (https://github.com/hahaArthur17/audiobookshelf/tree/danny/phase3). It holds the rules, the progress table, one Log entry per batch, the Bugs section and the open work ("Deferred work (not abandoned)"). This folder also contains a copy of it, `MIGRATION-danny-phase3.md`, next to this README.
2. Then open the evidence folder for the stage you need (see below).

Branches (same code on the shared fork `hahaArthur17/audiobookshelf` and on `dannyinit/audiobookshelf`): `danny/oneshot`, `danny/phase1`, `danny/phase2`, `danny/phase3`.

## What each item is

| Item | Contents |
| --- | --- |
| `group_plan_audiobookshelf.md` | Group task, shared fork, baseline, branch naming, workflows of each member |
| (not in this public copy) | The course guidance and the assignment brief were left out because they are course material |
| `one-shot-evidence/` | Whole-server conversion in one prompt (failed: 2,805 type errors). `notes.txt` is the run log with cost; `error-files.txt` lists the files with errors |
| `phase1-evidence/` | 3 finder files. Phase report (`Phase 1 Report ... .docx`), agent report, verification, compiled-JS diffs, usage |
| `phase2-evidence/` | Metadata pipeline (13 files). Phase report (`Phase 2 Report ... .docx`), prompt, verification, compiled-JS diffs, usage |
| `phase3-evidence/` | The rest of the server in an audit plus batches 1 to 12, and the later checks (see next section) |

## phase3-evidence

| Folder or file | Contents |
| --- | --- |
| `00-baseline/` | Baseline build errors, tests and remaining `.js` files before Phase 3 |
| `audit/` | Read-only type quality audit after batches 1, 2 and 4 (`4-type-audit.md`) |
| `batch01/` to `batch12/` | One folder per batch (3a, 3b, 3c and 11a to 11d are separate folders). Batches 4 and 6 ran in the same session as 2 and 5, so their folders hold only the usage counters; their checks are in `batch02/` and `batch05/` |
| `smoke/` | Server runs of the baseline and the new build: request lists, responses, server logs and diffs |
| `frontend/` | Frontend check of 10 Oct: server output, daily server log, 5 screenshots, database items and files on disk at the end; `baseline/` holds the logs of the same actions on the original server |
| `progress.log` | One line per checkpoint: date, commit, number of `.ts` / `.js` files, type errors, test result |
| `*.js`, `*.sh`, `*.py` at the top | Check scripts used across batches: `castcount.js` (counts `as`, `as unknown as` and `!` with the TypeScript syntax tree), `codesame.js` (compares sources without comments), `fixture.sh` and `smoke*.sh` (test library and server runs), `migrun.sh`, `watch.sh`, `qrun2.sh` |

File naming inside a batch folder (the number gives the order):

- `1-prompt.txt`: the prompt given to the agent.
- `2-usage-before.txt`, `3-usage-after.txt`: Claude Code `/usage` counters before and after the session. Cost and API time are the difference.
- `4-verification.txt`: build, tests, lint and other checks run after the batch.
- `*compiled-diff*`: the compiled JavaScript of the baseline and the new code compared.
- `*-findings.txt`: Danny's own write-up of the independent check of that batch.
- `before-*` / `after-*`: cast counts before and after the batch.
- `batch12/11-docker-build.txt`, `12-docker-run.txt`: Docker rerun after the last batch (script `docker-check.sh`).

## How to read the evidence

- Measured numbers versus the agent's own claims: the `*-findings.txt` files and the raw command output are measured by Danny. The agent's summaries and its Log entries in MIGRATION.md are the agent's own statements, and some of them were wrong (the `*-findings.txt` files list these). When numbers disagree, trust the findings files and the raw output.
- Cast counts for batches 3 to 8 were made with grep; from batch 9 on, with the TypeScript syntax tree (`castcount.js`). The two are not directly comparable.
- Time is API time from `/usage`, not wall time.
- The `.jsonl` files are full session transcripts (one-shot, Phase 1, Phase 2). They are large (up to 6.6 MB); open them only when the summaries are not enough.
- `phase3-evidence/transcripts/` holds the transcript of every Phase 3 session (audit and batches 1 to 12). Its `INDEX.md` maps each session to its batch.

## Final figures and their sources

| Figure | Value | Source |
| --- | --- | --- |
| Type errors, tests | 0, 356/356 passing | `phase3-evidence/batch12/4-verification.txt` |
| Casts and non-null assertions | 684 `as`, 122 `as unknown as`, 291 `!` (1,097 in 195 files), all tagged with a reason | `phase3-evidence/batch12/5-casts.txt`, `after-summary.txt` |
| `any`, `@ts-ignore` | 0, 0 | text search of `server/` and `index.ts` at commit `e9162e61` (`git grep`); the only match of the word `any` used as a type pattern is inside a comment |
| Behaviour | compiled JS differs only in module style and aliases; 139 + 194 requests identical to the baseline | `phase3-evidence/batch12/6-compiled-compare.txt`, `8-q-diff.txt` (139 requests), `8b-q-diff-11c.txt` (194 requests; the 4 bodies that differ also differ between two baseline runs) |
| Docker | build exit 0, container checks pass | `phase3-evidence/batch12/11-docker-build.txt`, `12-docker-run.txt` |
| Suspected bugs in the original code | about 52, 1 reproduced | MIGRATION.md, Bugs section |
| Cost and API time | Phase 3: $184.22, 5 h 37 min; with the one-shot and Phases 1 and 2: about $225, 6 h 44 min | `usage-*.txt` and `notes.txt` in each folder (the totals are Danny's sums of these) |
| Open items | listed with options | MIGRATION.md, "Deferred work (not abandoned)" |

## Note on this public copy

This folder is published on branch `danny/evidence` of the shared fork so that the marker can open it. It is the same package that was shared with the group as `danny-a4-evidence.zip` on 15 October 2026, with two changes: the course guidance, the assignment brief, Danny's individual report and a personal meeting note are left out, and Danny's personal email address, which Claude Code adds as session metadata at the start of every transcript, is replaced with `<danny-email>`. Nothing else in the transcripts or the other files was changed.
