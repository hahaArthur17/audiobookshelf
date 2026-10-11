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

## Results (written after the run; times are NZDT on 2026-10-10)

### Run
- Model and effort: Opus 5.5, max (the session file shows claude-opus-5-5 and effort max on the same 422 lines). Permission mode: auto from the paste (the session file shows acceptEdits before the prompt line and auto from it). Prompts answered by the user during the run: 0 (after the /model command, the prompt is the only user line in the session file that is not a tool result). The "Recently denied" list, read after the run: empty. Plugins: not recorded. Sub-agents: none found (the session backup holds one .jsonl file, and the prompt said not to start any).
- Prompt pasted at 20:28:42 (session file, 07:28:42 UTC). By its own report the agent started at 20:29 and finished at 21:39, which is 70 of the 150 minutes. The terminal shows "Baked for 1h 11m 42s", done 9:40 PM, counted from the paste. Nothing was pushed.
- Minutes per step, from the commit times (to the minute, so about 1 minute of error): Author 14 (counted from the agent's start, so this includes reading CLAUDE.md, the examples and the Sequelize source), FeedEpisode 8, Collection 6, PlaybackSession 3, Playlist 7, Feed 10, User 9. The last 13 minutes went to the LibraryItem pass, the Library fix, the Book probe and the evidence commit. The time does not follow the file size: User (1026 lines) took 9 minutes and Collection (292 lines) took 6.
- Checkpoints (time | .ts | .js in server/models | commits | files in test/server/bugfix; run-log.txt): start 17 | 8 | 0 | 0 (preflight.txt); 20:44 | 18 | 7 | 2 | 1; 20:58 | 21 | 4 | 5 | 2; 21:14 | 23 | 2 | 11 | 6; 21:29 | 25 | 0 | 13 | 6. At 21:29 the working tree showed 25 .ts and 0 .js because the first pass on LibraryItem had renamed it (our reading of the 25 and 0). It was restored: the final tree has 24 .ts and 1 .js (17 plus the 7 renames in the diff), LibraryItem.js is unchanged in git, and its compiled file is identical to the baseline.
- Human involvement: two design answers before the run (both times the option that Claude recommended), the paste of the prompt, and a checkpoint script run about every 15 minutes. The agent needed no input during the run.

### Cost
- End panel (usage-end.txt, taken after the run and before the 10:50pm reset): total cost $16.09. Opus 5.5: 286 input, 284.4k output, 31.6m cache read, 508.9k cache write ($16.09). Haiku: 3.3k input, 28 output ($0.0003). API time 44m 50s. Wall time 1h 23m 49s (this includes the time before the paste, since the /model command was at 20:27, and the time after the run). Main agent: 95 requests, 98% of input from cache, no misses. Code changes shown on the panel: 1998 lines added, 596 removed (this counts everything written in the session, including the evidence and test files).
- Session bar (5-hour window): 4% at the start and 17% at the end. Weekly bar (all models): 50% at the start and 52% at the end. Total cost on the start panel: $0.0000. Both bars are account-wide, so they include other use. The 5-hour window reset at 10:50pm, after the end panel was taken, so the two session values can be compared.
- The "What's contributing to your limits usage" lines (89% of usage at over 150k context, 81% from subagent-heavy sessions) cover the last 24 hours of all sessions on this machine. They include the PO-S05 run, which used four sub-agents, so they do not describe this run.
- Compared with PO-S05: total $16.09 against $39.57 (41%). Output tokens 284.4k against 755.3k, cache read 31.6m against 58.1m, cache write 508.9k against 2.1m, API time 44m 50s against 2h 2m 51s. Per converted model: $2.30 (16.09 / 7) against $2.83 (39.57 / 14), or $3.30 for PO-S05 under the strict reading of rule 5 (12 models). PO-S04 (3 models): $1.72.
- This is not a like-for-like comparison. The jobs differ (8 files against 22), the rules differ, the structure differs, and PO-S07 includes seven bug-fix tests and a failed LibraryItem pass. The lower total comes mainly from the smaller job. Per converted model the difference is 19%, and we cannot credit it to one change.

### Outcome
- 7 of 8 models converted, each conversion in its own commit. LibraryItem skipped and restored. 7 of the 9 reported bugs confirmed by a test that fails before the fix and passes after it; 2 not confirmed. 19 new tests in 7 new files in test/server/bugfix/. Final state: 375 passing (356 + 19), 0 failing, 0 "error TS".
- The user's aim before the run was "all 8, securely and perfectly". The result is 7 of 8. The run did not use a ! or a cast on a typed module to force the eighth. "Perfectly" is not shown by this evidence (see Not checked).

| Model | .js lines | Bug-fix commit(s) | Conversion commit | ! | Index sig. | Casts | declare sequelize |
|---|---|---|---|---|---|---|---|
| Author | 208 | b1b3c68d | 7f72174c | 0 | 0 | 0 | 1 |
| FeedEpisode | 349 | none | 16c6d9e0 (amended) | 0 | 0 | 1 | 0 |
| Collection | 292 | 265b6757 | 21af7d9c | 0 | 0 | 0 | 1 |
| PlaybackSession | 257 | none | c076ac4d | 0 | 0 | 0 | 2 |
| Playlist | 379 | 1b801241, 3ca5e5ff | 3377dfc7 | 0 | 0 | 0 | 1 |
| Feed | 682 | 42357df4, c1793a94 | b2423021 | 0 | 0 | 0 | 2 |
| User | 1026 | none (not confirmed) | 034b2135 | 0 | 4 | 0 | 2 |
| LibraryItem | 1044 | none | skipped | | | | |
| Total | | | | 0 | 4 | 1 | 9 |

- Library.ts (already converted) got the seventh bug fix, ed903cc1. The last commit, a5b21570, is evidence only (probes for the two unconfirmed bugs, the LibraryItem errors, SQL captures, final outputs). It is the one commit outside the two message forms of the prompt, and the agent reported it.
- Other already converted files: MediaProgress.ts has one hook-parameter annotation, (instance: MediaProgress), which the User conversion needed according to the agent. Its compiled file is identical to the baseline. Nothing was added to server/types/ (our check: unchanged).
- Counts of ! (0), index signatures (4, all in User.ts), casts (1, FeedEpisode.ts:10, on the untyped libs/dateAndTime module) and "declare ... sequelize" lines (9, in 6 files) are the agent's report, and our scan finds the same numbers (post-run-checks.txt). Our cast search found 2 lines; the second (Playlist.ts:421) matches the words "as above" in a comment.
- One more workaround is not in those counts. Four places (Author, Collection, Playlist twice) copy an object into a local alias that is typed with libraryItem optional, because TypeScript only allows delete on an optional property (TS2790). It is not a cast and rule 5 does not list it. The agent counted it as a 1(b) edit. It makes the compiler accept something it would otherwise reject, so it goes into the suppression register.
- One amend: the first FeedEpisode commit held only the bare rename, because a git add on the old .js path failed and its error was hidden. The agent saw this, amended the unpushed commit (now 16c6d9e0) and reported it. Our per-commit run confirms that 16c6d9e0 builds and passes (358 passing).

#### LibraryItem (skipped)
- 74 compiler errors after a first pass. Three groups (22 errors) have no fix within this run's rules: 4 errors (TS2322) because libraryItem.media = await libraryItem.getMedia(...) can return null and media is read unguarded elsewhere; 14 errors (TS2339, TS18046) because saveMetadataFile() copies the media into a local and then tests this.mediaType, so nothing can narrow the local; 4 errors (TS2571, TS2339) because getAudioFileWithIno() branches on the isBook getter, which narrows nothing. The other 52 are solvable with more typing. The full list is in LibraryItem-skip-errors.txt.
- Our reading: in PO-S05 the blockers were null defaults, requires used only in JSDoc and a Book | Podcast union (81 errors). The 1(b) edits removed the first two. What is left is that mediaType and media depend on each other, and any fix needs a guard that changes behaviour. That is a rule decision (see Decisions).

#### Why the seven files converted this time (our reading of the PO-S05 skip reasons)
| Model | Why PO-S05 skipped it | What PO-S07 did |
|---|---|---|
| Author | author!.books on an unchecked findByPk() result (TS18047) | 1(a): author?.books, test first |
| FeedEpisode | new Date(b) - new Date(a) (TS2362, TS2363) | 1(b): .getTime() and Number(); the break guard for Date or null |
| Collection | where: null passed to findAll (TS2322) | 1(b): where left out when null |
| PlaybackSession | where: null (TS2322); silent: true passed to upsert (TS2353) | 1(b): where left out; the ignored option removed |
| Playlist | nested include given as one object (TS2322, TS2353) | 1(b): include given as an array |
| Feed | function and argument chosen in matching branches (TS2345); Series or null passed on unchecked (TS2345) | 1(a): three null guards; a hand-written method-signature type (unchecked) |
| User | nested include given as one object (TS2769) | 1(b): include given as an array |
- In every case the PO-S05 blocker was either a typing rule of Sequelize that rejects an argument which works at runtime, or a nullable result that the JavaScript never checks. Rule 1(b) and rule 1(a) allowed the edit that rule 1 had forbidden. We cannot say how much the 17 worked examples, the strict reading of rule 5 or the serial structure added, because they changed at the same time.

### Bugs
All files are in evidence/test-results/PO-S07/. "Fails before" is our run of the parent commit plus the new test file (per-commit-checks.txt).

| Reported bug | Result | Test that fails before the fix | Commit | Fails before (our run) |
|---|---|---|---|---|
| Author.js:98 | confirmed | returns an empty array for an unknown author id | b1b3c68d | 1 failing: TypeError, reading 'books' of null |
| Collection.js:99 | confirmed | leaves out the books that the user is not allowed to access; does not store the filtered books on the Collection class | 265b6757 | 2 failing: the result held the restricted book |
| Playlist.js:332 | confirmed | returns false for a book when the playlist holds a podcast episode | 1b801241 | 1 failing: TypeError, reading 'id' of undefined |
| Playlist.js:190 | confirmed | waits until the new order of each remaining item is saved before it reports the playlist | 3ca5e5ff | 1 failing: playlist_updated came before the two order saves |
| Feed.js:511, 489, 502 | confirmed | returns null when the library item, collection or series of the feed no longer exists (3 tests) | 42357df4 | 3 failing: TypeError on null |
| Feed.js:305 | confirmed | does not throw when no book of the series has audio tracks; lets updateFeedForEntity empty a series feed | c1793a94 | 2 failing: TypeError, reading 'libraryItem' of undefined |
| Library.ts, max() or 0 | confirmed | returns 0 when there is no library | ed903cc1 | 1 failing: expected null to equal 0 |
| User.js:678 | not confirmed | none | none | |
| Book.ts (651-653, 686) | not confirmed | none | none | |

- 11 of the 19 new tests fail before their fix; the other 8 are control tests that pass before and after. After each fix the commit passes with 0 failing.
- User.js:678: the agent ran a probe and found no input for which the method gives a wrong answer. For a model instance media.metadata is always undefined, and media.explicit does the work. An old-shape object is still refused through the second half, so deleting the first half would be a guess.
- Book.ts: the crash is real when a series is loaded without its join row, but the code does not say what should happen instead. A ?. at line 686 would emit undefined, a value the old JSON never has. The sibling toOldJSON() throws on purpose when an include is missing. At 651-653 the next line writes to the same missing row, so a guard on the read only moves the error. No caller reaches either line today.
- Both probes ran from outside the repo and are not in the suite. They were committed as evidence (a5b21570); we did not re-run them.
- What "confirmed" means: the test fails on the old code and passes on the new code, so the old code behaved as the test says and the new code differs. It does not show that the new behaviour is the intended one. Three fixes rest on a choice by the agent that the code does not state: Playlist.js:332 returns false, the three Feed guards log an error and return null (the agent says the method already reports its other failures this way), and Feed.js:305 falls back to the library id of the series. Collection.js:99, Playlist.js:190 and Library.ts need no such choice (a wrong variable and two missing awaits). For Collection the effect is that books the user may not access were in the result; the effect on the API was not checked.
- Of the 9 reported bugs, 7 were confirmed. The reports came from the earlier runs and were claims until tested. Each one needed a test before it could be used.

### Edits of point 1(b) (22 places, 8 kinds; the agent's list)
| Kind | Count | Where |
|---|---|---|
| delete x.libraryItem through an alias typed with the property optional | 4 | Author, Collection, Playlist (2) |
| nested include given as an array | 9 | Playlist (7), User (2) |
| where left out when null | 2 | Collection, PlaybackSession |
| silent: true removed from upsert() | 1 | PlaybackSession |
| .getTime() on a Date subtraction | 2 | FeedEpisode |
| Number(x) on a subtraction operand | 2 | FeedEpisode |
| const alias of a let used in a callback | 1 | User |
| if (x === null) break | 1 | FeedEpisode |
- Feed needed none. What we checked (per-commit-checks.txt): for each conversion commit the compiled file differs from the previous commit's only in 8 (Author), 27 (FeedEpisode), 8 (Collection), 11 (PlaybackSession), 49 (Playlist), 9 (Feed) and 41 (User) lines. These are the require lines that TypeScript writes in the import-equals form, the edits in the table, and one added reference comment to server/types/untypedModules.d.ts in FeedEpisode and User. In all 7 the list of required modules is the same and in the same order.
- What we did not check: that the behaviour is the same. The agent's evidence for that is its reading of the Sequelize source and its SQL capture (sql-capture.js, sql-capture-before.txt, sql-capture-after.txt). We did not re-run them.

### Checks by us (saved in evidence/test-results/PO-S07/)
- Scope (post-run-checks.txt, 21:53): outside evidence/ and test/ only 9 files changed: 7 renames in server/models (Author, Collection, Feed, FeedEpisode, PlaybackSession, Playlist, User; similarity 63 to 73%), Library.ts and MediaProgress.ts. tsconfig.server.json, tsconfig.check.json, package.json, package-lock.json, server/libs, server/types and CLAUDE.md are unchanged. The working tree was clean apart from the untracked evidence files.
- test/: 7 lines in the diff, all additions (A), none changed or deleted. The deny rules cover the edit tools only, so this git check is the real proof that no existing test file was changed.
- Banned tokens in the 7 new files: 0. Non-null assertions: 0.
- Every commit alone (per-commit-checks.txt, separate worktree at f2d8a805, dist-server removed before each run): 15 of 15 commits have 0 "error TS" and 0 failing. Passing: 358, 358, 358, 361, 361, 361, 364, 366, 366, 370, 373, 373, 373, 375, 375. The count rises at each fix commit by the number of tests it adds (19 in total) and stays the same at each conversion commit. Each run took 32 to 38 seconds.
- Fail before the fix: the parent commit plus the new test file(s) fails for all 7 bug tests (11 failing tests in total, listed in the table above).
- Five clean builds at a5b21570 (clean-builds-summary.txt, clean-build-N.txt, clean-test-N.txt): every run has 0 "error TS", 0 "Debug Failure", 375 passing, 0 failing and 471 files in dist-server.
- Compiled output against the baseline built before the run (compiled-diff.txt): 464 files before and 471 now. No file only in the baseline. Only in the new build: the 7 bugfix test files. Content differs in .tsbuildinfo and 8 models: Author, Collection, Feed, FeedEpisode, Library, PlaybackSession, Playlist, User. LibraryItem.js and MediaProgress.js are identical to the baseline.
- Session facts (session-facts.txt): auto mode from the prompt line, Opus 5.5 at max effort, the prompt as the only user message. The session backup holds one .jsonl file, so there are no sub-agent files. The session file is copied to D:\SEM-2\574\Project\po-session-backup\PO-S07\ (4,019,950 bytes, not in git). The agent's scratch folder (25 files, 734,592 bytes) is in agent-scratch/.

### Decisions (recorded after the checks; the user can change any of them)
1. FeedEpisode break guard: if (earliestLibraryItemCreatedAt === null) break, inside the loop of createFromBooks(). The agent calls it the least clear-cut 1(b) edit, because it adds a guard and does not rewrite an expression. Our reading of the code: the value is null only when books is empty, and then the loop does not run, so the guard is not taken unless the library item of the oldest book has a null createdAt. We did not check how that column is defined. Status: accepted, which gives 7 of 8. If it is rejected, FeedEpisode becomes a skip (6 of 8).
2. Feed.js:305: the agent's fallback to seriesExpanded.libraryId. The URL is unchanged whenever a book with audio exists (agent's statement); the old code threw in the other case. Status: accepted as the agent's design choice. The callers of getFeedObjForSeries were not checked.
3. Unchecked declarations: Feed.ts has a registry entry for libraryItem described by hand (as MediaItemShare.ts does) and a method-signature type that holds one of three functions with different first parameters; User.ts has two registry entries written as ModelStatic of the row a query loads. Together with the 9 "declare ... sequelize" lines, these state things that the compiler does not check. Status: recorded as unchecked assumptions, as in PO-S04 and PO-S05.
4. Book.ts and User.js:678 stay "not confirmed" and unchanged. A Book fix needs a decision on which value a missing join row should give.
5. Rule 5: the strict reading was applied here (0 !, 1 cast on an untyped module). Open: whether the PO-S05 count stays at 14 or becomes 12 (BookAuthor.ts:63 and MediaProgress.ts:180, 248, 265; the agent names MediaProgress.ts:180). This is the user's own decision, not a group ruling.
6. LibraryItem stays JavaScript for now. Options: a short separate run in which a behaviour-changing guard is allowed (a 1(a) change, which needs its own test), or accept it as the one file that stays JavaScript.

