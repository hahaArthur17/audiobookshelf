# PO-S06: no rule file, short prompt, fixed set of files

Status: plan, written and committed before the run. Results are added after the run.

## Question
In PO-S01 the agent worked with a 38-line rule file (CLAUDE.md), the finders spec and plan, and the rest of the evidence folder. How much of its result came from that written guidance? In PO-S06 the agent gets a short product-level prompt and nothing else.

Workflow label for the report: fixed scope, low detail, no rule file.

## Design: PO-S01 against PO-S06
| | PO-S01 | PO-S06 |
|---|---|---|
| Start | commit 9f4ff460 | the same source tree, copied without git history (one commit named baseline) |
| Model and mode | Opus 5.5, max effort, auto mode | the same |
| Rule file | CLAUDE.md, 38 lines: scope, order, 8 rules, checks, pitfalls | none |
| Other written guidance | evidence/ folder: finders spec and plan, SP-S01 results, notes | none. server/finders/*.ts stays as the only worked example |
| Prompt | "Migrate ... following CLAUDE.md ... as much of server/ as you can, in the order you choose" | the reason for the move, 14 named files, the end state, the commit prefix, the stop report |
| Files | CLAUDE.md gave a start list of 14 files (8 leaf files, 6 models) and a leaf-first rule. The agent converted 11 files: 5 from the list and 6 of its own choice | 14 leaf files named by us: the 11 files PO-S01 converted and 3 files from its start list that it declined |
| Permissions | evidence/context-files/PO-S01-settings.local.json (7 allow rules, 19 deny rules) | the same file, taken from commit 9f4ff460 |
| Packages | npm ci | npm ci |
| Time limit | none | none in the prompt. We stop the run at 90 minutes if it is still going |

This is not a one-variable test. Besides the guidance, the scope differs: in PO-S01 the agent chose part of its own file set, in PO-S06 we fix it. PO-S06 therefore cannot show how well an agent chooses its scope. It compares how the two runs convert the same files, and it shows what an agent does with the 3 files that PO-S01 declined.

## Files (all are leaf files at 9f4ff460; sizes from base-check.txt)
Converted by PO-S01 (11 files, 972 lines, 896 non-blank): parseNfoMetadata, TrackProgressMonitor, Task, parseFullName, OpenLibrary, longTimeout, stringifySequelizeQuery, AudioTrack, hlsPlaylistGenerator, globals, parseUserAgent.
Declined by PO-S01 (3 files, 544 lines, 492 non-blank): Notification, AudioMetaTags, areEquivalent.
The prompt lists the 14 files in alphabetical order of path, so the 3 harder files are not placed last.

## What the agent has and does not have
Has: the code, server/finders/*.ts, the tests, the settings file with the deny rules, one commit named baseline, no remote.
Does not have: CLAUDE.md, the evidence folder, the git history, the PO-S01 commits.

## Predictions (written before the run)
P1. Completion. 13 or 14 of the 14 files end as .ts, and the build and all 356 tests pass at the last commit. PO-S01: 11 of 14.
    Reason: PO-S01 declined the 3 harder files because its rules left no way through. Without those rules the agent can use looser types.
    Measured by: git ls-files, build, tests.
P2. Escape hatches. The banned tokens of PO-S01 (any, @ts-ignore, @ts-nocheck, @ts-expect-error, as any, as unknown as) appear 1 to 12 times in the 14 files, best guess 4, and at least half of them are in the 3 harder files. PO-S01: 0.
    Reason: the prompt asks for errors to be found at build time, which works against any, but nothing forbids it and the harder files use dynamic keys.
    Measured by: the token counter used in PO-S07, also run on the PO-S01 result (commit 8d48f5b7).
P3. Behaviour. In at least 12 of 14 files the compiled output differs from the baseline copy only in the shape of require lines, comments and erased types. The agent reports the three parseFullName bugs that PO-S01 found and does not fix them. Confidence about 65 percent.
    Reason: the prompt says the server must behave exactly as before, and the agent found the same bugs in PO-S01.
    Measured by: compiled-output comparison with the baseline copy, and the final message.
P4. Care. In at least 3 of the 14 files the agent loses or reformats an existing comment, or rewrites lines that did not need to change, which rules 7 and 8 of CLAUDE.md forbade.
    Reason: rule 8 records a case where a whole-file rewrite changed a regex escape. Nothing in PO-S06 asks for targeted edits.
    Measured by: diff of the original and the converted file, and comment counts before and after.
P5. Time and cost. 30 to 55 minutes and 5 to 10 US dollars on the usage panel. PO-S01: about 35 minutes and 4.88 dollars.
    Reason: no guidance means more reading and more trial and error, and there are 3 harder files, but there are no scope decisions to make.
    Measured by: commit times, checkpoints, the usage panel before and after.
P6. Missing types for uuid (used by Task.js and Notification.js). npm install is denied and package.json cannot be edited, so the agent must write its own declaration. It does this without a suppression comment. Confidence about 60 percent.
    Reason: PO-S01 solved the same problem with a declaration file pulled in by a reference path, because tsconfig.server.json excludes .d.ts files. The agent has to find that again without any note.
    Measured by: the files it adds under server/ and the suppression count.

## Measurements after the run
1. Time: prompt paste time, first and last commit time, checkpoints every 15 minutes.
2. Cost: the /usage panel before and after (usage-start.txt, usage-end.txt).
3. Scope: files changed against the baseline commit. Only the 14 files, their .ts versions and new type files are expected.
4. Protected paths: test/, tsconfig.server.json, package.json, package-lock.json, server/libs and .claude/settings.local.json unchanged.
5. Every commit built and tested alone (separate worktree), and five clean builds and test runs at the last commit.
6. Compiled-output comparison with the baseline copy (po-s06-baseline).
7. Counts per file: banned tokens, non-null assertions, as casts, index signatures, declare lines, suppression comments. The same counter on the PO-S01 result.
8. Session log scan: denied or blocked actions, commands outside the allow list, and any access to paths outside the run folder.
9. The final message of the agent against the git facts.
10. Session log backup to po-session-backup\PO-S06 (outside git).

## Limits of this comparison
- One run for each strategy. One pair shows a difference, not how large or how stable it is.
- Two things changed, not one: the guidance and the way the files are chosen.
- The PO-S06 prompt gives a reason and an end state; the PO-S01 prompt did not. Part of any difference may come from the prompt wording.
- Possible contact with PO-S01 material: the answers exist on the same disk, in the main repository. The run folder is two levels away from it and the session log is scanned afterwards (measurement 8). Nothing blocks the agent from reading it.
- A comment in server/finders/BookFinder.ts (line 459) mentions SP-S01. PO-S01 saw the same comment.
- The model may know the public Audiobookshelf repository from its training data.

## Evidence files
- test-results/PO-S06/base-check.txt: first check. It used c9f5fe99 as the base. Its line "parent of cd9e93b8 is the base: False" showed that the run did not start at c9f5fe99.
- test-results/PO-S06/base-check-2.txt: corrected check. The run started at 9f4ff460, three evidence commits after c9f5fe99. No file outside evidence/ differs between the two commits, and CLAUDE.md is the same in both.
- test-results/PO-S06/removed-CLAUDE.md-from-base.txt: the rule file that the PO-S06 agent does not have.
- plans/PO-S06-prompt.md: the prompt, exactly as it is pasted.