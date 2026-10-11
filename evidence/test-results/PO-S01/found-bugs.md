# PO-S01 found bugs

Bugs noticed while adding types. None of them was fixed (type-only migration); the types describe the code as it behaves today.

| # | File | Line (in the .ts) | Bug | Effect |
|---|------|-------------------|-----|--------|
| 1 | server/utils/parsers/parseFullName.ts | `fixCase = fixCase !== 'undefined' && ...` | Compares `fixCase` with the string `'undefined'` instead of checking `typeof fixCase !== 'undefined'`. | Harmless for real values (the `=== 0 \|\| === 1` part decides), but TypeScript only accepts the comparison if the parameter type includes the literal `'undefined'`, so the type `FixCaseOption` has to include it. |
| 2 | server/utils/parsers/parseFullName.ts | `!suffixList.indexOf(namePartWords[j].toLowerCase())` | `!indexOf(...)` is true only when the word is the first list entry (index 0), not when it is in the list. | The "convert suffix abbreviations to UPPER CASE" branch almost never runs. Upstream library bug. |
| 3 | server/utils/parsers/parseFullName.ts | `namePartLabels[j] === 'suffix'` | Uses the word index `j` to read the label array, which is indexed by `i`. | Same branch as #2: the suffix check reads the wrong label. Upstream library bug. |
