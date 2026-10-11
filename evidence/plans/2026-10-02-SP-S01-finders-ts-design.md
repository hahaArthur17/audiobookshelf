# SP-S01: Migrate `server/finders/` to TypeScript (design spec)

- **Date:** 2026-10-02
- **Branch:** `Aung-Min-Myat/phase1` (no worktree, no new branch)
- **Prompt:** `evidence/plans/SP-S01-prompt.md`
- **Status:** written after chat approval of design sections 1–3; awaiting review of this document
- **Next step after approval:** implementation plan at `evidence/plans/2026-10-02-SP-S01-finders-ts-plan.md`

Unless stated otherwise, line numbers refer to the **current `.js` files** at commit `5968b516`. The final report maps them to `.ts` lines.

---

## 1. Goal and Done check

Rename `server/finders/AuthorFinder.js` (67 lines), `BookFinder.js` (702) and `PodcastFinder.js` (35) to `.ts` and give them meaningful types. This is a type-only migration. Behaviour, exports and error handling do not change.

**Done** means both of the following:

1. `npm run build:server` exits 0 with no errors.
2. `npm test` reports **356 passing, 0 failing** (baseline: `evidence/baseline/npm-test.txt`).

## 2. Constraints

From the prompt:

- Rename with `git mv`.
- None of `any`, `as any`, `@ts-ignore`, `@ts-nocheck` or `@ts-expect-error`.
- Use real interfaces for result shapes. External data is typed `unknown`.
- Do not edit tests, `tsconfig.server.json`, `package.json` or `package-lock.json`. Install nothing.
- Do not edit caller files.
- No refactoring, no renaming, no behaviour change. Bugs are reported and left in place.
- Commit after each task with the `[SP-S01] ` prefix. Never push, merge or open a PR. Finish with "keep branch".

From the design review:

- `server/providers/` is not edited in this phase.
- `as` casts appear **only at the provider boundary**, each a single step (never `as unknown as`), and each one is listed in §6.1.
- Outside the boundary, the only code changes allowed are the `Number()` rewrites in §6.2 and the `isNaN` declarations in §6.3. There are no other rewrites.
- Existing JSDoc comments are left unchanged. The ones now out of date are listed in §8 for a follow-up report.
- Design and plan documents go under `evidence/plans/`.

## 3. Decisions log

| # | Question | Decision |
|---|---|---|
| Q1 | How should the finders handle provider values whose JSDoc is too loose (`Object[]`) or too strict (`string` where callers pass `null`)? | **Type-only boundary.** Real interfaces in the finder files, plus single-step `as` casts at provider calls only. No runtime guards. `server/providers/` is not edited. |
| Q2 | What about code TypeScript rejects outside the boundary (`isNaN(number \| undefined)`, optional score fields compared with `>` and `-`, boolean subtraction)? | **No new assertions.** A module-local `declare function isNaN` with an explanatory comment, plus `Number()` wraps that behave identically. Every one is listed with file, line and reason. |
| S1 | Module structure | Approved. Outdated JSDoc stays and is listed (§8). Destructured requires become two lines (§4). |
| S2 | Types | Approved. `BookSearchResult` covers **only the fields BookFinder reads or writes**. |
| S2b | Comment on the widened `isbn` type | Approved. One line (K1, §6.4), included in the expected compiled-output differences (§7). |
| S3 | Inventory and verification | Approved. Every cast, rewrite and declaration is listed (§6). |
| R1 | Is `OpenLibrary.js:96` (`errorCode: 404`) reachable from the finders? | **No.** It is inside `OpenLibrary.search(query)` (lines 89–101). BookFinder calls only `isbnLookup()` (BookFinder.js:32) and `searchTitle()` (BookFinder.js:110). Nothing in `server/` or `test/` calls `OpenLibrary#search`, and BookFinder.js:17 is the only `new OpenLibrary()`. So it is **not** cited in the `ProviderErrorResult` comment. |
| R2 | Count implicit `any` coming from untyped JS | Added to verification (§10, step V7): emit declarations for the three files into the scratchpad and list every `any`. |

## 4. Module structure (all three files)

| Today (JS) | After (TS) | Compiled JS |
|---|---|---|
| `const X = require('…')` | `import X = require('…')` | `const X = require("…");` (only the quote style changes, E1) |
| `const { a, b } = require('…')` | `import mod = require('…')` + `const { a, b } = mod` | 2 statements instead of 1 (E2) |
| `module.exports = new BookFinder()` | `export = new BookFinder()` | `module.exports = new BookFinder();`, identical |
| properties assigned in the constructor | `declare prop: Type` added to the class body; constructor unchanged | **no field is emitted** |

