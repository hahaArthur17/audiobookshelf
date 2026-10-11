# PO-S10: six sets of the remaining JavaScript, one main agent and six sub-agents in one wave

Date: 2026-10-11 (NZDT). Branch Aung-Min-Myat/po-s01 in D:\SEM-2\574\Project\audiobookshelf-po. Stage base: the commit "[PO-S10] setup: run layout" (the layout commit removes evidence/ from the branch; the setup commit [PO-S10] setup: CLAUDE.md is its parent).
Planned settings: Opus 5.5, max effort, auto mode (fresh session), plugins disabled, automatic memory off (settings.local.json autoMemoryEnabled false and the environment variable CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 set by Prep-S10). Cap: 100 minutes after the agent's start.
Who prepared the run: Claude (chat session), on the user's instruction to prepare everything except the Claude Code steps. The user checks /model, /plugin, /permissions and /usage, pastes the prompt and says when it starts and ends.

## Why this run
After PO-S09 the branch has 20 of 23 controllers in TypeScript and 39.2% of the non-blank lines of server/ (outside libs). The three controllers that remain (Session, Playlist, User) wait for a decision on rule 5 (the converted files are saved in evidence/test-results/PO-S09/restored-controllers/). On 2026-10-11 at 16:23 the user decided that the next run should keep the sub-agent workflow of PO-S08 and PO-S09 ("faster, clean, correct and effective") and cover more files. The checkJs probe at the PO-S09 head found 3,748 errors in 98 JavaScript files (29,815 non-blank lines), 12.6 errors per 100 lines. For comparison, the probe of the 8 controllers in PO-S09 found 10.8 per 100 lines.

## Starting state
- Branch tip: PO-S09 evidence commits (f7b475b2 is the last code commit; 23f23313 the last evidence commit), then the setup commit 12b7401f (CLAUDE.md only) and the layout commit (evidence/ removed from the branch).
- JavaScript left under server/ outside libs: 98 files, 29,815 non-blank lines (utils 11,520 incl. htmlEntities.js 2,234; managers 4,201; scanner 3,936; migrations 1,730; controllers 1,326; objects 1,021; auth 975; models/LibraryItem.js 971; providers 885; Database.js 866; ApiRouter.js 525; Server.js 493; Auth.js 451; SocketAuthority.js 405; Watcher.js 386; Logger.js 124).
- Build clean and 375 passing at the base (checked by Prep-S10).
- Permission rules: mode acceptEdits, 17 allow rules, 25 deny rules (the 20 of PO-S09 plus Bash(git show *evidence*), Bash(git log *evidence*), Bash(git grep *evidence*), Bash(git cat-file *) and Bash(git ls-tree *)) and the PowerShell deny rule from outside the file; autoMemoryEnabled false. Copy of the file before the run: settings.local.before.json (the PO-S09 file).

## What this run is
- One main agent and six sub-agents in one wave (no Phase A). The main agent probes the files of the sets once (checkJs on untouched files, no edit), writes six briefs, starts the sub-agents in the same step, waits for the hand-backs, then integrates: declarations, whole-tree build, tests, compiled-output comparison, one commit per set. Sub-agent stop time 70 minutes after the main agent's start; hand-backs by 80 minutes; cap 100 minutes.
- Sets (non-blank lines, probe errors): 1 managers PodcastManager, PlaybackSessionManager, RssFeedManager, NotificationManager, CronManager = 1,899 (180); 2 managers BackupManager, BinaryManager, CoverManager, MigrationManager, CoverSearchManager, CacheManager, AbMergeManager, AudioMetadataManager = 2,302 (368); 3 scanner BookScanner, LibraryScanner, AudioFileScanner = 2,129 (254); 4 scanner Scanner, PodcastScanner, LibraryItemScanData, LibraryItemScanner, LibraryScan, AbsMetadataFileScanner, MediaProbeData, NfoFileScanner, OpfFileScanner and objects Stream, PlaybackSession, PodcastEpisodeDownload, Backup, files/AudioFile, files/LibraryFile = 2,828 (359); 5 utils (12 files without htmlEntities) = 3,107 (412); 6 providers (7), utils/parsers (6), utils/generators (2), auth (2) = 2,778 (374). Total: 60 files, 15,043 lines attempted, 1,947 probe errors (12.9 per 100 lines).
- Not in the run: Session, Playlist and User controllers (rule 5 decision), models/LibraryItem.js (tried in PO-S07 and PO-S09), ApiRouter.js, Server.js, Database.js, Auth.js, SocketAuthority.js, Watcher.js, Logger.js (root files, last), utils/queries (3,357 lines, depend on the LibraryItem model), utils/migrations (1,904), server/migrations (1,730; out of scope in CLAUDE.md because MigrationManager loads them by name), utils/htmlEntities.js (a data table, out of scope in CLAUDE.md).

