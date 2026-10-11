# PO-S03 prompt (parallel stage)

Migrate the Audiobookshelf server from JavaScript to TypeScript in parallel, following CLAUDE.md. You are the main agent. Start three sub-agents in the same step, so they run at the same time. Each owns one set of folders and touches nothing outside it:
- Sub-agent 1: server/utils/ (not htmlEntities.js).
- Sub-agent 2: server/objects/, server/providers/ and server/scanner/. It converts EmailSettings, NotificationSettings and ServerSettings (server/objects/settings/) first.
- Sub-agent 3: server/managers/, server/auth/ and server/routers/.
Rules for the sub-agents: they only edit files and use git mv, in their own folders. If git mv fails with an index.lock error, they wait a few seconds and retry. They do not run npm run build:server or npm test, do not commit, and do not create or edit files in server/types/ (they report the module declarations they need to you). They may run npx tsc -p tsconfig.check.json, and they filter its output to their own folder. They convert leaf-first, and skip any file that does not fit the rules, with the reason.
Rules for you, the main agent: when the sub-agents finish, run npm run build:server and npm test. Fix cross-folder errors, or restore the offending file. Only you edit server/types/ and only you commit. Commit each folder separately with the prefix [PO-S03]. Do not ask me questions unless you are blocked.
Do not convert server/controllers/, server/models/ or the root files in this run. When you stop, report per folder: files converted, files skipped with the reason, the number of ! assertions, index signatures, casts and removed requires, and the final build and test result.
