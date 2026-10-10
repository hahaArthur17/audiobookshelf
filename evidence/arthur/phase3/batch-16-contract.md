# Batch 16 contract: full personal-name parser

Target: `server/utils/parsers/parseFullName.js` only. Main Agent owns implementation and acceptance. This contract is frozen before code changes.

- Preserve the single direct CommonJS arrow function export and its five-argument call shape. `parseNameString` is its direct caller. Keep all lists, regexes, loops, coercions, `var` declarations, `fixCase`/`stopOnError`/`useLongLists` normalization, result key order and existing quirks. Do not fix parsing bugs during language migration.
- Preserve returning either the full `{ title, first, middle, last, nick, suffix, error }` object or the selected part, error-array messages, and **string throws** when `stopOnError` is enabled. Preserve behavior on nonstring, empty and oddly typed arguments as far as the original function accepts them.
- No edits to other source files, tests, config or lockfiles. Compare a fixed table of names, punctuation, nicknames, prefixes, conjunctions, multiple errors, list and case modes and selected-part calls against Phase 2; verify export shape, emitted JavaScript, fresh strict build and all 356 original tests before acceptance.