- **Why two lines and not `import { … } from`:** the ES form compiles to `(0, index_1.levenshteinDistance)(…)`, which looks the function up on the module object at every call. A sinon stub on `utils/index` or `utils/fileUtils` would then start affecting the finders. The two-line form keeps today's behaviour, where the functions are captured once at load time. This applies to `utils/index` in BookFinder (new local name `utils`) and `utils/fileUtils` in AuthorFinder (new local name `fileUtils`).
- **`declare` fields:** `BookFinder` (`openLibrary`, `googleBooks`, `audible`, `iTunesApi`, `audnexus`, `fantLab`, `audiobookCovers`, `customProviderAdapter`, `providers`, `verbose`), `AuthorFinder` (`audnexus`), `PodcastFinder` (`iTunesApi`), and inside the nested class expressions `TitleCandidates` (`candidates`, `cleanAuthor`, `priorities`, `positions`, `currentPosition`) and `AuthorCandidates` (`audnexus`, `candidates`, `cleanAuthor`).
- **`declare global { var MetadataPath: string }`** goes in `AuthorFinder.ts` (§6.5).
- **`declare function isNaN(value: unknown): boolean`** goes in `BookFinder.ts` and `AuthorFinder.ts` (§6.3).
- **Interfaces stay inside each file and are not exported**, because `export =` cannot coexist with `export interface`, and no TS code consumes them yet.
- **Provider JSDoc typedefs are reused through import types:**
  - `type AuthorSearchObj = import('../providers/Audnexus').AuthorSearchObj`
  - `type iTunesPodcastSearchResult = import('../providers/iTunes').iTunesPodcastSearchResult`

  Both compile away.
- **Result casts are written without parentheses:** `await provider.call(…) as T`, not `(await provider.call(…)) as T`. Probe P-4 showed the parenthesised form compiles to `(await …)`, adding a spurious difference. `await` binds tighter than `as`, so the cast still applies to the awaited value.

## 5. Types

### 5.1 Interfaces

```ts
// BookFinder.ts
/** Fields of a provider book result that BookFinder reads or writes; other provider fields pass through unmodelled */
interface BookSearchResult {
  title?: string
  subtitle?: string | null
  author?: string | null
  description?: string | null
  descriptionPlain?: string // set by runSearch()
  cover?: string | null
  covers?: string[]
  duration?: number
  matchConfidence?: number // set by search() for audible providers
}

/** OpenLibrary hit (OpenLibrary.cleanSearchDoc) plus the scoring fields filterSearchResults() attaches */
interface OpenLibraryBookResult extends BookSearchResult {
  title: string
  author: string | null
  errorCode?: 500 // getWorksData() error object spread into the hit (OpenLibrary.js:46, :85)
  errorMsg?: string
  cleanedTitle?: string
  cleanedAuthor?: string
  titleDistance?: number
  authorDistance?: number
  totalPossibleDistance?: number
  totalDistance?: number
  includesTitle?: string
  includesAuthor?: string
}

/** Returned instead of a result array when OpenLibrary's HTTP request fails (OpenLibrary.js:35, :114) */
interface ProviderErrorResult {
  errorCode: 404
  length?: undefined // read by the `books.length || 0` debug line before the errorCode check
}

type BookProviderResponse<T extends BookSearchResult> = (T[] & { errorCode?: undefined }) | ProviderErrorResult

/** Raw OpenLibrary ISBN JSON (external data, values unknown) or the 404 error object */
type OpenLibraryIsbnLookupResult = Record<string, unknown> | ProviderErrorResult

interface BookSearchOptions {
  titleDistance?: number
  authorDistance?: number
  maxFuzzySearches?: number
}

/** The part of a LibraryItem that search() reads; tests pass plain objects like {} and { media: {} } */
interface MatchLibraryItem {
  media?: { duration?: number | null } | null
}

type AuthorASINLookup = Pick<Audnexus, 'authorASINsRequest'> // tests pass a stub object
type TitleCandidatesInstance = InstanceType<typeof BookFinder.TitleCandidates>
type AuthorCandidatesInstance = InstanceType<typeof BookFinder.AuthorCandidates>

// AuthorFinder.ts
type AuthorSearchObj = import('../providers/Audnexus').AuthorSearchObj
interface AuthorSearchOptions {
  maxLevenshtein?: number
}
interface SavedAuthorImage {
  path: string
}
interface AuthorImageError {
  error: string
}

// PodcastFinder.ts
type iTunesPodcastSearchResult = import('../providers/iTunes').iTunesPodcastSearchResult
interface PodcastSearchOptions {
  country?: string
}
```

