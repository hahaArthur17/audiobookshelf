# Batch 03 contract: basic query utilities

Targets: `server/utils/queries/authorFilters.js`, `userStats.js`, `adminStats.js`. Query Sub-Agent owns these files only.

- The three modules export named-property CommonJS objects, consumed by controllers. Preserve method names, receiver use, pagination/order, returned JSON shapes, null/zero fallbacks and thrown/rejected errors.
- `authorFilters.search` maps author model rows through `toOldJSONExpanded`. `adminStats` and `userStats` aggregate Sequelize results, session data, filesystem checks and month bins. Keep existing array order, rounding and cover limits.
- Do not modify models, controllers, shared types, `tsconfig` or tests to satisfy the migration. Report any public type gap to the main agent.
- Build and existing tests are required; additionally compare fixed, disposable SQLite-backed or mocked query inputs where feasible. Mark unexercised branches, especially permission and empty-state behavior.
