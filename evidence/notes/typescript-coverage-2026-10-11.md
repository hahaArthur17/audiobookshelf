# TypeScript share of the server code (11 October 2026)

How it was counted: for each commit, every tracked `.ts`, `.d.ts` and `.js` file under `server/` was read with `git show`, and the non-blank lines were counted. `server/libs/` (vendored code) is excluded. `index.js` at the repository root is not counted. The script is `evidence/test-results/AUDIT-2026-10-11/scripts/coverage.py`.

| Commit | Point in time | TypeScript lines | JavaScript lines | Total | TypeScript share | `.ts` files | `.js` files |
|---|---|---|---|---|---|---|---|
| 9f4ff460 | start of the main branch (SP-S01 finders only) | 809 | 46,182 | 46,991 | 1.7% | 3 | 179 |
| 50d46876 | after PO-S07, before PO-S08 | 11,921 | 36,728 | 48,649 | 24.5% | 66 | 117 |
| d89acaf7 | after PO-S08 (last code commit) | 15,500 | 33,349 | 48,849 | 31.7% | 80 | 103 |

Notes:
- The `.ts` file counts include the declaration files in `server/types/`.
- The totals change between commits because converted files gain type annotations and `declare` lines, PO-S07 contained bug fixes, and `server/types/` gained declaration files (PO-S08 added 3 lines to `untypedModules.d.ts`).
- The count measures lines, not behaviour. A file that is renamed to `.ts` counts in full, even if most of its lines are unchanged JavaScript.
- PO-S06 is not included. It was done in a separate copy of the code.
