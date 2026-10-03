# Phase 1 metadata contract, version 1

This contract describes the checked baseline. It is intentionally narrower than a claim that external JSON is validated. `server/types/MetadataContracts.ts` expresses common *internal* fields, with optional fields for provider omissions.

## Boundary map

| Boundary | Input and output | Evidence |
| --- | --- | --- |
| JS callers -> BookFinder | `require('../finders/BookFinder')` yields one instance. `search(libraryItem, provider, title, author, isbn?, asin?, options?)` resolves book array; empty title gives `[]`. `findCovers` resolves deduplicated string array; `findChapters` forwards Audnexus result, including `null`. | `server/finders/BookFinder.js:374-460,578-646`; `server/controllers/SearchController.js:85-127,186-212`; `server/scanner/Scanner.js:55`; `test/server/finders/BookFinder.test.js` |
| Provider -> BookFinder | Google/FantLab/iTunes/Covers/Audible generally resolve arrays; OpenLibrary can resolve `{errorCode}`; custom provider throws for missing provider or malformed response and Finder catches to `[]`. The same book may omit author/cover/duration. | `server/providers/OpenLibrary.js:109-119`; `GoogleBooks.js:50-75`; `CustomProviderAdapter.js:21-83`; `server/finders/BookFinder.js:109-214` |
| JS callers -> AuthorFinder | CommonJS instance; `findAuthorByASIN` may return `null` immediately, otherwise a promise of author or `null`; `findAuthorByName` resolves author or `null`; `saveAuthorImage` resolves `{path}` or `{error}`. | `server/finders/AuthorFinder.js:13-68`; `server/controllers/AuthorController.js:282,341-360` |
| JS callers -> PodcastFinder | CommonJS instance; `search(term, options?)` and `findCovers(term)` return `null` for empty term, otherwise promises of podcast or cover arrays. iTunes request errors resolve `[]`. | `server/finders/PodcastFinder.js:15-35`; `server/providers/iTunes.js:42-70,164-168`; `server/controllers/SearchController.js:113-151` |

## Preserved behavior

- Keep the CommonJS `module.exports = new ...()` runtime shape. Existing `.js` imports in controllers, scanner, managers, and tests must load the compiled module with no `.default` wrapper.
- Preserve provider names, search order, fuzzy search limits, matching and confidence calculations, sanitization, and cover deduplication. Test access to `BookFinder.TitleCandidates` and `AuthorCandidates` through the instance constructor must still work.
- Preserve asynchronous and nullable return behavior. A missing author/podcast term is `null`, not `[]`. `saveAuthorImage` catches download failures into `{error}`.
- Preserve current error paths. OpenLibrary's `{errorCode}` is checked in its Finder wrapper. Other malformed remote responses are not uniformly checked; document any newly observed crash instead of silently claiming full validation.
- No changes to tests, configuration, lockfile, or JS callers in Phase 1.

## Verification

1. Clean output directory, then `npm run build:server` and `npm run coverage`.
2. Check `require('./dist-server/server/finders/BookFinder')`, AuthorFinder, and PodcastFinder expose instance methods directly, plus BookFinder nested test classes.
3. Run existing BookFinder tests and fixed, mocked behavior samples for empty search and null paths; compare output with baseline.
4. Search diff for explicit `any`, `@ts-ignore`, double assertions, removed tests, and changed JS callers. Record unresolved external response risks.
