# PO-S07: the 8 skipped models, bug fixes allowed (one agent, test first)

Date: 2026-10-10 (NZDT). Branch Aung-Min-Myat/po-s01. Stage base: 33931ea9 (PO-S05 evidence commit).
Planned settings: Opus 5.5, max effort, auto mode (set in the session by the user, as in PO-S05). Cap: 150 minutes after the agent's start.

## Starting state (evidence/test-results/PO-S07/preflight.txt)
- server/models: 17 .ts and 8 .js (Author 208 lines, Collection 292, Feed 682, FeedEpisode 349, LibraryItem 1044, PlaybackSession 257, Playlist 379, User 1026).
- Clean build: 0 "error TS", 356 passing, 0 failing, 464 files in dist-server. Copy saved in D:\SEM-2\574\Project\po-s07-baseline.
- No test file loads any of the 8 models by file path (search pattern: models/<Name>). They may be reached through Database, so this is not proof of zero coverage.
- Permission rules before the run: .claude/settings.local.json denied Edit(test/**). It was replaced by one deny rule per existing test folder, so that only the new folder test/server/bugfix/ can receive files (settings.local.before.json and settings.local.after.json in the evidence folder). These rules cover the edit tools only; shell commands that write files are not covered. After the run we check with git that no existing test file changed.

## What this run changes compared with PO-S05
1. One agent, one model at a time, no sub-agents (PO-S05: a main agent and four sub-agents in two waves).
2. Rule 1 (type-only, no bug fixes) is relaxed in two ways: bug fixes with a test written first, and behaviour-preserving edits that the types need.
3. Rule 5 is read strictly (a cast only on an untyped module, ! only on a field that starts as null). In PO-S05 the main agent chose a wider reading for BookAuthor and MediaProgress.
4. New test files are allowed in test/server/bugfix/ only.
5. Each step is built, tested and committed alone (PO-S05: four commits after one run).
6. CLAUDE.md is unchanged. The prompt states the exceptions. The 17 converted models are named as the worked examples.
Changed variables are therefore: the permission to fix bugs, the strict reading of rule 5, the one-agent serial structure, and the existence of 14 more converted examples. The results cannot be credited to one of them alone.

## Measurements planned
- /usage before and after (usage-start.txt, usage-end.txt) and the end-of-run cost. Taken before the 5-hour reset this time.
- Checkpoints every 15 minutes in run-log.txt. Prompts answered by the user and the "Recently denied" list are recorded at the end.
- After the run: scope and protected paths, banned tokens, every bug fix checked independently (the new test fails on the parent commit and passes on the fix commit), a build and test run of every commit alone, a compiled-output comparison for each conversion commit, five clean builds at the end.

## Predictions (written before the run; the numbers are guesses)
1. At least 6 of the 8 models are converted. LibraryItem is the most likely to be skipped, then Feed.
2. At least 5 of the 9 reported bugs (7 in the 8 files, 2 in already converted files) are confirmed by a test that fails before the fix. The others are reported as not confirmed.
3. Every commit builds and passes the tests on its own.
4. The total cost is lower than PO-S05 ($39.57), because there are no parallel sub-agents.
5. The run takes longer than the 66 minutes of PO-S05.

## Replies policy
If the agent asks a question or a permission prompt appears, the user answers in a few words and counts it.

## Results
TO BE APPENDED after the run.
