# PO-S09: the layer below first, then the 8 remaining controllers (one agent, then four sub-agents)

Date: 2026-10-11 (NZDT). Branch Aung-Min-Myat/po-s01 in D:\SEM-2\574\Project\audiobookshelf-po. Stage base: the setup commit "[PO-S09] setup" (the parent of the first commit made by the agent).
Planned settings: Opus 5.5, max effort, auto mode (fresh session), plugins disabled. Cap: 120 minutes after the agent's start.
Who prepared the run: Claude (chat session), on the user's instruction to prepare everything except the Claude Code steps. The user checks /model, /plugin, /permissions and /usage, pastes the prompt and says when it starts and ends.

## Why this run
PO-S08 converted 14 of 22 controllers and restored 8 (4,860 non-blank lines, 59%). The agents' reasons, checked against the saved compiler output, were mostly in the layer below the controllers: association mixins and fields that the converted models do not declare (ApiKey getUser; Library stats and others), the model LibraryItem still in JavaScript (TS2684 on its statics), results that can be null although the code does not check them (Session, Collection, Playlist, Podcast), and Sequelize typings (User). Rule 5 also decided ApiKey (it compiled with 0 errors and two casts, and was restored because of the rule).
The user took two decisions on 2026-10-11, after the PO-S08 audit: (1) PO-S09 fixes the layer below first and then retries the 8 controllers; (2) rule 5 allows a non-null assertion on an association that the query always loads and on a lookup that earlier code guarantees, with each use counted and explained.

## Starting state
- server/controllers: 15 .ts and 8 .js (4,860 non-blank lines in the 8). 202 .bind(this) registrations in server/routers/ApiRouter.js.
- Last code commit d89acaf7 (PO-S08): build clean, 375 passing. Setup commit adds CLAUDE.md changes only.
- Compiled baseline for my comparison after the run: D:\SEM-2\574\Project\po-s09-baseline (Windows build at the setup commit, made by the Prep-S09 function). The agent makes its own copy in its scratchpad and does not know about this folder.
- Permission rules: mode acceptEdits, 17 allow rules, 20 deny rules (15 as before, plus Bash(sed -i *), Bash(sed -ni *), Bash(sed * -i *), Bash(perl -i *), Bash(perl -pi *)) and a PowerShell deny rule from outside the file. Copy of the file before the run: settings.local.before.json (the same as PO-S08); the added rules are listed here.