### Not checked
- The agent's SQL captures and the two probes were not re-run by us.
- No boot test and no request to a running server. The tests use an in-memory SQLite database and the Database class, not the Express app.
- No human review of the 7 converted files. In this chat, Claude read the 7 fix diffs and the FeedEpisode guard, not the conversion diffs line by line. Our conversion check is at the level of the compiled output.
- The callers of the changed results (Feed returning null, Playlist returning false, the series siteURL) were not checked.
- The tests and the fixes were written by the same agent. Our fail-before and pass-after runs show that the tests detect the behaviour they describe. They cannot show that the described behaviour is the intended one.

### What the run showed about CLAUDE.md
- The Sequelize section worked unchanged in all seven files. The agent says it did not cover:
  1. delete on a property that is read unguarded just before it (TS2790). This decided three models.
  2. Null-default options, and the rule that only a top-level include may be a single object.
  3. A narrowed let losing its narrowing inside a callback.
  4. Two fields that depend on each other (mediaType and media). This is why LibraryItem was skipped, and it needs a ruling on what is allowed.
  5. A function and its argument chosen in matching branches.
  6. After git mv, stage only the new path (this is the cause of the amend).
  7. tsc never deletes old output, so a test file that is built and later removed would still run from dist-server.
  8. Rule 1 and the "356 passing" check contradict this run's prompt.
  9. The prompt named no baseline copy, so the agent compared against the previous commit's compiled file.
