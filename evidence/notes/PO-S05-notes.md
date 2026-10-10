# PO-S05 notes (parallel models stage, same branch po-s01)

Workflow: parallel sub-agents on disjoint sets of models, in two waves, with one main agent that builds, tests and commits. It is the PO-S03 workflow applied to the Sequelize models, with the corrected CLAUDE.md.
Question: does the corrected Sequelize pattern scale from the three small pilot models to the other 22, including the five large ones (LibraryItem, User, Book, Feed, Podcast; 3,941 lines)?
Date: 2026-10-10
Branch: Aung-Min-Myat/po-s01
Start state: HEAD bfb91728 (CLAUDE.md corrected). The stage base commit (the commit that adds this plan) is written in evidence/test-results/PO-S05/run-log.txt.
Targets: the 22 remaining models in server/models/, 7,434 lines, in four sets (see evidence/plans/PO-S05-prompt.md). Seven models have no relative requires (929 lines): Collection, CollectionBook, BookAuthor, BookSeries, PlaylistMediaItem, CustomMetadataProvider, MediaItemShare.
Planned settings: Opus 5.5 at max effort (as in PO-S04); permission mode auto from the paste (Shift+Tab before pasting); four sub-agents; two waves with stops at 50 and 100 minutes; cap of 120 minutes from the paste. Settings file: the same 15 deny and 17 allow entries as PO-S04 (copy in evidence/context-files/PO-S05-settings.local.json).
Differences from earlier runs (so the numbers are not compared as if equal): PO-S03 had 3 sub-agents, a 60-minute cap, one wave, acceptEdits and an unrecorded effort level. PO-S04 had one agent, 3 models, 45 minutes, acceptEdits and then auto, at max effort. PO-S05 is bigger on purpose (more files, more agents, a longer cap) because cost is not a concern on my plan. The real limit is the 5-hour usage bar, so I start after it resets at 5:29pm if possible.
Progress measure: first-party .ts files outside server/libs (44 at the start), in-scope .js files left (123), model .js files left (22), build, tests (356), banned tokens, and compiled-output changes against a baseline copy taken at the stage base (D:\SEM-2\574\Project\po-s05-baseline).
Checks after the run, all saved to files this time: protected paths, banned tokens, counts, compiled output, five clean builds with their output, a boot test, the session timeline, the agent messages, the /usage start and end panels (Notepad method), the Recently denied count, and the number of prompts or blocks.

## Predictions (written before the run; suggested by my assistant and adopted by me; the numbers are guesses)
1. At least 6 of the 7 models without relative requires convert with the pattern as written in CLAUDE.md.
2. At most 3 of the 5 large models convert without a cast, a non-null assertion or an index signature.
3. Between 14 and 20 of the 22 models are converted at the end, not all 22.
4. The Sequelize rules in CLAUDE.md need at least one more correction.

## Replies during the run
- If the agent asks me to confirm that the pasted message is my instruction: "Yes, that is my instruction. Go."
- If the agent asks me a question: "Use your judgment."
- In auto mode I answer nothing else. If auto mode falls back to prompting (3 blocks in a row or 20 in total), I note the time, and I answer Yes only to prompts that match the task.