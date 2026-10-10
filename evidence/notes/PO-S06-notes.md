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
## Corrections made before the run (after the plan commit 06b5f9af)
1. The row "Model and mode" in the design table was wrong. What the record shows:
   - PO-S01: Opus 5.5 (the usage block shows claude-opus-5-5). The effort level was not recorded. The user-level default is xhigh and nothing records a change, so xhigh is the most likely value (an inference). The settings file gave acceptEdits mode. Whether permission prompts were approved by hand or auto mode was used was not recorded (PO-S01 notes, lines 31 and 77).
   - PO-S06: Opus 5.5 at xhigh (the default, not changed), auto mode, no prompt answered by hand. The permission mode is therefore one more difference from PO-S01, besides the guidance, the file list and the prompt wording.
2. Output style: the user-level setting outputStyle is Explanatory in this run (pre-run-state.txt). The PO-S01 final report contains an "Insight" box, so the same style was active then. It is a constant, not a variable.
3. The PO-S01 session was not fresh: the run happened in the same Claude session as the pre-run checks. The PO-S01 cost of 4.88 dollars is the run alone (end block minus start block); the session total was 5.28 dollars. PO-S06 starts in a fresh session.
4. The superpowers plugin is installed but disabled in the user-level settings (enabledPlugins: false). The PO-S01 session log shows no superpowers skill, so the plugin is off in both runs.

## Results (written 2026-10-11, after the run; the predictions above are unchanged)

### Corrections to earlier entries in this file
- Effort level. All 486 assistant entries in the session log show effort "max". It was set with /model at 23:12:53, for this session only. The section "Corrections made before the run" says xhigh. That was an assumption taken from the settings file, not a measurement. PO-S01's effort level was not recorded, so effort is one more uncontrolled difference between the two runs.
- Start time. The session log shows that the prompt was sent at 23:22:43. The first "CK -Mark" was run at 23:38:37, about 16 minutes later. A correction was added at the end of run-start.txt and run-log.txt. All times below are counted from 23:22:43.

### What the run was
- Prompt: 185 words, 14 files named, no guidance file. The text the agent received is the same as evidence/plans/PO-S06-prompt.md (checked in more-facts.txt; the only extra words in the log are the paste tags).
- Model claude-opus-5-5, effort max, Explanatory output style, superpowers off, permission mode auto.
- The agent made 165 replies and 261 tool calls. No call was denied, no question was asked, no subagent was used, and no user message was sent during the run.
- Prompt sent 23:22:43, final message 00:48:03: 85.3 minutes. (The wall time of 1 h 46 min in the usage panel includes the time until the panel was read at about 01:09.)
- Cost: $21.39 (an API-price estimate; the plan is Claude Max, so nothing was billed). Panel tokens: 307.3k output, 55.2M cache read, 524.4k cache write. The log gives 307,082 output tokens and 54.7M cache-read tokens from the prompt to the final message, within 1% of the panel.
- Result: 15 commits on the branch po-s06/typescript-migration (14 conversions and 1 refinement, d6b0a3a). The agent created the branch itself. The master branch is still at baseline c8fc528.

### Time and tokens by phase (phase-facts.txt, more-facts.txt)
| Phase | Minutes | Model time | Tool time | Replies | Output tokens | Thinking tokens |
|---|---|---|---|---|---|---|
| A. Orientation (until the first file change, 23:42:27) | 19.7 | 13.7 | 6.0 | 28 | 84,945 | 71,192 |
| B. Conversion (until the last conversion commit command, 00:14:48) | 32.4 | 19.0 | 13.4 | 89 | 115,116 | 60,769 |
| C. Checking and report (until the final message) | 33.2 | 18.1 | 15.1 | 48 | 107,021 | 54,437 |
| Total | 85.3 | 50.8 | 34.5 | 165 | 307,082 | 186,398 |

- Model time is the time spent waiting for the model. Tool time is the time spent in commands (builds, tests, scripts, servers). Both come from the gaps between log entries, so they are approximate. The model time (50.8 min) matches the API time in the usage panel (50 min 9 s).
- Thinking was 61% of all output tokens. One reply before the first edit held 34,051 thinking tokens and took 5.3 minutes. The ten longest model waits add up to about 14 minutes, so no single wait explains the total.
- The agent ran 32 build, test or lint commands: 22 test runs (all 356 passing) and 4 builds with type errors (at least 17 errors in total, because the agent printed only the end of each build output). It used those errors to decide its next edit.
- Phase C (39% of the time, 35% of the output tokens) was checking. By the agent's report it reviewed its own diff, ran the old and new compiled code side by side on 4,705 inputs, planted a change in each of the 14 modules to test its tests, and compared two booted servers over 27 steps. This led to one extra commit (d6b0a3a). These figures are the agent's; we have not re-run them.

### Checks made by us, independent of the agent
- 14 of 14 files converted. Nothing changed outside the 14 files or the protected paths (post-run-checks.txt).
- All 16 commit states build with 0 TypeScript errors and pass 356 tests (per-commit-checks.txt). Five clean builds and test runs give the same result and 464 files (clean-build-N.txt, clean-test-N.txt).
- Compiled output against the baseline build (compiled-diff-14files.txt): 5 of the 14 files compile to identical JavaScript and 9 differ in small ways. The agent named the same 9 files. I read the differences and found them harmless; this is a reading, not a proof.
- npm run lint exits with code 0 at the last commit (lint-HEAD.txt). This is a weak check, see "Other observations".