- Items 8 and 9 are gaps that we left. The prompt said that its five points replace the matching parts of CLAUDE.md for this run, and the agent followed the prompt without asking. CLAUDE.md itself was not changed, and its "Done so far" line is still out of date.

### Workflow observations (for the evaluation)
- What the agent was told: one prompt of 6,072 characters (evidence/plans/PO-S07-prompt.md) and CLAUDE.md (48 lines, unchanged). The session shows the prompt with the same points as the plan file (not compared character by character). The prompt was drafted by Claude in this chat from the PO-S05 results and the user's two answers. It fixed the order of the models, five replacements for CLAUDE.md, the commit message forms, a 150-minute cap, the list of reported bugs with line numbers and a report format. There was no second specification: in PO-S05 the main agent wrote the four briefs.
- Test first worked as a control. The rule "if you cannot make the test fail, or the intended behaviour is not clear, do not change the code" was applied twice (User.js:678, Book.ts). In both cases the agent gave reasons and did not guess. For the seven confirmed bugs, each fix commit has a test that fails on the parent.
- The agent used three kinds of evidence for "same behaviour" in 1(b) edits: the Sequelize source, SQL captures before and after, and the comparison of its compiled output with the previous commit. It did not claim a result it had not run, and it listed the unclear cases as "Decisions for you" instead of stopping.
- The one process error (the hidden git add failure) was found by the agent itself before our checks, and was reported with the fix.
- Items noticed but not fixed (agent): RssFeedManager.getFeed() calls buildXml() on a possibly null result; LibraryItem.getCoverPath() reads media unguarded; getMediaItemsInProgress() is called with five arguments and declares four; the existing cast at MediaProgress.ts:180 would not pass this run's strict reading. The prompt said not to look for other bugs, and the agent kept these out of the code.
- What this run cannot show: the effect of one change. The permission to fix bugs, the strict reading of rule 5, the one-agent serial structure and 14 more worked examples all changed together.

