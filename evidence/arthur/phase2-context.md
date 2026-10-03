# Phase 2 context, version 2

- Independent base: `7d10b8fc4abe57a4e777a07b7b462ca32c33371c`, in `arthur/phase2-contract-agents`. No Phase 1 implementation is copied.
- Scope: exactly 13 first-party files: three `server/finders/*.js`, nine `server/providers/*.js`, and `server/controllers/SearchController.js`; each becomes `.ts`. Shared type and evidence files are additional.
- Existing JS callers stay unchanged. CommonJS exports must remain constructors for providers and singleton instances for Finders and SearchController.
- Node `v24.11.0`, npm `11.6.1`; linked baseline `node_modules` in isolated worktree, same lockfile. `tsconfig.server.json` is strict, allowJs, CommonJS.
- Main agent owns Finder and SearchController files, `server/types/MetadataContracts.ts`, docs, integration and commits. Sub-Agent A owns OpenLibrary, GoogleBooks, FantLab, AudiobookCovers, CustomProviderAdapter. Sub-Agent B owns Audible, Audnexus, iTunes, MusicBrainz. Agents may read, but not write, each other's files, config, tests, lockfile or shared types.
- Contract: `phase2-contract.md` and shared TS types, versioned through the run log. Build command `npm run build:server`; full suite `npm run coverage`. Version 2 records nullable upstream fields and one Google Books null-row handling change discovered during implementation.
- Baseline clean build and coverage: 356 tests passing; `logs/baseline-clean-coverage.log`.
- Unconfirmed: group-wide time box/acceptance criteria; no API credentials or stable remote fixtures are provided. External provider HTTP behavior can be checked only with mocks/offline samples unless stable network conditions are available.
