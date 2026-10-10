# Batch 06 contract: series and library item query helpers

Targets: `server/utils/queries/seriesFilters.js` and `server/utils/queries/libraryItemFilters.js`. Query Sub-Agent owns these files only.

- Both export named-property CommonJS objects. `seriesFilters.getFilteredSeries` invokes `this.decode`; preserve receiver-sensitive method calls, encoded-filter decoding, user permissions, sorting, pagination and returned series/count shape.
- `libraryItemFilters` exposes tag, genre, narrator, search and largest-item helpers. Preserve Sequelize options, ordering, nullable fields, permission filtering, limit semantics and returned model-versus-JSON shapes.
- These modules depend on live Database/model interfaces and are not fully covered by direct tests. Use disposable mocks/SQLite fixtures for representative empty, populated, filter and permission paths; compare baseline and candidate outputs. Record untested branches.
- Do not edit controllers, models, shared types, config, locks or tests. Report public contract conflicts to the main Agent.