### Predictions (written before the run; the numbers were guesses)
1. At least 6 of the 8 models are converted: 7 of 8. Met. LibraryItem was the one skipped, as predicted; Feed was converted. If the FeedEpisode guard is rejected the count is 6, still met.
2. At least 5 of the 9 reported bugs confirmed by a failing test: 7 of 9. Met.
3. Every commit builds and passes the tests on its own: 15 of 15 (our run). Met.
4. The total cost is lower than $39.57: $16.09. Met. The reason in the prediction (no parallel sub-agents) is not shown by the data: most of the fall comes from the smaller job, and the cost per converted model fell by only 19%.
5. The run takes longer than 66 minutes: 70 minutes by the agent's clock, 72 from the paste. Met by 4 to 6 minutes.
- All five were met, but the thresholds were loose, so this does not show that we understood the run. Only prediction 3 could clearly have failed (the PO-S05 commits were not built alone). Next time each prediction should have a range and one reason, and at least one should be able to fail in a way we would learn from.

### Open items
- Decide about LibraryItem (decision 6) and about the PO-S05 rule 5 spots (decision 5).
- Human review of the 7 converted files, starting with User.ts (4 index signatures), Feed.ts (the hand-written declarations) and the FeedEpisode guard.
- Check the callers of the changed results, and how createdAt is defined for the FeedEpisode guard.
- Optional: a boot test with the real server; an independent re-run of the SQL capture and the two probes.
- Strictness probe and suppression register: the 4 aliases, 9 declare sequelize lines, 3 hand-written declarations, 4 index signatures and 1 cast of this run, plus the PO-S05 items.
- Update CLAUDE.md (the 9 gaps above and the "Done so far" line) before the next run that uses it.
- The earlier-report items that the prompt declared "not bugs for this run" (numbers or strings assigned to DATE fields, JSDoc mismatches, ApiKey permissions copying) remain unverified.
- PO-S06 (low-detail prompt on matched leaf sets) is still to be run.
