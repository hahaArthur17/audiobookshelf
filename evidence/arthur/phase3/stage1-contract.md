# Stage 1 global contract, version 2

The baseline code and direct consumers define the behavior. Before each batch, add a versioned local contract for the specific file set and save code/test evidence. Do not infer correctness solely from a type annotation.

## Global invariants

- Every target keeps the same module path after JS→TS compilation and the same direct CommonJS `require(...)` shape: callable function, class constructor, singleton, or named-property object as originally exposed. Avoid generated `.default` wrappers.
- Preserve argument order, defaults, coercion, nullable values, array order, thrown errors, resolved/rejected Promises, sync versus async return, timers, filesystem and database mutations, HTTP responses, event emissions, and startup side effects.
- When an external package or JS caller has incomplete types, type the actual observed boundary. Do not invent narrower runtime input assumptions or alter guard order to satisfy strict mode.
- Keep `tsconfig.server.json`, package/lock files, original tests and out-of-scope source files unchanged unless a separately recorded unavoidable compatibility change is justified and reviewed.
- Main agent owns public/shared type declarations and contract revisions. A Sub-Agent reports gaps rather than editing shared contracts.

## Stage 1 examples already observed

- `requestUtils.js` exports three named functions; `getRequestOrigin` computes protocol and host from Express-style request getters. Original JS callers consume via destructuring.
- `longTimeout.js` exports a constructor; `ShareManager` consumes the class directly. Timer scheduling and callback timing are observable.
- `globals.js` exports an object of supported extension arrays directly, consumed by scanner, objects and managers.
- `areEquivalent.js` exports a callable comparator; its current circular-reference behavior, including error and stack handling, belongs to the baseline contract even if unusual.
- `stringifySequelizeQuery.js` exports a callable function; symbol key conversion and class-name serialization are observable.

## Verification

Each accepted batch requires a fresh `dist-server` build with zero strict type errors, `npm run coverage` with 356 passing and no test edits, a source and emitted-JS review, and fixed-input behavior samples in the same environment as the prior accepted commit and the baseline. Record exceptions or unverified paths explicitly.

## Read-only Stage 1 investigation

- Parsers and generators include nullable/variable result shapes, input mutation (OPF JSON), malformed XML/JSON fallback, CommonJS receiver use, and filesystem/archive side effects. `parseFullName` may throw a primitive string; do not normalize the error while migrating. See batch contracts for selected files.
- Query utilities export plain objects, but some methods require their `this` receiver. Book/podcast query modules hold module-scope count caches and register model hooks for invalidation; do not alter cache key timing, hooks, order, permission logic, or require cycles. Query-specific tests are sparse.
- Legacy migration modules are high risk: `dbMigration.js` has ordered writes and module globals, `oldDbFiles.js` extracts archives as a side effect and skips malformed JSONL rows, and `absMetadataMigration.js` can write a file before a later DB save fails. They need disposable database/filesystem fixtures.
- File, scanner, zip, probe and FFmpeg helpers have mixed failure returns and external side effects. `fileUtils` uses lexical CommonJS `this` in several exported arrow functions; changing them to ordinary functions could change behavior.

These facts came from read-only subagent reports and source inspection. They are hypotheses to verify against actual baseline behavior for each selected batch, not blanket claims of test coverage.
