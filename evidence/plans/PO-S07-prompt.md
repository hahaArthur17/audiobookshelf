Convert the 8 Sequelize models that were skipped in PO-S05 from JavaScript to TypeScript, in this order: Author, FeedEpisode, Collection, PlaybackSession, Playlist, Feed, User, LibraryItem (all in server/models/). Follow CLAUDE.md, especially the section "Sequelize models". The 17 models already converted in server/models/ are the worked examples. Book.ts, Library.ts and MediaItemShare.ts show how to declare the model registry (declare static readonly sequelize) and the uppercaseFirst helper. You are the only agent. Do not start sub-agents.
Check the time with the date command when you start. Finish within 150 minutes of your start.

For this run only, these five points replace the matching parts of CLAUDE.md:
1. Rule 1 allows two kinds of change to the emitted code, and no other kind.
   (a) A bug fix. The reported bugs are listed below. They are claims from an earlier run, not facts. For each bug in a file that you are converting: write a test that shows the bug, run it, and keep the output. The test must fail on the current code. Then fix the bug, run the tests again, and keep the output. The test must pass. If you cannot make the test fail, or if the intended behaviour is not clear from the code, do not change the code and report the bug as "not confirmed" with your reasons. Do not look for other bugs. If you meet one, write it in the report and do not fix it.
   (b) A change that keeps the behaviour the same and that the types need. Examples: .getTime() on a Date subtraction, a nested include given as an array, leaving out where: null, removing an option that Sequelize ignores, a plain import './X' that keeps a require which TypeScript would drop because it is used only in JSDoc. In the commit message, write what you changed and how you know that the behaviour is the same (a test, or the comparison of the compiled output).
2. Rule 5 is unchanged and is read strictly. A cast is allowed only where a module has no types (an untyped module). A cast on a value or an argument that a typed module such as Sequelize defines is not allowed. A ! is allowed only where a field starts as null and is set before it is read. The banned tokens of rule 4 stay banned.
3. Rule 6 is relaxed for test/ only: create new test files in test/server/bugfix/. Do not edit or delete any existing file in test/. Follow the style of the existing tests. If you cannot create files there, stop and report. Do not find another way.
4. The check "356 passing" becomes: npm test shows no failing test, and 356 plus the number of tests you have added. Make sure that your new tests really run (the passing number must go up). Write the passing number in each commit message.
5. You may add declarations in server/types/ and say so in the report. You may change an already converted .ts file only when a skipped model cannot be converted without it (and say so in the report), or for the last two bugs below.

Work on one model at a time, in the order above. For each model:
 Step 1. For each reported bug in that file: test first, then fix, as in point 1(a). Save the output of the failing run and of the passing run in evidence/test-results/PO-S07/ as <Model>-<bug>-before.txt and <Model>-<bug>-after.txt. Run npm run build:server and npm test. Commit the test, the fix and the two output files together, with the message "[PO-S07] <Model>: fix <bug> (test added)".
 Step 2. Convert the file (git mv, then the types). Run npm run build:server and npm test. Commit the conversion alone, with the message "[PO-S07] <Model>: migrate to TypeScript". The conversion commit may contain only type changes and the edits of point 1(b).
 If a model cannot be converted within these rules, restore it completely (git mv back and git restore) and go on to the next one. Keep its bug-fix commits. Never leave a failing build or a half-converted file. Use explicit paths when you commit. Do not push.

Reported bugs (line numbers are in the current .js files):
- Collection.js:99: this.books = books is inside a static method, so the permission-filtered list lands on the class. toOldJSONExpanded() still reads the unfiltered c.books, so a restricted user sees every book of a collection once one book is accessible.
- Author.js:98: getAllLibraryItemsForAuthor throws for an unknown author id (a findByPk result is used with no null check, lines 98-99).
- Feed.js:511 (also 489 and 502): a getExpandedById() result is used with no null check.
- Feed.js:305: throws when a series has no book with audio tracks.
- Playlist.js:332: checkHasMediaItem without an episodeId throws for a podcast-episode item.
- Playlist.js:190: update({ order }) is not awaited.
- User.js:678: libraryItem.media.metadata?.explicit reads the old model shape, so that half of the explicit-content check is always undefined. Do not guess the intended behaviour; if it is not clear, report "not confirmed".
- PlaybackSession.js (createFromOld): silent: true is passed to upsert(), which ignores it. This is not a bug fix. Removing the option is an edit of point 1(b).

When all 8 models are done (converted or skipped), fix these two reported bugs in already converted files in the same way (test first, one commit each, same message form): Library.ts (this.max('displayOrder') || 0 applies || 0 to a Promise, so an empty table gives null) and Book.ts (bookSeries.sequence is read without the ?. guard used elsewhere, around lines 517-519 and 552 of the old Book.js). The other items of the earlier report (numbers or strings assigned to DATE fields, JSDoc mismatches, ApiKey permissions copying) are not bugs for this run. Do not change them.

Do not convert any other folder. Do not ask me questions unless you are blocked.
When you stop, report for each model: converted or skipped (with the compiler errors), the bugs confirmed (test name and commit) and not confirmed (with reasons), every edit of point 1(b), how many ! assertions, index signatures, casts and declare sequelize lines you added, and the final build and test result. Say whether CLAUDE.md worked as written and what it did not cover.