The 404 error type uses the literal `errorCode: 404` so that the existing `if (books.errorCode) return []` narrows `books` to the array type with no cast (probe P-2). Probe P-1 showed that `Object[]` from provider JSDoc is assignable to arrays of all-optional interfaces without a cast, because TypeScript exempts the global `Object` type from its weak-type check. That is why casts are needed only at the 8 provider calls in §6.1 (13 casts in total): calls whose result is checked for `errorCode`, and calls whose arguments may be `null`/`undefined` while the provider JSDoc says `string`.

### 5.2 Signatures

A parameter is nullable only where a real caller or test passes `null` or `undefined`.

| Method | TS signature | Evidence |
|---|---|---|
| `BookFinder.findByISBN` | `(isbn: string): Promise<OpenLibraryIsbnLookupResult>` | no callers |
| `BookFinder.filterSearchResults` | `(books: OpenLibraryBookResult[], title: string, author: string \| null \| undefined, maxTitleDistance: number, maxAuthorDistance: number): OpenLibraryBookResult[]` | called from `getOpenLibResults` |
| `BookFinder.getOpenLibResults` | `(title: string, author: string \| null \| undefined, maxTitleDistance: number, maxAuthorDistance: number): Promise<OpenLibraryBookResult[]>` | called from `runSearch` |
| `BookFinder.getGoogleBooksResults` / `getFantLabResults` | `(title: string, author: string \| null \| undefined): Promise<BookSearchResult[]>` | called from `runSearch` |
| `BookFinder.getAudiobookCoversResults` / `getiTunesAudiobooksResults` | `(search: string)` / `(title: string)`, both returning `Promise<BookSearchResult[]>` | called from `runSearch` |
| `BookFinder.getAudibleResults` | `(title: string, author: string \| null \| undefined, asin: string \| null \| undefined, provider: string): Promise<BookSearchResult[]>` | called from `runSearch` |
| `BookFinder.getCustomProviderResults` | `(title: string, author: string \| null \| undefined, isbn: string \| BookSearchOptions \| null \| undefined, providerSlug: string): Promise<BookSearchResult[]>` | called from `search` (bug #1 can pass options in) |
| `BookFinder.search` | `(libraryItem: MatchLibraryItem \| null, provider: string, title: string, author?: string \| null, isbn?: string \| BookSearchOptions \| null, asin?: string \| null, options: BookSearchOptions = {}): Promise<BookSearchResult[]>` | `findCovers` passes `null` libraryItem and options in the `isbn` slot (bug #1). SearchController.js:96 omits isbn/asin. Scanner.js:52-53 can pass `null`. BookFinder.test.js:535 passes `null` author. |
| `BookFinder.calculateMatchConfidence` | `(book: BookSearchResult, libraryItemDurationMinutes: number \| null, actualTitleQuery: string, actualAuthorQuery: string \| null \| undefined, isTitleAsin: boolean): number` | called from `search` |
| `BookFinder.runSearch` | `(title: string, author: string \| null \| undefined, provider: string, asin: string \| null \| undefined, maxTitleDistance: number, maxAuthorDistance: number): Promise<BookSearchResult[]>` | called from `search`; stubbed by tests |
| `BookFinder.findCovers` | `(provider: string, title: string, author: string \| null \| undefined, options: BookSearchOptions = {}): Promise<string[]>` | SearchController.js:123, BookScanner.js:1026 |
| `BookFinder.findChapters` | `(asin: string, region: string): Promise<unknown>` | SearchController.js:194, which passes validated strings. Raw chapter JSON or `null` is passed straight through. |
| `TitleCandidates` | `constructor(cleanAuthor: string)`; `add(title: string): void`; `get size(): number`; `getCandidates(): string[]`; `delete(title: string): boolean`; `#removeAuthorFromTitle(title: string): string` | tests and `search` |
| `AuthorCandidates` | `constructor(cleanAuthor: string \| null, audnexus: AuthorASINLookup)`; `validateAuthor(name: string, region = '', maxLevenshtein = 2): Promise<string>`; `add(author: string): void`; `get size(): number`; `get agressivelyCleanAuthor(): string`; `getCandidates(): Promise<string[]>`; `delete(author: string): boolean` | BookFinder.test.js:103 passes `null` |
| module helpers | `hasSubtitle(title: string): boolean`; `stripSubtitle(title: string): string`; `replaceAccentedChars(str: string): string`; `cleanTitleForCompares(title: string, keepSubtitle = false): string`; `cleanAuthorForCompares(author: string \| null \| undefined): string`; `stripRedundantSpaces(str: string): string` | — |
| `AuthorFinder.findAuthorByASIN` | `(asin: string \| null \| undefined, region: string): Promise<AuthorSearchObj \| null> \| null` | AuthorController.js:341. The method returns `null` synchronously. |
| `AuthorFinder.findAuthorByName` | `(name: string \| null \| undefined, region?: string, options: AuthorSearchOptions = {}): Promise<AuthorSearchObj \| null>` | SearchController.js:169 omits region. AuthorController.js:343 passes `req.body.q`. |
| `AuthorFinder.saveAuthorImage` | `(authorId: string, url: string): Promise<SavedAuthorImage \| AuthorImageError>` | AuthorController.js:282, :360 |
| `PodcastFinder.search` | `(term: string, options: PodcastSearchOptions = {}): Promise<iTunesPodcastSearchResult[] \| null>` | Scanner.js:83 passes no options |
| `PodcastFinder.findCovers` | `(term: string): Promise<string[] \| null>` | SearchController.js:122, CoverSearchManager.js:94 |

Local variables get type-only annotations where TypeScript needs them:

- `let books: BookSearchResult[] = []`, `let searchResults: BookSearchResult[] = []` and `const covers: string[] = []`.
- `let durationScore: number`.
- `const titleTransformers: [RegExp, string][]`.
- `var filteredCandidates: string[] = []` and `var promises: Promise<string>[] = []`.
- In `search()`, `let authorCandidates: AuthorCandidatesInstance | string[]` and `let titleCandidates: TitleCandidatesInstance | string[]`. Each variable is reassigned from the candidates object to `string[]`, and TypeScript narrows the type on each assignment (probe P-2).

### 5.3 Stub safety (BookFinder.test.js)

- `runSearch` stays an ordinary `async runSearch(…)` prototype method, and `search()` still calls `this.runSearch(…)`. So `sinon.stub(bookFinder, 'runSearch')` (test line 237) still intercepts it.
- `audnexus` stays a public instance property assigned in the constructor (`this.audnexus = new Audnexus()`). The only addition is `declare audnexus: Audnexus`, which emits nothing. The stub on `bookFinder.audnexus.authorASINsRequest` (test line 242) targets a prototype method of the untouched provider.
- `bookFinder.constructor.TitleCandidates` and `.AuthorCandidates` (test lines 21, 81, 103, 150, 178, 209, 218) remain `static` class-expression fields.
- No new `#private` members. The only ones remain the two that exist today, `#providerResponseTimeout` and `#removeAuthorFromTitle`. No arrow-function properties, and no `public`/`private`/`protected`/`readonly` modifiers.

## 6. Inventory: every cast, rewrite, declaration and added comment

### 6.1 Casts (13). All at the provider boundary, all single-step `as`

| # | File:line | Cast | Reason |
|---|---|---|---|
| C1 | BookFinder.js:32 | `await this.openLibrary.isbnLookup(isbn) as OpenLibraryIsbnLookupResult` | `isbnLookup` has no JSDoc, so TS infers `Object \| { errorCode: number }`. In reality it returns raw ISBN JSON or `{ errorCode: 404 }` (OpenLibrary.js:35). See P2. |
| C2 | BookFinder.js:110 | `await this.openLibrary.searchTitle(…) as BookProviderResponse<OpenLibraryBookResult>` | JSDoc says `Promise<Object[]>`, but it also returns `{ errorCode: 404 }` (OpenLibrary.js:114). See P1. `title: string` matches what `filterSearchResults` already assumes (`b.title.length`, L48). |
| C3 | BookFinder.js:134 | `await this.googleBooks.search(…) as BookProviderResponse<BookSearchResult>` | JSDoc says `Object[]`, and BookFinder checks `errorCode` defensively (L136). GoogleBooks never sets it, so this type is **wider** than reality. |
| C4 | BookFinder.js:134 | `author as string` (argument) | GoogleBooks.js:46 JSDoc says `string`, but GoogleBooks.js:55 checks `if (author)`. See P3. |
| C5 | BookFinder.js:151 | `await this.fantLab.search(…) as BookProviderResponse<BookSearchResult>` | Same as C3 (L153 check; FantLab never sets `errorCode`). |
| C6 | BookFinder.js:151 | `author as string` (argument) | FantLab.js:30 JSDoc says `string`, but FantLab.js:38 checks `if (author)`. See P3. |
| C7 | BookFinder.js:191 | `author as string` (argument) | Audible.js:123 JSDoc says `string`, but Audible.js:153 checks `if (author)`. See P4. |
| C8 | BookFinder.js:191 | `asin as string` (argument) | Audible.js:124 JSDoc says `string`, but Audible.js:137 checks `if (asin && …)`. Callers omit asin. See P4. |
| C9 | BookFinder.js:191 | `region as string` (argument) | `provider.split('.').pop()` (L190) is typed `string \| undefined`, but `split` always returns at least one element. |
| C10 | BookFinder.js:207 | `author as string` (argument) | CustomProviderAdapter.js:14 JSDoc says `string`, but CustomProviderAdapter.js:36 checks `if (author)`. See P5. |
| C11 | BookFinder.js:207 | `isbn as string` (argument) | CustomProviderAdapter.js:15 JSDoc says `string`, but CustomProviderAdapter.js:39 checks `if (isbn)`. It can also be the options object from bug #1, which is left unchanged. See P5. |
| C12 | AuthorFinder.js:29 | `region as string` (argument) | Audnexus.js:112 JSDoc says `string`. SearchController.js:169 omits region, and Audnexus.js:50/78 check `if (region)`. See P6. |
| C13 | PodcastFinder.js:18 | `options as { country: string }` (argument) | iTunes.js:160 JSDoc requires `country`. Scanner.js:83 passes no options (default `{}`). iTunes.js:165 spreads `options`, and axios drops an undefined `country`. See P8. |

No other `as` appears anywhere in the three files.

### 6.2 `Number()` rewrites (5 lines, BookFinder only)

| # | File:line | Before → after | Why the result is identical at runtime |
|---|---|---|---|
| N1 | BookFinder.js:80 | `b.titleDistance > maxTitleDistance` → `Number(b.titleDistance) > maxTitleDistance` | `>` already converts both operands to numbers (ECMAScript IsLessThan: ToPrimitive with hint number, then ToNumeric, since neither side is a string). For `number \| undefined`, `Number(x)` gives the same value (`undefined` becomes `NaN`). |
| N2 | BookFinder.js:89 | `b.authorDistance > maxAuthorDistance` → `Number(b.authorDistance) > maxAuthorDistance` | Same as N1. This line runs only inside `if (author)`, where `.map` has set `authorDistance`. |
| N3 | BookFinder.js:96 | `b.totalPossibleDistance < 5 && b.totalDistance > 0` → `Number(b.totalPossibleDistance) < 5 && Number(b.totalDistance) > 0` | Same as N1, for both comparisons. |
| N4 | BookFinder.js:121 | `a.totalDistance - b.totalDistance` → `Number(a.totalDistance) - Number(b.totalDistance)` | `-` converts both operands to numbers (ToNumeric), and for `number \| undefined` `Number(x)` is the same conversion. |
| N5 | BookFinder.js:270 | `onlyDigits.test(a) - onlyDigits.test(b)` → `Number(onlyDigits.test(a)) - Number(onlyDigits.test(b))` | `-` converts booleans to numbers: `true` is 1 and `false` is 0, which is exactly what `Number(boolean)` returns. TS rejects boolean arithmetic (TS2362/2363), and no type-only fix exists. |

N1–N4 are needed because the score fields are optional in `OpenLibraryBookResult` (TS18048, probe P-2). They are optional because `.map` attaches them at runtime, and `authorDistance` is genuinely unset when no author was searched.

### 6.3 `isNaN` declarations (2)

| # | Where | Covers | Line text |
|---|---|---|---|
| D1 | `BookFinder.ts`, after the imports | the calls at BookFinder.js:376, 377, 378 (`options.titleDistance`, `authorDistance`, `maxFuzzySearches` can be `undefined`) | see below |
| D2 | `AuthorFinder.ts`, after the imports | the call at AuthorFinder.js:27 (`options.maxLevenshtein` can be `undefined`) | see below |

Both lines carry this comment:

```ts
// lib.d.ts types isNaN(number), but the built-in coerces every value and these option fields can be undefined. Widens the type for this file only; emits no code.
declare function isNaN(value: unknown): boolean
```

At runtime `isNaN` still resolves to the global built-in. The call sites do not change.

### 6.4 Added comment (1)

| # | Where | Text |
|---|---|---|
| K1 | `BookFinder.ts`, the line directly above `async search(`, below the existing JSDoc block | `// isbn also accepts BookSearchOptions because findCovers() passes its options object in this slot (SP-S01 bug #1)` |

`getCustomProviderResults()` carries the same widened `isbn` type with no comment of its own. K1 survives compilation (probe P-4), so it is listed in §7.

### 6.5 Other unchecked type claims (not casts; listed so nothing is hidden)

| # | Where | Claim | Why it holds |
|---|---|---|---|
| U1 | `AuthorFinder.ts` | `declare global { var MetadataPath: string }` | Assigned at Server.js:68 during startup, before any route can reach `saveAuthorImage`. |
| U2 | AuthorFinder.js:59 | `.catch((err: Error) => …)` | `Promise.catch` types the error as `any`. Every way `fileUtils.downloadFile` can reject produces an `Error`: fileUtils.js:315 (`new Error`), the axios failure path at :338-340, and the stream `'error'` event at :336. |

### 6.6 `any` from untyped JS that is not annotated

These are inferred by TypeScript from JS dependencies. The finder code never writes `any`.

- AuthorFinder.js:46-47: the results of `fs.pathExists(…)` and `fs.ensureDir(…)`. fsExtra wraps them with universalify (`u(…)`), so their inferred type is `any`. Probe P-1 showed `pathExists` returning a value assignable to `number`. They are used only in `if (!await …)` and as a statement. Annotating them would be an unchecked claim outside the boundary.
- `downloadImageFile` resolves `Promise<any>` (fileUtils.js:351, `@returns {Promise}`). The value is ignored (`.then(() => …)`).
- Parameters of untyped JS functions (`Logger.debug(...args)`, `levenshteinDistance(str1, str2)`, `htmlSanitizer.stripAllTags(html)`) are `any` on the callee side. They accept what the finders pass.

Step V7 (§10) counts every `any` that reaches the finders' declaration output.

## 7. Expected compiled-output differences (exhaustive)

Compare `dist-server/server/finders/*.js` before and after. These are the **only** permitted differences:

| # | File(s) | Difference |
|---|---|---|
| E1 | BookFinder (10 lines), AuthorFinder (4), PodcastFinder (2) | `require('…')` becomes `require("…")` on `import = require` lines (quote style only). |
| E2 | BookFinder, AuthorFinder | `const { levenshteinDistance, levenshteinSimilarity, escapeRegExp, isValidASIN } = require('../utils/index');` becomes `const utils = require("../utils/index");` + `const { … } = utils;`. `const { downloadImageFile } = require('../utils/fileUtils');` becomes `const fileUtils = require("../utils/fileUtils");` + `const { downloadImageFile } = fileUtils;`. |
| E3 | BookFinder | The 5 lines N1–N5 (§6.2). |
| E4 | BookFinder | The K1 comment line (§6.4), above `async search(`. |

Facts confirmed by probe P-4: comments attached to erased declarations (D1, D2, `declare global`, interfaces) are dropped, blank lines are not emitted, `declare` fields emit nothing, and `await x as T` emits `await x`. Anything else in the diff is a defect to fix before committing.

## 8. Outdated JSDoc (for your follow-up report)

### 8.1 In the finders (comments kept as-is; TS types replace them)

| # | File:line | JSDoc says | TS type |
|---|---|---|---|
| J1 | BookFinder.js:104, 107 | `author {string}`; `@returns {Promise<Object[]>}` | `string \| null \| undefined`; `Promise<OpenLibraryBookResult[]>` |
| J2 | BookFinder.js:130, 131 | same pair (Google) | nullable; `Promise<BookSearchResult[]>` |
| J3 | BookFinder.js:147, 148 | same pair (FantLab) | nullable; `Promise<BookSearchResult[]>` |
| J4 | BookFinder.js:164 | `@returns {Promise<Object[]>}` (AudiobookCovers) | `Promise<BookSearchResult[]>` |
| J5 | BookFinder.js:175 | `@returns {Promise<Object[]>}` (iTunes) | `Promise<BookSearchResult[]>` |
| J6 | BookFinder.js:184, 185, 187 | `author {string}`, `asin {string}`; `@returns {Promise<Object[]>}` | nullable, nullable; `Promise<BookSearchResult[]>` |
| J7 | BookFinder.js:200, 201, 203 | `author {string}`, `isbn {string}`; `@returns {Promise<Object[]>}` | nullable; `string \| BookSearchOptions \| null \| undefined`; `Promise<BookSearchResult[]>` |
| J8 | BookFinder.js:365 | `libraryItem {import('../models/LibraryItem')}` | `MatchLibraryItem \| null` |
| J9 | BookFinder.js:368, 369, 370 | `author`, `isbn`, `asin {string}` | nullable; `isbn` also accepts `BookSearchOptions` |
| J10 | BookFinder.js:371 | `options {{titleDistance:number, authorDistance:number, maxFuzzySearches:number}}` (all required) | `BookSearchOptions` (all optional) |
| J11 | BookFinder.js:372 | `@returns {Promise<Object[]>}` | `Promise<BookSearchResult[]>` |
| J12 | BookFinder.js:455, 458, 460 | `book {Object}`, `actualAuthorQuery {string}`, `@returns {number\|null}` | `BookSearchResult`, nullable, `number` (it never returns `null`) |
| J13 | BookFinder.js:571, 573, 576 | `author {string}`, `asin {string}`; `@returns {Promise<Object[]>}` | nullable, nullable; `Promise<BookSearchResult[]>` |
| J14 | AuthorFinder.js:20, 21, 22, 23 | `name {string}`, `region {string}`, `options {Object}`, `@returns {Promise<…AuthorSearchObj>}` | nullable, optional, `AuthorSearchOptions`, `Promise<AuthorSearchObj \| null>` |
| J15 | AuthorFinder.js:41 | `@returns {Promise<{path:string, error:string}>}` | `Promise<SavedAuthorImage \| AuthorImageError>` (one or the other, never both) |
| J16 | PodcastFinder.js:12, 13 | `options {{country:string}}`; `@returns {Promise<…iTunesPodcastSearchResult[]>}` | `country` optional; adds `\| null` |
| J17 | PodcastFinder.js:25 | `@returns {Promise<string[]>}` | `Promise<string[] \| null>` |

### 8.2 In the providers (not edited this phase; these are the reasons for the casts)

| # | File:line | Problem |
|---|---|---|
| P1 | OpenLibrary.js:107 | `searchTitle` is documented `@returns {Promise<Object[]>}`, but it also returns `{ errorCode: 404 }` (L114), and hits can carry `errorCode: 500` / `errorMsg` (L46, spread at L85). |
| P2 | OpenLibrary.js:31 | `isbnLookup` has no JSDoc. It returns raw JSON or `{ errorCode: 404 }` (L35). |
| P3 | GoogleBooks.js:46, FantLab.js:30 | `author {string}`, but `null`/`undefined` are handled. FantLab.js:30 also has a typo, `author'`. |
| P4 | Audible.js:123, 124, 125 | `author`, `asin`, `region {string}`, but all three handle missing values. |
| P5 | CustomProviderAdapter.js:14, 15 | `author`, `isbn {string}`, but both handle missing values. |
| P6 | Audnexus.js:43, 66, 93, 112 | `region {string}`, but `undefined` is handled. `@returns {Promise<AuthorSearchObj>}` (L67, L94, L114) can resolve to `null`. `AuthorSearchObj.image` (L11) can be `null`. |
| P7 | Audnexus.js:149 | `getChaptersByASIN` is documented `@returns {Promise<Object>}`, but resolves `null` on failure (L162). |
| P8 | iTunes.js:160 | `options {{country:string}}`, but the default is `{}`. |
| P9 | GoogleBooks.js:48, Audible.js:127, FantLab.js:32, iTunes.js:126, CustomProviderAdapter.js:19 | `@returns {Promise<Object[]>}`. Under `strict`, JSDoc `Object` is the real global `Object` type (not `any`), so it carries very little information. |

## 9. Bugs and observations (reported only, all left unchanged)

1. **`BookFinder.findCovers` passes `options` into the `isbn` slot** (BookFinder.js:613, 621, 626): `this.search(null, provider, title, author, options)`. `options` is the 7th parameter of `search`, but here it lands in the 5th (`isbn`).
   - BookScanner.js:1026's `{ titleDistance: 2, authorDistance: 2 }` is silently ignored, so the defaults of 4 apply.
   - For `custom-*` providers the object is forwarded to CustomProviderAdapter as `isbn` and sent as `isbn=[object Object]`. This includes SearchController.js:123's default `{}`, because `{}` is truthy.
2. **`Audible.search` can throw instead of returning `[]`.** Audible.js:163 returns `null` from `.then` when there are no products, then Audible.js:171 calls `items.filter`, which throws `TypeError`. As a result, `if (!books) return []` in `BookFinder.getAudibleResults` (L193) can never be reached.
3. **Scanner.js:83-84 reads `results.length`** on `PodcastFinder.search()`, which returns `null` for an empty term (PodcastFinder.js:16).

## 10. Verification

All output saved as evidence goes under `evidence/test-results/SP-S01/`. `<scratchpad>` means the Claude Code session scratchpad directory, which is outside the repository.

| Step | When | What | Pass condition |
|---|---|---|---|
| V1 | before any rename | `npm run build:server`, then copy `dist-server/server/finders/*.js` to `evidence/test-results/SP-S01/emit-before/` | build exits 0 |
| V2 | after each `git mv` (red) | `npm run build:server`, output saved | build **fails**, with type errors in the renamed file only |
| V3 | after typing each file (green) | `npm run build:server` | exits 0 with no errors |
| V4 | after each file | `npm test` | 356 passing, 0 failing |
| V5 | after each file | diff the new `dist-server/server/finders/<File>.js` against `emit-before/` | only the E1–E4 entries for that file |
| V6 | before each commit | `git diff --cached -M --stat` | the file shows as a rename (`R…`), not a delete plus an add |
| V7 | at the end | Declaration output for the three files into the **scratchpad**, never the repo: `node node_modules/typescript/bin/tsc server/finders/AuthorFinder.ts server/finders/BookFinder.ts server/finders/PodcastFinder.ts --declaration --emitDeclarationOnly --allowJs --strict --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --resolveJsonModule --skipLibCheck --rootDir . --outDir <scratchpad>/dts`. It runs without `-p`, so `incremental`/`tsBuildInfoFile` do not apply, and `noEmitOnError` stays off. Then `grep -nw any` on the three `.d.ts` files, and `git status --porcelain` to prove the repo is unchanged. | every `any` is listed in the final report with file, line and source. Repo unchanged. |
| V8 | at the end | `grep -nE '\bany\b\|@ts-ignore\|@ts-nocheck\|@ts-expect-error\|as unknown as' server/finders/*.ts` | no matches |
| V9 | at the end | `grep -nw 'as' server/finders/*.ts` and `grep -n 'Number(' server/finders/*.ts`. Neither the current `.js` files nor the new comments in §5.1/§6 contain the word `as`. `Number(` already appears on 4 unchanged lines (AuthorFinder.js:27, BookFinder.js:376, 377, 378). | exactly 13 `as` matches (C1–C13). The `Number(` matches are exactly those 4 existing lines plus N1–N5 (8 new calls on 5 lines). |
| V10 | at the end | `git log --follow --oneline -- server/finders/<File>.ts` for each file | history reaches back to the original `.js` commits |
| V11 | at the end | final clean `npm run build:server` and `npm test`, output saved | the Done check passes |

After every `tsc` run that targets the scratchpad, `git status --porcelain` must show no changes outside `evidence/`. This step exists because of the probe P-2 incident (§12).

**New tests: none proposed.** Behaviour must not change, and V5's compiled-output diff covers all three files. That includes AuthorFinder and PodcastFinder, which have no tests. This is stronger evidence of "no behaviour change" than new tests would be. Any new test would need your approval first.

## 11. Task outline (the implementation plan details each task)

| Task | Content | Commit message prefix |
|---|---|---|
| T1 | V1 baseline compiled output saved | `[SP-S01] evidence: …` |
| T2 | `PodcastFinder`: V2 → types → V3–V6 | `[SP-S01] …` |
| T3 | `AuthorFinder`: same steps (D2, U1, U2, C12) | `[SP-S01] …` |
| T4 | `BookFinder`: same steps (C1–C11, N1–N5, D1, K1) | `[SP-S01] …` |
| T5 | V7–V11, final report (cast/rewrite table with `.ts` lines, `any` list, bugs, outdated-JSDoc list) | `[SP-S01] evidence: …` |
| — | superpowers:finishing-a-development-branch, choose **keep branch**, stop | — |

Order: smallest file first, so the pattern is proven before BookFinder.

## 12. Probes run during design (throwaway, scratchpad only, nothing kept)

| Probe | What it established |
|---|---|
| P-1 | `books.errorCode` on JSDoc `Promise<Object[]>` fails with TS2339. `isbnLookup` is inferred as `Object \| { errorCode: number }`. Passing `string \| undefined` to JSDoc `string` parameters fails with TS2345. `Object[]` can be assigned to arrays of all-optional interfaces. `fs.pathExists` is `any`. |
| P-2 | The literal `errorCode: 404` discriminant narrows without a cast. `declare` fields work, including in static class expressions. Reassigning a union-typed `let` narrows correctly. A module-local `declare function isNaN` compiles. Optional fields compared with `>` fail with TS18048. Boolean subtraction fails with TS2362/2363. **Incident:** the first run also emitted output while importing repo JS. `tsc` reported TS5055 ("would overwrite input file") for repo `.js` files and wrote nothing into the repo, which `git status` confirmed. The run was repeated with `--noEmit`. |
| P-3 | `import('…').AuthorSearchObj` / `iTunesPodcastSearchResult` typedef imports, `declare global` next to `export =`, and the C12/C13/C1 cast shapes all compile. |
| P-4 | Emit facts: comments on erased declarations are dropped, blank lines are not emitted, the comment above a method survives, `(await x) as T` emits parentheses but `await x as T` does not, and import-equals emits double-quoted `require`. |

## 13. Out of scope

- Editing `server/providers/` (including the JSDoc fixes in §8.2), callers, tests or config.
- Fixing the bugs in §9.
- `npm run lint`, which is not part of the Done check.
- Moving `MetadataPath` into a shared global declaration file. A later migration can do that.