### Type-safety counts (counts-PO-S06.txt, counts-PO-S01.txt; the same 11 files in both runs)
| Marker | PO-S06 | PO-S01 |
|---|---|---|
| any, as any, @ts-ignore and similar | 0 | 0 |
| type assertions (as X) | 14 | 1 |
| non-null assertions (!) | 4 | 0 |
| unknown | 11 | 10 |
| index signatures | 0 | 2 |
| plain require() left in the file | 1 | 0 |
| comments of the JavaScript file missing or changed | 3 of 66 | 0 of 66 |
| lines added / removed against the original | 301 / 89 | 225 / 57 |

- PO-S06 also converted Notification, AudioMetaTags and areEquivalent. For all 14 files: 0 any, 31 type assertions, 5 non-null assertions, 3 of 111 comments missing, 497 lines added and 128 removed.
- The three missing comments are JSDoc type blocks (Task 2, OpenLibrary 1). The TypeScript types replace them, and the descriptions went with them.
- PO-S01 added a declaration file for uuid. PO-S06 did not; it keeps a typed require() in Notification and Task, and its report leaves the declaration (uuid and @types/uuid in package.json) as a decision for us.

### Scoring against the predictions above
- P1: met.
- P2: missed (0 banned tokens in the 14 files).
- P3: the behaviour part is met (356 tests pass in all 16 states and the compiled output is equivalent). The bug-report part is partly met. PO-S01 recorded 3 bugs, all in parseFullName. The agent reported 1 of them (the fixCase comparison with the string 'undefined') and not the other 2. It reported 6 further quirks in other files, which PO-S01 did not record. Checked so far: findByISBN has no callers (true), and one call passes null as task data (PodcastManager.js line 536, true; the report names TaskManager, which only forwards the value).
- P4: not met as written (3 of 111 comments missing, in 2 files).
- P5: missed on both counts. Cost $21.39 against $5-10. Time 85.3 minutes against 30-55 (the conversion alone, 32.4 minutes, is inside the range).
- P6: met.

### Differences from PO-S01 that limit the comparison
- PO-S06 had no guidance file (PO-S01 had CLAUDE.md). The agent used server/finders/ as its style guide.
- Scope: PO-S06 was given 14 named files. PO-S01 chose its own scope and converted 11, all inside the 14. Per file, PO-S06 cost $1.53 and 6.1 minutes; PO-S01 cost $0.44 and about 3.2 minutes. This is not like for like, because the three extra files include two of the larger ones (AudioMetaTags and Notification).
- Permission mode: auto in PO-S06; acceptEdits in PO-S01. Both used the same permission file (7 allow and 19 deny rules).
- Prompt wording: PO-S06 gave the reason and the end state ("the project should build, all the tests should still pass, and the server should behave exactly as before") and asked for a report of what could not be converted or verified.
- Effort: max in PO-S06, not recorded for PO-S01.
- Same in both: model Opus 5.5, source commit 9f4ff460, Explanatory output style, superpowers off.
- Not controlled: the agent had network access and used it (curl to the live Open Library site) and started local servers. The upstream project is public, so the model may know it.
- Each strategy was run once. Every cause named in this file is a hypothesis.

### Hypotheses for cost and time (not tested; one run)
1. The prompt wording ("behave exactly as before", "anything you could not verify") invited the long checking phase.
2. Effort max produced 186k thinking tokens and a 5.3-minute thinking step before the first edit.
3. Auto mode checks part of the calls with a classifier (130 of 261 calls). Its time cost was not measured.
4. The limit to 14 files moved workarounds into the files (typed require for uuid, 31 type assertions).
A repeat run with one setting changed would be needed to separate these.

### Other observations
- ESLint does not process .ts files (lint-ts-ignored.txt: "File ignored because no matching configuration was supplied"). So npm run lint passing says nothing about the 14 converted files, and the conversion removed them from lint. The agent said this in its report. It belongs in the code-based factors section of the final report.
- The agent created and used its own branch and left master at baseline. This was not asked for.
- The agent built its own checking tools: compiled-output comparison, AST comparison with negative controls, differential tests, a planted-change test and a server comparison. They are saved outside Git in po-session-backup\PO-S06-agent-scratchpad.
- At 01:43:47 the PO-S06 session was compacted (the saved log ends with a 38,399-character summary entry). This was after the run and after the usage panel was read, so it changes no number above.

### Not yet verified by us
- The agent's differential tests, planted-change test and 27-step server comparison (the scripts are saved; we have not re-run them).
- The claim that the Open Library ISBN address returns an HTML page (the site did not answer our own test).
- Five of the seven quirks in the agent's report (all except findByISBN and the null task data).

### Evidence files (evidence/test-results/PO-S06)
- usage-start.txt, usage-end.txt: the usage panels.
- run-start.txt, run-log.txt: start records, with the correction.
- phase-facts.txt, more-facts.txt, session-facts.txt, agent-final-message.txt: analysis of the session log and the agent's report.
- per-commit-checks.txt, pc-test-*.txt, clean-build-*.txt, clean-test-*.txt: builds and tests.
- compiled-diff.txt, compiled-diff-14files.txt: compiled output against the baseline.
- counts-*.txt, escape-hatches-*.txt, line-survival.txt: type-safety markers and size of the rewrite.
- lint-HEAD.txt, lint-ts-ignored.txt: lint.
- post-run-checks.txt: scope check.
- The *.js files are the helper scripts that made these files.
- The session log and the agent's scratch folder are stored outside Git, in D:\SEM-2\574\Project\po-session-backup.

## Correction added on 11 October 2026

- Effort of PO-S01: the session log shows xhigh. The "not recorded" statements above (the comparison with PO-S01) are replaced by this. PO-S01 took 39.2 minutes from the prompt (3.6 minutes per file), not 33 to 37 minutes (about 3.2 per file).
