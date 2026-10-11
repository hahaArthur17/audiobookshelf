Continue the JavaScript to TypeScript migration of server/, following CLAUDE.md. This run converts files in six sets. Every JavaScript file that is not in a set stays as it is. Session, Playlist and User controllers, server/models/LibraryItem.js, ApiRouter.js, Server.js, Database.js, server/migrations/, server/utils/queries/ and server/utils/migrations/ are not part of this run. You are the main agent.

Start: check the time with the date command. Run npm run build:server and npm test. Then copy dist-server into your scratchpad directory, in a folder named po-s10-baseline, so that you can compare compiled output later. Keep your probe results and any other scratch files in your scratchpad directory, not in the repository and not anywhere else.

The sets (paths under server/; every file is in the folder named at the start of its line):
- Set 1: managers/ PodcastManager, PlaybackSessionManager, RssFeedManager, NotificationManager, CronManager.
- Set 2: managers/ BackupManager, BinaryManager, CoverManager, MigrationManager, CoverSearchManager, CacheManager, AbMergeManager, AudioMetadataManager.
- Set 3: scanner/ BookScanner, LibraryScanner, AudioFileScanner.
- Set 4: scanner/ Scanner, PodcastScanner, LibraryItemScanData, LibraryItemScanner, LibraryScan, AbsMetadataFileScanner, MediaProbeData, NfoFileScanner, OpfFileScanner; objects/ Stream, PlaybackSession, PodcastEpisodeDownload, Backup; objects/files/ AudioFile, LibraryFile.
- Set 5: utils/ fileUtils, ffmpegHelpers, podcastUtils, index, prober, scandir, libraryHelpers, comicBookExtractors, areEquivalent, zipHelpers, rateLimiterFactory, profiler (not htmlEntities).
- Set 6: providers/ (all 7 files), utils/parsers/ (all 6 files), utils/generators/ (both files), auth/ TokenManager and OidcAuthStrategy.

Step 1, probe (15 minutes at most, no file edited, nothing renamed). Write a tsconfig into your scratchpad that extends tsconfig.check.json with checkJs set to true, and run it once over the files of the sets. Save the errors per file. Use the result in the briefs.

Step 2, sub-agents. Start six sub-agents in the same step, one per set, each with a written brief that you write (the files, the order, the probe errors for its files, the rules below, what to report). Their stop time is 70 minutes after your start.
Rules for the sub-agents:
- They only edit files and use git mv, in the files of their own set. If git mv fails with an index.lock error, they wait a few seconds and retry.
- They do not run npm run build:server or npm test, do not commit, add, stash, reset, checkout or clean, and do not edit server/models/, server/types/, server/routers/, any converted file or any file of another set. They report the declarations they need.
- They may run npx tsc -p tsconfig.check.json and filter its output to their own files. They keep scratch files in their own folder inside your scratchpad.
- They work in the order of their list, easiest first, and stop at the stop time. A file that does not fit the rules in CLAUDE.md, or that is not finished at the stop time, is restored completely (git mv back and git restore that file); they report the reason and the compiler errors.
- Each keeps a bug log of real bugs it notices (file, line, one sentence). Bugs are not fixed.
- Hand-back: per file converted or restored with the reason; the counts of !, index signatures and casts, with the three cases of ! and the allowances; the importers of any JSDoc typedef; files that routers bind; the declarations needed; the bug log.

Step 3, integrate, when all six have reported (at 80 minutes after your start at the latest; tell a sub-agent that is still running to restore its unfinished files and report). Add the declarations they asked for (rules in CLAUDE.md), run the build, the tests and the compiled-output comparison against your copy, and commit each set separately with the prefix [PO-S10] and explicit paths. If a set breaks the build, find the cause and restore the fewest files. Finish within 100 minutes of your start. Only you edit server/models/ and server/types/, run the build and the tests, and commit.

Do not convert or change anything else. Do not ask me questions unless you are blocked.

When you stop, report: per set, the files converted and the files restored with the reason; the lines converted; how many ! assertions (split into: field set before it is read, association always loaded, lookup guaranteed by earlier code), index signatures, casts (split by the three allowances and other); the bug log of all sub-agents; where the sets affected each other (a file that one set changed and that broke a file of another set); whether CLAUDE.md worked as written and what it did not cover; and the final build and test result.
