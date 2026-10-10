# Batch 17 contract: shared utility entrypoint

Target: `server/utils/index.js` only. Main Agent owns implementation and acceptance. This contract is frozen before code changes.

- Preserve the direct CommonJS object, named property insertion order and export identity. Its many callers include finders, models, controllers and scanners. Preserve the require order, `xmlToJSON` callback/log behavior, `getId` random-call count, URL/UUID/ASIN validation, numeric/string/time/path operations and custom error classes with their field order/status.
- `copyValue` is an arrow export that uses lexical `this` from the CommonJS wrapper for recursive calls. Preserve that receiver behavior, array mapping callback semantics, null/empty coercions and errors on unusual objects. Title helpers read `global.ServerSettings.sortingPrefixes` at call time. Do not fix existing quirks while adding types.
- No original tests, callers, config or lockfile changes. Compare deterministic fixed samples against Phase 2 for all exported keys and representative valid/invalid cases, including nested values, query validation errors and XML. Review emitted JavaScript, run fresh strict build and all 356 original tests, and rerun earlier fixed samples before acceptance.
