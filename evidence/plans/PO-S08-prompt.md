Convert the 22 remaining JavaScript controllers in server/controllers/ to TypeScript, following CLAUDE.md, especially the new section "Controllers and Express". CacheController.ts is already converted and is a worked example. Models, finders, managers and the other converted folders also show the style. You are the main agent.

Check the time with the date command when you start. Then start three sub-agents in the same step, so they run at the same time. Each owns one set of controllers and touches nothing outside it:
- Sub-agent 1: ApiKey, Backup, CustomMetadataProvider, Email, FileSystem, Notification, RSSFeed, Stats, Tools.
- Sub-agent 2: Me, User, Session, Share.
- Sub-agent 3: Search, Series, Author, Collection, Playlist.
Rules for the sub-agents: they only edit files and use git mv, in their own set. If git mv fails with an index.lock error, they wait a few seconds and retry. They do not run npm run build:server or npm test, do not commit, and do not create or edit files in server/types/ (they report the declarations they need to you). They must not edit server/routers/ApiRouter.js or any converted file; a problem there goes into their report. They may run npx tsc -p tsconfig.check.json and filter its output to their own files. They start with the smallest files. If a file does not fit the rules in CLAUDE.md, they restore it completely (git mv back and git restore, so that no half-converted file stays) and report the reason and the compiler errors. Each sub-agent keeps a bug log of real bugs it notices (file, line, one sentence) and reports it. Bugs are not fixed.

Work in two waves. Give the sub-agents a clock time to stop: 60 minutes after your start for the first wave. When they have reported, integrate: run npm run build:server and npm test, fix cross-file errors or restore the offending file, and commit each set separately with the prefix [PO-S08], using explicit paths so that renames staged by other agents are not swept in. Then start two more sub-agents on the controllers that were not yet started, with a stop time 120 minutes after your start:
- Sub-agent 4: Library, Misc.
- Sub-agent 5: LibraryItem, Podcast.
They follow the same rules. Integrate their work in the same way. Finish within 150 minutes of your start. Only you edit server/types/, run the build and the tests, and commit.

Do not convert any other folder in this run. Do not ask me questions unless you are blocked.

When you stop, report for each set: the controllers converted, the controllers skipped with the reason, and the controllers not reached. Also report: how many ! assertions, index signatures and casts you added (split the casts into the three allowances of the controllers section and any other); how many this: ApiRouter parameters were added; the bug log of all sub-agents; whether CLAUDE.md worked as written and what it did not cover; and the final build and test result.
