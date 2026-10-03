# Phase 1 context, version 1

- Base: `7d10b8fc4abe57a4e777a07b7b462ca32c33371c` on untouched `master`.
- Branch: `arthur/phase1-contract-agents`; ownership is limited to the three Finder files, `server/types/MetadataContracts.ts`, and `evidence/arthur/`.
- Target: migrate `BookFinder`, `AuthorFinder`, and `PodcastFinder` from JS to TS without changing existing JS callers or tests.
- Node `v24.11.0`, npm `11.6.1`; dependencies are the existing baseline `node_modules` linked into this isolated worktree. Lockfile is unchanged.
- Build: `npm run build:server` using `tsconfig.server.json` (`strict`, `allowJs`, CommonJS); tests: `npm run coverage` and `npx mocha dist-server/test/server/finders/BookFinder.test.js` after build.
- Baseline: clean `dist-server` build and coverage passed, 356 tests. Full output: `logs/baseline-clean-coverage.log`.
- Contract: `phase1-contract.md` and `server/types/MetadataContracts.ts`. Edit the contract only through the main agent; record changes and reason in the run log.
- Static ownership: Sub-Agent A owns `server/finders/BookFinder.ts` (and removal of its `.js`), Sub-Agent B owns `server/finders/AuthorFinder.ts` and `PodcastFinder.ts` (and removals). Both only read other files. Main agent owns types, docs, integration, validation, and commits.
- Known pitfalls: CommonJS exports are instances; BookFinder tests access nested classes through `bookFinder.constructor`; providers disagree on failure sentinels (`[]`, `null`, `{errorCode}`); `PodcastFinder` returns `null` for empty term; AuthorFinder image save resolves either `{path}` or `{error}`. Preserve observable behavior and report risky cases.
- Unknowns: live third-party response shape, timeouts and 429 timing, and group-agreed time limit/acceptance details have not been confirmed in this local task.
