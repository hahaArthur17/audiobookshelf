# Batch 10 contract: name string parser

Target: `server/utils/parsers/parseNameString.js` only. Parser Sub-Agent owns this file in its isolated worktree.

- Preserve named CommonJS arrow exports `parse` and `nameToLastFirst`, their callable names/prototype behavior, the original `parseFullName` dependency, and their return shapes. Empty input returns `null`; single and multiple names preserve first/last inversion, comma/semicolon/ampersand/`and` splitting, CJK pass-through, duplicate removal and odd-name handling.
- Preserve the existing mutating `shift` behavior and fallback values on missing name parts. Do not rewrite the imported `parseFullName.js` library or its algorithms, and do not modify scanners, models, callers, tests, config, locks or shared types.
- Use erased TypeScript types and retain executable statement order. Run a fresh strict build and unchanged original tests. Compare representative fixed name strings, invalid input and both exports against the Phase 2 build; report uncovered name formats. Commit only the JS→TS rename.
