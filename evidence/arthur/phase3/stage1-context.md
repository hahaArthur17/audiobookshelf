# Stage 1 context, version 1

Read `MIGRATION.md` and the external Phase 3 plan before editing. This run migrates only `server/utils/`; target manifest has 46 JS files. Other server areas remain JavaScript except the 13 Phase 2 metadata files and shared type file. The branch starts at `5f37b6a7932ec53ce00d56f2888f6f7c057ae746`, not at Danny's branch.

Start environment on 2026-10-10 UTC: Node v24.11.0, npm 11.6.1, TypeScript 5.9.3. The worktree uses a symlink to the baseline repository's `node_modules`; no lockfile or compiler setting is changed. A new-worktree `npm run coverage` completed with exit 0 and 356 passing; raw output is `logs/stage0-start-coverage.log`. At start, the Codex account tool reported 8% of the current five-hour window used and 22% of the weekly window used; those percentages are account-wide snapshots, not tokens or costs.

The existing build uses `tsconfig.server.json` with `strict: true`, `allowJs: true`, CommonJS, ES2022, and `noEmitOnError`. The original tests must not be edited, deleted or skipped. Preserve direct `require(...)` export shapes and existing runtime behavior; static TypeScript types do not constitute runtime validation.

Stage 1 comprises varied risks: simple constants and functions, utility classes with initialization timing, parsers and generators, HTTP and filesystem helpers, Sequelize query builders, and 1,806-line DB migration logic. Batch size is chosen from dependency and risk, not line count alone. After Stage 1, stop and report; if quota becomes tight, stop at an accepted batch boundary and report partial progress.

Known prior Phase 2 exception candidate: Google Books filters a null result line when `volumeInfo` is missing. It must be accounted for in cumulative baseline comparison. Existing bugs elsewhere are not silently fixed in this language migration.
