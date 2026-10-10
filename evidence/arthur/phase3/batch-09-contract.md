# Batch 09 contract: nested equivalence helper

Target: `server/utils/areEquivalent.js` only. Main Agent owns this independent pure helper.

- Keep the direct CommonJS function export, callable name, defaults (`numToString=false` and `stack=[]`), argument count and recursion behavior. Consumers import through `utils/index.js` and scanner/settings paths.
- Preserve comparisons for primitives, `NaN`, functions by `toString()`, valid/invalid dates, arrays, nested objects, object key ordering and number-to-string coercion. Preserve the current circular-reference error, including existing stack bookkeeping behavior on early returns; this migration does not fix baseline bugs.
- Only use erased TypeScript annotations/assertions around the original runtime statements. Do not edit callers, tests, config, locks or shared types. Compare fixed mixed, nested, date, function and circular samples against the Phase 2 build; run a fresh strict build and all original tests before acceptance.