## What this run is
- Two phases in one session.
  - Phase A (one agent, no sub-agents, 45 minutes): probe the 8 controllers with git mv and a no-emit type check, group the errors by cause, add declarations only (declare lines in server/models/*.ts, declarations in server/types/, one annotation on a destructured import), try the model LibraryItem.js once (20 minutes at most), and pass a gate (build, 375 tests, compiled output without code differences from the agent's own copy) before each commit.
  - Phase B (main agent plus four sub-agents with two controllers each, stop at 100 minutes, cap 120): ApiKey+Session, User+Collection, Playlist+Library, LibraryItem+Podcast. Only the main agent edits models and types, builds, tests and commits.
- Sets (non-blank lines): 1 ApiKey 186 + Session 337 = 523; 2 User 462 + Collection 408 = 870; 3 Playlist 527 + Library 1,340 = 1,867; 4 LibraryItem 1,088 + Podcast 512 = 1,600.

## What this run changes compared with PO-S08
1. The order of the work: layer first (probe, declarations, gate), then controllers. In PO-S08 the sub-agents found the missing declarations while converting and could only report them.
2. Phase A has no sub-agents. Declaration edits touch shared model files, so one agent makes them.
3. Rule 5 now allows ! on a loaded association and on a lookup guaranteed by earlier code (counted and explained). In PO-S08 only the first was allowed, by a ruling during the run.
4. The pre-run notes are out of reach of the agents: before the run the folder evidence/ is hidden with git sparse-checkout (the files stay in git and nothing is deleted), and the checkpoint files of the run are written to D:\SEM-2\574\Project\po-s09-hold, outside the repository. CLAUDE.md no longer points to evidence/. In PO-S08 the agents read the notes with the predictions, and the main agent built its checks on the baseline folder named there.
5. sed -i and perl -i are denied (two sub-agents used sed -i against the brief in PO-S08). Python or node one-liners can still write files; they are not blocked.
6. CLAUDE.md fixes: the scope line no longer conflicts with the prompt about server/types/ (it now says that only the main agent edits server/models/*.ts and server/types/ in this run), the "Done so far" line is current, and a section "Declarations for the layer below" is new.
7. Smaller: 4 sub-agents in one wave instead of 3 + 2 waves; a shorter cap (120 minutes).

## Residual risks (stated before the run)
- The agent can still read the notes through git (git show HEAD:evidence/notes/...), or in the Phase 1 repository or other folders on the machine. Nothing in the prompt or CLAUDE.md points there. The logs will be searched for any read of evidence/ or po-s09-hold.
- The agents know the PO-S08 commits (git log) and the files that PO-S08 converted, as in earlier runs.
- The result still depends on one run on one repository.

## Measurements planned
- From the session logs (Backup-S09): prompt time, end time, tokens by agent, permission decisions, reads of evidence/ or the hold folder, any use of sed -i, perl -i, python or node writes to source files.
- After the run (by Claude, in a Linux clone, not by the agent's scripts): build and tests at every commit; changed files and protected paths; compiled output against po-s09-baseline; counts of casts, !, index signatures and this: ApiRouter parameters by two methods; the declarations added in Phase A (count, files, only declare lines?); skip reasons against the saved compiler output; the API smoke test of the earlier audits.
- Usage panel before and after (usage-start.txt, usage-end.txt).

## Predictions (written before the run; the numbers are guesses)
1. Phase A leaves build, tests and compiled output unchanged at every commit: 90%.
2. LibraryItem.js converts in Phase A: 30%.
3. 3 to 5 of the 8 controllers are converted (ApiKey, Session, Collection and Playlist are the most likely; Library, LibraryItem, User and Podcast the least): 70% for this range. Fewer than 3: 20%. More than 5: 10%.
4. Lines converted in Phase B: 1,500 to 2,800 of the 4,860.
5. Total time 80 to 120 minutes; cost between $35 and $70 on the panel; week limit moves by 3 to 6 points.
6. Non-null assertions added: 15 to 60 (the new allowance is wide).
7. The logs show no read of evidence/ or the hold folder: 80%.
8. No sed -i or perl -i; at least one other in-place write by the shell (python, node, a redirect): 40%.
9. Every commit builds and passes 375 tests alone: 85%.

## Replies policy
The user answers no question and no permission prompt during the run, as in PO-S05 to PO-S08. If the agent is blocked the run ends and the reason is recorded.

## Results (written after the run)

Sources: agent-final-report.txt, terminal-transcript.txt, usage-start.txt, usage-end.txt, run-log.txt, preflight.txt, session-log-analysis.txt, agent-briefs-and-reports.txt, post-run-checks.txt, counts-rows.txt, typescript-share.txt, smoke/, restored-controllers/ and scripts/ (all in evidence/test-results/PO-S09/), and the session logs (po-session-backup/PO-S09: the main log and four sub-agent logs). Times are NZDT, 2026-10-11.

### How the run was operated
The user started a fresh session, did the checks (the log shows /model at 13:12:09 and /plugin at 13:12:19; the /usage reading is in usage-start.txt), switched auto mode on and pasted the prompt at 13:22:58 (4,129 characters in the log). The checkpoints in run-log.txt (8 to 16 minutes apart), the checks after the run and these notes were done by Claude in a separate chat session. That session read the repo through the mounted folder and wrote its checkpoint files into the hold folder outside the repo. The agent logs contain no reference to the hold folder (0 in the main log and in the four sub-agent logs). Nothing was sent to the agent session.

### What happened
- Phase A (13:23 to 14:01, limit 45 minutes), one agent, no sub-agents.
  - Probe: a bare rename of the 8 controllers gives 533 errors (the agent's count; 534 error lines in its saved files). Because `require()` is `any` in a `.ts` file, the agent added a probe with checkJs on the untouched files: 523 errors. It grouped them by cause: 371 are ordinary conversion work, 152 (29%) are in the layer below or in helpers (missing declarations in converted models 14, the JavaScript LibraryItem model 15 + 56, signatures narrower than the call 9, MediaProgress.mediaItem 5, Sequelize typing 3, untyped helper results 38, untyped helper parameters 12).
  - Three commits, all declarations: 449aced5 (13:41:34, six `declare` lines in six models: ApiKey getUser, Collection getCollectionBooks, CollectionBook book, Library getLibraryFolders, PlaybackSession user, Podcast libraryItem), d97d6a92 (13:50:23, new server/types/libraryItemModel.d.ts for the statics of the JavaScript LibraryItem model) and 51c007ee (13:57:46, two declarations changed to accept a single nested include). No runtime line changed. Compiled output was identical after each (469 of 469 files).
  - LibraryItem.js was tried once: `git mv` at 13:50:50, restored at 13:52:37 (about 2 minutes of the 20 allowed). 79 errors remained after the header conversion (agent's count, not re-run); 14 of them are reads of `media` by book-only or podcast-only names after an `isBook` test that does not narrow the union.
  - The agent's own mistake: the new .d.ts first held global declarations. The first incremental build that referenced it crashed TypeScript 5.9.3 with "Debug Failure" (the same effect as `declare global`, which CLAUDE.md forbids). The Phase A gate could not catch it, because no file referenced the .d.ts yet. The agent made the file a module with `import type` in 747dc089 (14:50:46).
- Phase B (14:02 to 14:36): four sub-agents with two controllers each, started 14:02:01 to 14:03:49. Briefs of 10,034, 12,081, 12,371 and 13,467 characters, written by the main agent. The main agent also sent three hints to sub-agents 1, 2 and 3 (14:05, 14:10, 14:14: PublicRouter binds getTrack; verified forms for the UserController wall; verified typings for LibraryController). Hand-backs at 14:28:51, 14:31:46, 14:35:12 and 14:36:22 (25 to 33 minutes of agent time each). All four reported 0 type errors for their two files, no skipped controller and no request for a declaration. They did not build, test or commit.
- Integration (14:36 to 14:52): the main agent read the sites the sub-agents had flagged, ruled on rule 5, saved the conversions of Session, Playlist and User and restored the three files (14:41 to 14:43), fixed the .d.ts, gated the whole tree once and made five commits (14:50:48 to 14:52:01). Final report 14:56:36.
- Result: 5 of 8 committed (ApiKey, Collection, Library, LibraryItem, Podcast: 3,534 of 4,860 non-blank lines, 73%), 3 restored (Session 337, Playlist 527, User 462 lines: 1,326). Controllers in TypeScript: 20 of 23. With PO-S08, 19 of the 22 controllers that were JavaScript before PO-S08 are converted. Files changed since the setup commit: 12 (5 controllers, 6 models, 1 new .d.ts), 492 insertions, 265 deletions.
- Time: 93.6 minutes from the prompt to the final report (last commit 89.0 minutes). The stop time (100 minutes) and the cap (120) were not reached.
- Cost (panel at the end): $47.66, API time 2 h 21 min 46 s, wall 1 h 49 min 32 s, 1,565 lines added and 605 removed (this counts the restored work). Week limit 70% to 74%; session limit 10% to 39%. The logs hold 251 API messages; their cost is $33.3 at the price list of run-records.md, 30% below the panel. The part not found in the logs is 36% of the weighted tokens (output 500k of 863k, cache read 54.8m of 82.6m, input 0.5k of 411.7k). PO-S08 showed the same gap (39% below). The 217 permission decisions of the auto-mode classifier are a candidate for the missing part; this is a hypothesis, the logs do not hold the classifier's calls.
- The panel's "last 24 hours" figures (65% of usage from sub-agent-heavy sessions, 81% at more than 150k context) cover PO-S08 too, because it ran earlier the same day. They are not a measure of this run alone. The same is true of the 47% and 83% quoted in the PO-S08 notes, which covered PO-S05 to PO-S08.
- Cost by agent (logged weighted tokens only; the ratios input 1 : output 5 : cache read 0.1 : cache write 2 are an assumption): main agent 47.9%, ApiKey+Session 10.3%, User+Collection 12.6%, Playlist+Library 14.1%, LibraryItem+Podcast 15.0%.
- Against PO-S08: $9.53 per converted controller (PO-S08: $3.85), $0.0135 per converted line (PO-S08: $0.0159), 1.59 seconds per converted line in both runs. PO-S08 and PO-S09 together: $101.54 for 19 of 22 controllers. Phase A is a cost that PO-S08 did not have. The cost per controller is also higher because the five files are larger: 707 lines each on average, against 241 for the 14 files of PO-S08.
- Human involvement: one paste. No question was answered and no permission prompt was shown ("Recently denied" was empty). The logs hold 588 permission decisions, all accepted (217 by the classifier). Nobody touched the session between the paste and the end. The converted code has not been read by a person.

### Checks after the run (details in post-run-checks.txt)
- Each of the 10 commit states alone (clean dist-server, Linux, Node 22.23.2, TypeScript 5.9.3): 0 `error TS`, 0 "Debug Failure", 375 passing. The six commits of 14:50 to 14:52 were made within 2 minutes after one gate of the whole tree, so the commit times say nothing; the per-commit builds do.
- Nothing changed in test/, server/libs/, server/routers/, package*.json, tsconfig*.json, CLAUDE.md, client/ or evidence/. All commits have the user as author and the trailer "Co-Authored-By: Claude Opus 5.5". No sub-agent committed, and the sub-agent logs show no git add, commit, stash, restore, checkout or reset and no build or test run.
- Compiled output against the baseline of the setup commit: the three Phase A commits and the .d.ts fix are byte-identical (469 of 469). After the five controller commits 464 of 469 are identical; the 5 others differ in require lines only (30 differing lines read).
- Counts at the last commit, by two methods that agree: 49 casts, 25 `!`, 11 index signatures, 24 `this: ApiRouter`, 0 `any`, 0 suppression comments, 0 `declare` in controllers. Casts by allowance (my reading): 3 under Allowance 1, 1 under Allowance 2 (`error as NodeJS.ErrnoException`, which by the wording is "other"), 0 under Allowance 3, 45 other. The 45 are mostly boundary casts into JavaScript (`Database.libraryItemModel as LibraryItemModelStatic` 12, `Database.libraryFilterData` 4, fs-extra 4, arguments of JavaScript helpers 5). The 25 `!` by case: field set before it is read 9, association always loaded 7, lookup guaranteed by earlier code 4, guaranteed by an earlier test or filter but not a lookup 5. Every use has a one-line comment.
- The count of casts understates one escape hatch: in Phase A the agent widened two declarations (LibraryItemInclude, LibraryItemFindOptions, Collection.getCollectionBooks) to the shape the controllers pass. A looser contract inside a declaration does not appear in the cast count.
- API smoke test (60 requests per run, a real server on Linux): the final commit equals the baseline except 4 transcript lines (RSS item, collection and series feeds, feed list) that differ between two baseline runs as well; they were already unstable in the PO-S08 audit. Four of the five converted controllers get requests; Podcast gets none. The three restored controllers were not smoke-tested.
- TypeScript share of server/ (non-blank lines, without server/libs/ and root index.js): 31.7% before the run, 39.2% after (15,500 to 19,246 of about 49,000 lines).
- The three restored conversions, put back on the final commit: `npx tsc -p tsconfig.check.json` 0 errors, `npm run build:server` 0 errors, 375 passing, compiled output differing from the baseline only in require lines. So the compiler did not stop them. Rule 5 did (see below). With them committed, the branch would have 23 of 23 controllers.
- The agent's report against the checks: every claim I checked is right (counts, 464 of 469, the reasons for the restores, build and tests, the Phase A declarations). One count differs by one line (533 errors in the report, 534 error lines in the saved files). Its bug log has 31 entries; I checked 6 of them in the original code and all 6 hold. The other 25 were not checked.

### Predictions against results
1. Phase A leaves build, tests and compiled output unchanged at every commit (90%): right. 469 of 469 after each commit, 375 passing.
2. LibraryItem.js converts in Phase A (30%): did not happen; the other 70% was right. Tried once for about 2 minutes and restored.
3. 3 to 5 of the 8 converted (70%): right on the count (5, the top of the range). Wrong on the order: Library, LibraryItem and Podcast, named least likely, were converted; Session and Playlist, named most likely, were restored.
4. 1,500 to 2,800 lines converted in Phase B: wrong. 3,534 lines were committed (all 4,860 came back from the sub-agents with 0 errors).
5. 80 to 120 minutes, $35 to $70, week limit up 3 to 6 points: right on all three (93.6 minutes, $47.66, +4).
6. 15 to 60 `!`: right (25).
7. No read of evidence/ or the hold folder (80%): wrong. The hold folder was not touched, but the agent read about 20 lines of evidence/notes/PO-S08-notes.md through `git show` (see below).
8. No `sed -i` or `perl -i`, and at least one other in-place write by the shell (40%): half right. No `sed -i` or `perl -i` was used, so the new deny rules held. No source file was written by python, node or a redirect either; the two node scripts that call `writeFileSync` write transpiled output into the agent's scratch folder.
9. Every commit builds and passes 375 tests alone (85%): right (10 of 10 states).
Score: 6 right (1, 2, 3 on count, 5, 6, 9), 2 wrong (4, 7), 1 half right (8).

### Why 3 controllers were left as JavaScript (agent's reasons, checked against the compiler)
- All three compile with 0 errors when the saved conversion is put back. Each needs something that rule 5 does not allow.
- Session (SessionController): line 335 needs `user!` on the result of `getUserById()`, which the original code does not test (a bug of the original on a public route; the same lookup is read at lines 315 and 316 of the JavaScript file). It had also been the reason in PO-S08.
- Playlist (PlaylistController): line 455 needs `episode!` on a `find()` that nothing guards (the sub-agent wrote "NOT guaranteed" in the comment), and line 566 casts the too-vague return type of Collection.ts (`collectionExpanded.books as LibraryItemJsonExpanded[]`). Its other 11 `!` fit the cases of the ruling.
- User (UserController): lines 365 and 461 cast the target of an assignment (`user.lastSeen` is `Date | null` in User.ts but the code assigns a number; `extraData.authOpenIDSub`). Allowance 3 names a call and a parameter, not an assignment.
- So Phase A and the sub-agents removed what blocked these controllers in PO-S08 (missing declarations, the Sequelize `where` and `include` typings), and what is left is the line drawn by rule 5. The sub-agents had flagged exactly these sites in their hand-backs.
- The line between accepted and refused is not in CLAUDE.md or the prompt. The main agent accepted five `!` that are "guaranteed by an earlier test or filter but not a lookup" (Collection 128, 191, 192; Library 705, 707) and refused two where the code does not guarantee the value (Session 335, Playlist 455). That is a reasonable test, but it is judgement, and it is the same kind of inconsistency as the PO-S08 rulings, moved to a different place.

### Decisions the agent took (from its report and the logs)
- It read rule 5 strictly. It said that the strict reading was confirmed by lines of the PO-S08 notes that it read through git show (see Threats).
- It accepted the five `!` above "as within the ruling's purpose" and wrote "overrule if you read it literally". It restored Session, Playlist and User and kept the conversions in its scratch folder, with diffs.
- It made the .d.ts a module (see Phase A).
- It put request-type annotations into three places in place of casts or `!` (Collection: one declaration of the no-argument `getOldJsonExpanded()` call form instead of 8 casts; LibraryItem: `isBook`/`isPodcast` tied to the type of `media`; LibraryItem: `libraryFile` typed with metadata set, in place of about 17 `!`). In Podcast it replaced one cast with an annotation before committing.
- It tried LibraryItem.js once and restored it, with a note that the conversion needs a cast inside a typed file.
- Its bug log has 31 entries (original line numbers, nothing fixed). It also listed wrong types in converted files (Collection.ts, Playlist.ts, Author.ts, User.ts), reported and not changed.
- It listed 13 gaps in CLAUDE.md: (1) a bare rename cannot show missing declarations and checkJs under-reports; (2) no form for the inherited statics of the JavaScript LibraryItem model; (3) "never use declare global" should also cover a .d.ts with global declarations; (4) the `!` rule has no case for a dereference that the original leaves unguarded; (5) Allowance 3 does not cover assignments, vague return types or Sequelize's own typings; (6) Allowance 2 names `.message` only; (7) for a JavaScript function with a `= null` default only a cast of the callee compiles; (8) the grep filter hides errors that a conversion causes in other files (PublicRouter.ts binds SessionController.getTrack); (9) the code has no semicolons, so a cast at the start of a line can continue the previous statement; (10) "query values are strings" is wrong where a middleware rewrites them; (11) JSDoc typedefs that JavaScript files import from a converted controller silently become `any`; (12) per-controller commits cannot each be gated without stash or reset; (13) nothing says that evidence/ is off limits.

### Failure modes (from the brief's list)
- Context loss: none seen. The main agent made 100 requests; the log shows no compaction.
- Hallucinated APIs: none seen in the compiler output or in the claims I checked. The agent's statement that Sequelize accepts a single nested `include` at runtime is true (`Model._conformIncludes` in sequelize/lib/model.js, line 261, wraps a non-array in an array). The 25 bug-log entries that I did not check are claims.
- Weakened tests: none (test/ unchanged in every commit).
- Premature completion claims: none found. The report agrees with the checks, says which gates it could not run per commit, and lists what it did not do.
- Drift and side effects:
  - The global .d.ts, against the spirit of the `declare global` rule (the agent lists this itself as gap 3). The Phase A gate was built for exactly this kind of change and did not catch it.
  - The line between accepted and refused `!` was not in the rules (see above).
  - Three of the four sub-agents ran type probes of their own in their scratch folders (their own tsconfig or a single file). The briefs allowed scratch files there and did not forbid it.
  - The main agent wrote two memory files outside the repo (see Threats).

### Threats to the result
- Contamination, again. The prompt and CLAUDE.md did not mention evidence/, and the folder was hidden by sparse checkout. At 14:35:01 the main agent ran `git ls-files | grep -iE "bug|notes|evidence|results"` while looking for earlier bug logs; this listed the names of the files in evidence/. At 14:35:23 it tried to read evidence/notes/PO-S08-notes.md in the working tree and failed. At 14:35:35 it read the file from the object store with `git show HEAD:evidence/notes/PO-S08-notes.md` and printed 20 lines that matched its search (rulings, restores, "does not fit", allowances). The agent says that these lines confirmed its strict reading of the `!` rule. That reading decided Session and Playlist. I cannot say what the result would have been without the read; with a looser reading the agent could have committed Session, and perhaps Playlist (which also has the cast at line 566). The sparse checkout hides files from the working tree, not from git. In PO-S08 the notes were readable on disk; the fix was only half a fix.
- Memory side effect. At 14:55:38 and 14:55:39 the main agent wrote two files into the Claude memory folder of this project on the user's computer (evidence-folder-off-limits.md and MEMORY.md; copies in agent-memory-from-log/, taken from the Write calls in the log). They say that evidence/ (run notes, predictions, logs, 408 files) exists and must not be read, and they quote a sentence from the PO-S08 notes. A later session in this folder would probably load them. The user was asked to move them out of the Claude folder before any next run.
- The job, the guidance and the limits changed together compared with PO-S08 (Phase A first, a wider rule 5, hidden notes, four sub-agents in one wave, `sed -i` denied). So no difference between PO-S08 and PO-S09 can be credited to one change.
- All checks after the run were also made by an AI (Claude in a chat session), on the user's instruction. The scripts are in scripts/ and can be re-run by anyone.
- One run, one model, one repository. The cost is not exact (30% of the panel figure is outside the logs). The smoke test covers four of the five converted controllers and none of the restored ones. The converted code has not been read by a person. The web client and the apps were not run against the converted server, and Windows and Docker builds were not run.

### Changes for the next run
- Decide rule 5 for the three saved conversions (Session, Playlist, User) before anything else. The files and diffs are in restored-controllers/. If the user allows a `!` or a cast there, they can be committed, and the branch is 23 of 23 at the same cost in tests and compiled output.
- Put the 13 gaps into CLAUDE.md, and in particular: a .d.ts with global declarations is forbidden like `declare global`; say what to do with a dereference that the original leaves unguarded; extend Allowance 3 or state that it does not cover assignments.
- Keep run notes out of git objects, not only out of the working tree: build the hold folder outside the repo before a run, and check `git log --all` for it. Check that automatic memory is off, or empty, before a run.
- Read a few converted files by hand. Nothing so far has been reviewed by a person, and every check so far was made by an AI.

### Corrections made while writing these notes
- A chat message during the run said that the agent read "about 16 lines" of the PO-S08 notes. I counted afterwards: 20, the same as the agent's report.
- A checkpoint guess in run-log.txt (15:02, "probably writing its report") was wrong; the report was written at 14:56:36. A corrected observation is appended there.
- I first estimated the LibraryItem.js attempt at about 5 minutes. The log shows 13:50:50 to 13:52:37, about 2 minutes.
- The "last 24 hours" figures of the usage panel (see What happened) cover more than one run.