## What this run changes compared with PO-S09
1. No Phase A. The layer below (converted models) is mostly done, and the blockers in this run are in the neighbouring JavaScript files and not mainly in the models. The main agent adds the declarations that sub-agents report, at integration.
2. Six sub-agents instead of four, with 1,900 to 3,100 lines per set, and a time box (stop time) as the binding limit. The set order inside a set is "easiest first".
3. The files of different sets import each other (managers use utils, scanner uses managers and utils). A set that converts a file changes the types that the importers see while their own sub-agent works. This coupling did not exist in PO-S08 and PO-S09, where the controllers are leaves.
4. CLAUDE.md: (a) a `!` on a value that no earlier code guarantees is not allowed (the PO-S09 line, written down); (b) the three allowances of the controllers section apply to every file, and Allowance 2 also covers (error as NodeJS.ErrnoException).code; (c) a .d.ts with global declarations is forbidden like declare global; (d) pitfalls from the 13 gaps of the PO-S09 report (semicolon-free code, JSDoc typedef importers become any, middleware that rewrites req.query, the LibraryItem statics cast, router-bound methods, `= null` default parameters); (e) with several sub-agents, only the main agent builds the whole tree. These are my choices (Claude, the chat session) and not rulings by the user; the ruling on Session, Playlist and User stays open.
5. Hiding the notes: evidence/ is removed from the branch tip by a commit (a copy is parked in po-s10-hold\evidence-parked), five deny rules block git show, log, grep, cat-file and ls-tree on paths with "evidence" and on objects, and CLAUDE.md says that evidence/ is not part of the branch. In PO-S09 sparse checkout hid the folder from the working tree only, and the agent read 20 lines through git show. Older commits still hold the files; a determined agent could read them (git show <commit>:evidence/... is denied only when the command contains the word evidence).
6. Automatic memory is off (settings key and environment variable). In PO-S09 the main agent wrote two memory files outside the repository.
7. The branch name stays; the layout commit and its revert after the run show up in the history.

## Residual risks (stated before the run)
- The cost can reach about 60 to 80% of one session window (PO-S09: $47.66 used 29 points of a window; the week limit was at 74% before this run). If a limit is reached during the run, the run ends there and the result is recorded as cut by the limit.
- A whole-tree build contains the unfinished files of other sets, so the sub-agents cannot build, and cross-set errors show up late, at integration. The main agent may have to restore files that a sub-agent handed back as clean.
- The agents still know the PO-S01 to PO-S09 commits (git log), as in earlier runs.
- The result depends on one run on one repository. Nobody reads the converted code, and the checks after the run are made by an AI.

## Measurements planned
- From the session logs (Backup-S10): prompt time, end time, tokens by agent, permission decisions, any attempt to read evidence/ or the hold folders (and whether a deny rule stopped it), any use of sed -i, perl -i, python or node writes to source files, files written outside the repository and the scratchpad, sub-agent edits outside their set.
- After the run (by Claude, in a Linux clone, not by the agent's scripts): build and tests at every commit; changed files and protected paths; compiled output against a baseline built at the setup commit; counts of casts, !, index signatures by two methods; skip reasons against the saved compiler output; the API smoke test of the earlier audits; the TypeScript share; lines attempted and converted per set.
- Usage panel before and after (usage-start.txt, usage-end.txt).

## Predictions (written before the run; the numbers are guesses)
1. Lines converted (of the 15,043): 4,500 to 8,500 (30 to 57%): 65%. Fewer than 4,500: 25%. More than 8,500: 10%.
2. Every commit builds and passes 375 tests alone: 80%.
3. At least one sub-agent reaches the stop time with files unfinished and restores them: 50%.
4. Total time 85 to 110 minutes; cost between $85 and $150 on the panel; the week limit moves by 7 to 14 points; the run is not cut by a limit: 85%.
5. At integration the main agent restores at least one file that a sub-agent handed back as converted (a cross-set break): 45%.
6. The logs show no successful read of evidence/ or the hold folders: 85%.
7. No file is written outside the repository and the scratchpad (no memory files): 90%.
8. Non-null assertions added: 20 to 80: 60%.
9. The sub-agents' bug logs hold at least 40 entries together: 75%.
10. Sets 5 (utils) and 6 (providers, parsers, generators, auth) convert more than 60% of their lines each, and set 3 (BookScanner, LibraryScanner, AudioFileScanner) converts less than 40%: 55%.

## Replies policy
The user answers no question and no permission prompt during the run, as in PO-S05 to PO-S09. If the agent is blocked the run ends and the reason is recorded.

## Results (written after the run)
(to be filled in)
