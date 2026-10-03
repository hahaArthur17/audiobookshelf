# Phase 2 cross-module contract, version 2

The baseline code is the authority for observable behavior. Type declarations in `server/types/MetadataContracts.ts` describe the shared metadata and optional fields. Third-party response objects must be treated as potentially incomplete; no claim of runtime validation is implied by a TypeScript type. Version 2 adds OpenLibrary fields (`edition`, `key`, `first_publish_date`), iTunes `artistId`, nullable author/podcast fields and nullable book `id`/`title` after provider review.

## Dependency and response flow

`Provider constructor` -> `Finder singleton` -> `SearchController singleton` -> `res.json(...)`. JS callers load each via `require` directly. Provider classes are instantiated by Finders; controller routes are bound in `server/routers/ApiRouter.js:286-291`.

| Boundary | Current contract | Evidence |
| --- | --- | --- |
| Book providers | GoogleBooks, FantLab, iTunes audiobook, AudiobookCovers and CustomProviderAdapter normally resolve book arrays. OpenLibrary can return `{errorCode}`. Audible resolves array after remote lookups. Optional metadata differs by source. MusicBrainz is in scope but used elsewhere, not in this Finder path. | `server/providers/*.js`; `server/finders/BookFinder.js:109-214,578-605` |
| BookFinder | Exports a singleton. `search` returns `[]` for empty title except custom provider path; fuzzy search and provider choice are ordered. `runSearch` sanitizes descriptions; `findCovers` flattens and deduplicates cover fields. `findChapters` forwards Audnexus value. | `server/finders/BookFinder.js:374-646`; `test/server/finders/BookFinder.test.js` |
| Author and podcast | Audnexus author methods resolve author or `null`; iTunes request failure resolves `[]`. Finder empty inputs return `null`, while `saveAuthorImage` resolves `{path}` or `{error}`. | `server/providers/Audnexus.js:46-167`; `server/providers/iTunes.js:42-70,164-168`; `server/finders/AuthorFinder.js`; `PodcastFinder.js` |
| SearchController | `/books` returns BookFinder array; `/covers` returns `{results}`; `/podcast` returns podcast array; `/authors` returns author or null; `/chapters` returns chapters, or 200 JSON error for invalid/not found ASIN path. Validation and missing library item errors use error status; other caught errors use 500. `/providers` returns configured option arrays. | `server/controllers/SearchController.js:85-238`; `server/routers/ApiRouter.js:286-291` |

## Invariants and known risk

- Preserve CommonJS runtime shapes: provider `module.exports = Class`, Finder/Controller `module.exports = new Class`. Avoid `.default` wrappers. Existing JS callers and tests cannot change in this phase.
- Preserve current request query defaults, routes, status codes, JSON keys, provider order, timeout values, error handling, fuzzy matching and sanitization. Do not convert `null` returns to `[]` just to simplify types.
- Some remote failures expose existing inconsistencies: OpenLibrary uses `{errorCode}`, GoogleBooks `cleanResult` may yield `null`, and Audible's absent `products` path may yield `null` before `.filter`. Phase 2 deliberately filters Google Books null rows in `BookFinder.getGoogleBooksResults`, converting a later crash to a valid-row result. This is the only difference in the 17 offline behavior samples, and is recorded separately in the run log. The Audible path remains a known risk.
- CustomProviderAdapter throws when no configured provider or malformed response, then BookFinder catches it. Other provider HTTP errors mostly return `[]` or `null`. Audnexus retries HTTP 429 with `retry-after` and may eventually return `null`; no network assertion is inferred from passing local tests.
- `server/types/MetadataContracts.ts` is main-agent owned. No explicit `any`, `@ts-ignore`, double assertions, test deletions or skipped tests to hide migration issues.
- Baseline `BookFinder.findCovers` passes its options object as the fifth `search` argument (the ISBN position). This pre-existing call mismatch is retained for migration comparability; the typed provider contract describes ISBN as a string. It needs a separate correction and test if options are meant to reach `search`.

## Verification

Clean `dist-server` build with strict `tsc`; full coverage; compiled `require(...)` constructor/instance shape; fixed mocked samples for empty/missing input, provider errors, controller status and JSON envelopes. Record any sample that cannot be exercised and all unverified remote behavior.
