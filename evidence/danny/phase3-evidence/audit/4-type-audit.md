# Phase 3 type audit (read-only)

Audited at commit `c9faa3c1` (branch `danny/phase3`, clean working tree). Nothing in the repository was edited, created or deleted. Scripts live in the session scratch directory and are copied in full into the Appendix.

Labels used below:
- **[measured]** is a number produced by a script or a git command in the Appendix.
- **[judgement]** is my reading of the code. File:line evidence is given so it can be checked.

## Summary

1. [measured] 89 files, 18,198 code lines: 0 `any`, 0 `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`, 0 eslint-disable, but 443 cast sites (24.3 per 1,000 lines), 109 of them `as unknown as` (6.0 per 1,000). Batches 1 to 4 cast about 3 times as often as Phase 2 (26 to 27 vs 8.8 per 1,000).
2. [judgement] The `any` ban was obeyed in letter, but the same effect is reached through `unknown` plus `as unknown as`, open option types (`QueryFindOptions`), an index signature on `FilteredLibraryItem`, and `never`-parameter route handlers that switch off checking for all 203 API routes.
3. [judgement] About 41% of casts (183) exist because the Sequelize models are still JS (`TypedDatabase`, query options, loaded rows); these are real limitations and should mostly disappear in batch 3 if the rules require it.
4. [judgement] About 27% (118) drop `null`/`undefined` or retype a value without a check. Most are harmless, but some hide real mismatches (`null as unknown as T` fields that the code itself null-checks, `req.query` cast to strings, `FileMetadata.toJSON` claiming non-null).
5. [measured] `tsconfig.server.json`, `eslint.config.mjs` and all 35 files under `test/` are unchanged since `7d10b8fc`; `"strict": true`. Note that the eslint config only matches `*.js`, so no `.ts` file is linted at all.

## Table of counts

All counts are [measured] with the TypeScript compiler API (`count.js`), so comments, strings and template literals are never matched. "Code lines" = non-blank lines that contain something other than a comment. Rates are per 1,000 code lines.

| Metric | A: Phase 2 | B: batch 1 (utils) | C: batches 2 and 4 | Total |
| --- | ---: | ---: | ---: | ---: |
| Files | 14 | 49 | 26 | 89 |
| Non-blank lines | 2,237 | 13,672 | 5,206 | 21,115 |
| Code lines (non-blank, non-comment) | 1,922 | 11,920 | 4,356 | 18,198 |
| `as` cast sites (excl. `as const`) | 17 (8.8) | 309 (25.9) | 117 (26.9) | 443 (24.3) |
| `as` keywords (a double cast counts 2) | 18 (9.4) | 381 (32.0) | 153 (35.1) | 552 (30.3) |
| `as unknown as` | 1 (0.5) | 72 (6.0) | 36 (8.3) | 109 (6.0) |
| Non-null assertions `x!` | 5 (2.6) | 2 (0.2) | 3 (0.7) | 10 (0.5) |
| `any` in code | 0 | 0 | 0 | 0 |
| `unknown` annotations (excl. the middle of `as unknown as`) | 24 (12.5) | 114 (9.6) | 39 (9.0) | 177 (9.7) |
| of which `Record<string, unknown>` | 2 (1.0) | 39 (3.3) | 24 (5.5) | 65 (3.6) |
| Index signatures `[k: string]: ...` | 1 (0.5) | 8 (0.7) | 0 | 9 (0.5) |
| `declare` fields | 0 | 11 (0.9) | 316 (72.5) | 327 (18.0) |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | 0 | 0 | 0 | 0 |
| eslint-disable comments | 0 | 0 | 0 | 0 |
| `NOTE:` comments (bug notes) | 7 (3.6) | 9 (0.8) | 4 (0.9) | 20 (1.1) |
| `object` keyword types | 1 | 1 | 10 | 12 |
| `as const` (not counted as casts) | 0 | 0 | 1 | 1 |
| Cast sites with no comment on the same or previous line | 13 | 1 | 10 | 24 |

Notes on the counts:
- Group B has 49 files, not the 46 in MIGRATION.md, because it includes 3 new `types.ts` files. `server/utils/htmlEntities.ts` is 2,234 lines of a data table with no casts; without it group B is 31.9 cast sites and 7.4 `as unknown as` per 1,000 lines, and the total is 27.7 and 6.8.
- Group A also has 2 definite-assignment assertions (`baseUrl!: string`, `limiter!: ...` at `server/providers/Audnexus.ts:61-62`) that are not in the `x!` count.
- `declare` fields are required by rule 12, so the group C number is expected, not a shortcut.
- "No comment" is a heuristic (a comment on the cast's line or the line above). Several group C hits are covered by a comment two lines up. The 13 Phase 2 hits predate rule 4.
- grep cross-check: `grep -o 'as unknown as'` also gives 109. A line-based grep for ` as ` gives 436 lines; the AST count is higher because some lines hold 2 casts. The only false positive grep found for `NOTE:` was `server/utils/constants.ts:26` (`NOTE: 6` is an object key, not a comment) and the AST count excludes it. grep for the word `any` only hits comments and log strings (`parseOverdriveMediaMarkers.ts:114`, `areEquivalent.ts:15`, `dbMigration.ts:730,777`); the AST count of `any` is 0.

Git checks [measured]:
- `git diff --name-status 7d10b8fc HEAD -- tsconfig.server.json eslint.config.mjs test/` prints nothing, and `git status --porcelain` is empty, so the three are unchanged in both HEAD and the working tree. `test/` holds 35 files at both commits.
- `tsconfig.server.json` has `"strict": true`. It also has `allowJs: true` without `checkJs`, so the still-JS modules (models, managers, Database) are not checked and their inferred types are what forces many casts.
- `eslint.config.mjs` only lists `index.js`, `prod.js`, `dev.js`, `server/**/*.js` and `test/**/*.js`, so the 0 eslint-disable count is trivially true: `.ts` files are never linted.

## Cast reasons

Classification of all 443 cast sites. A script (`classify.js`) buckets each cast by its target type and expression; I then read every `as unknown as` (109) and the "drops null" bucket by hand. Bucket sizes are [measured] for the script's rules; the a/b/c/d labels are [judgement].

| Reason | Cast sites | of which `as unknown as` |
| --- | ---: | ---: |
| (b) Sequelize: `TypedDatabase` views, query option objects, loaded rows with associations, JSON columns, `LibraryItem['media']` | 176 | 52 |
| (b) Express/passport: `req.query`, `req.session`, `express()`, `req.user` | 7 | 2 |
| (a) Vendored or untyped library module (`FsExtra` 13, `DateAndTime` 4, `ArchiverFactory` 2, Fuse, ffprobe, libarchive, fast-sort) | 30 | 22 |
| (a) Loosely typed third-party output (xml2js trees, openid-client, axios errors, provider JSON) | 34 | 1 |
| (c?) Drops `null`/`undefined` or retypes a primitive without a check | 112 | 5 |
| (c) Model JSDoc says a different type than the runtime value (`bigint`, `Date`, `publishedYear`) | 6 | 6 |
| `null as unknown as T` field/variable initialisers | 8 | 8 |
| (d) Dynamic key access (`this as unknown as Record<string, unknown>`, `keyof X`) | 43 | 12 |
| (d) `catch (error)` read as `Error` | 21 | 0 |
| (d) Other | 6 | 1 |
| **Total** | **443** | **109** |

The 109 `as unknown as` by reason [judgement after reading each one]: (a) 23, (b) 52, (c) 18, (d) 16.
- (c), 18: the 8 `null as unknown as T` initialisers; the 6 model-JSDoc mismatches (`absMetadataMigration.ts:53,55,59`, `libraryFilters.ts:154,173,692`); `BookFinder.ts:609` (options passed as isbn, has a NOTE); `Backup.ts:55` (old backups stored `1` in a string field); `dbMigration.ts:1612` (`oldLibraryId` does not exist, has a NOTE); `ApiRouter.ts:621` (sessions read with a string `timeListening` and a missing `lastUpdate`, has a NOTE).
- (d), 16: the 12 `this`-as-Record aliases in objects/*; 3 `isNaN(x as unknown as number)` coercions (`parseOpfMetadata.ts:119`, `podcastUtils.ts:379`, `scandir.ts:219`); `libraryFilters.ts:718` (an object whose Sets are swapped for arrays in place).

Inside the 112 "drops null" bucket [judgement]:
- About 40 are harmless: `process.env.X as string` into `parseInt` (`TokenManager.ts:47-57`, `rateLimiterFactory.ts:36-48`); `arr.pop() as string` / `shift() as string` after a length check (`scandir.ts:84,116`, `parseOverdriveMediaMarkers.ts:156-165`); `isNaN(x as number)`; `clearInterval(this.loop as NodeJS.Timeout)` (`Stream.ts:252` and 4 more).
- About 70 assert that a nullable value is set because the surrounding logic makes it so (`libraryItemsBookFilters.ts:292-315`, `ApiRouter.ts:599,605`, `fileUtils.ts:205,239,241`). These are honest about the JS but give no protection. A few hide real risk (see the top 10).

## Top 10 worst shortcuts

All [judgement], ranked by how much checking each one removes.

1. `server/routers/ApiRouter.ts:61-66,127`: `RouteHandler = (req: never, res: never, next: never) => unknown` and `express() as unknown as ApiRouterApp`. Any function fits a `never`-parameter handler, so none of the 203 `this.router.get/post/patch/delete(...)` registrations is checked (wrong controller, wrong arity, a non-function would all compile).
2. `server/utils/queries/types.ts:66-78` (`QueryFindOptions` with `where`, `include`, `attributes`, `order` all `unknown`) plus `as unknown as FindOptions/CountOptions/FindAndCountOptions` at 27 sites (for example `libraryItemsBookFilters.ts:441,450,461`, `libraryItemsPodcastFilters.ts:141,149,159`). Every Sequelize query built in utils/queries is unchecked.
3. `server/utils/queries/types.ts:43-49`: `FilteredLibraryItem = LibraryItem & { ...; [key: string]: unknown }`. The index signature lets any misspelled property on a library item compile (it reads as `unknown` instead of an error). It is cast to at 8 sites and used in all the filter queries.
4. `x as unknown as LibraryItem['media']` 12 times (for example `libraryItemsBookFilters.ts:768,916,1107,1163,1262,1360`, `libraryItemFilters.ts:60,83,123,146,187`). A Book/Podcast row with its own associations is forced into the model's `media` type. The shapes really differ, and the next line (`libraryItemsBookFilters.ts:1362,1364`) needs yet another cast to `BookExpanded`.
5. `null as unknown as T` on fields the code itself null-checks: `AudioFile.ts:73,95` (but `AudioFile.ts:252` tests `!this.metaTags`), `PodcastEpisodeDownload.ts:38,41,43` (but `toJSONForClient`, lines 59-78, uses `this.rssPodcastEpisode?.` and `this.libraryItem?.`), `EBookFile.ts:26`, `LibraryFile.ts:41`. The type says "never null" while the code says "may be null". `url` at `PodcastEpisodeDownload.ts:41` had no JSDoc type in the JS, so this was a free choice.
6. `server/auth/OidcAuthStrategy.ts:168`: `let user = null as unknown as OidcUser`. This hides exactly the null dereference recorded in the Bugs section (`user.isActive` at line 199). The NOTE is good, but the cast is what stopped the compiler from reporting it.
7. `server/objects/metadata/FileMetadata.ts:26,46`: the constructor casts `Partial<FileMetadataJSON>` to the full type, and `toJSON()` casts an object of eight `T | null` fields to `FileMetadataJSON` (all non-null). Every consumer (`LibraryFile.toJSON`, `AudioFile.toJSON`, `absMetadataMigration.ts:47`, the models) now believes `filename`, `size`, `mtimeMs` are never null. Related: `update(payload: object)` and `setData(payload: object)` (lines 71, 85) take `object` instead of `Partial<FileMetadataJSON>`.
8. `server/auth/OidcAuthStrategy.ts:305,344,537`: `req.query as OidcQuery` (all `string`). Express query values can be `string[]` or nested objects (`?state=a&state=b`). The value is then used as a Map key (line 546, with a `!`) and in `encodeURIComponent(code as string)` (line 556). This is a real mismatch hidden, not a typing limitation.
9. `server/auth/types.ts:26-32` (`JwtPayload`, all 5 fields optional) followed by `jwt_payload.keyId as string` and `jwt_payload.userId as string` (`TokenManager.ts:304,345`). The type was made loose, then every read casts it back. Similar: `OidcAuthStrategy.ts:303` widens `isMobileFlow` from the JSDoc `boolean` to `unknown` (its real type is `string | boolean | undefined`).
10. `server/utils/podcastUtils.ts:120-128`: `RssPodcastMetadata` has `[key: string]: unknown`, `feedUrl: unknown`, `type: unknown`, and does not declare `title`, `author`, `language`, `explicit` or `link`, which `extractPodcastMetadata` copies in by name. The main output of the RSS parser, used by PodcastManager and the podcast controllers, is almost untyped. `RssEpisodeData` (lines 83-102) has the same index signature.

Next in line: `utils/index.ts:74` (`resolve(results as T)` makes `xmlToJSON<T>` return whatever type the caller names); `prober.ts:7` (redeclares `isNaN` as `(value: unknown) => boolean` for the whole file); `libraryItemsBookFilters.ts:627` (`(user as User).id`, would throw for a progress sort without a user, no NOTE); `dbMigration.ts:1650,1656` (types an array as `(string | undefined)[]`, then casts it to `string[]` 6 lines later).

Answers to the five review questions:
1. Domain objects [judgement]: mostly specific. objects/* classes declare every field with a concrete type (`AudioFile.ts:39-71`), constructor inputs are explicit interfaces (`AudioFileData`, `AudioFile.ts:11-37`), `objects/types.ts` has 1 optional property out of 15 [measured], and `dbMigration.ts:19-290` describes each old JSON entity field by field. The weak spots are the query layer (`QueryFindOptions`, `QueryInclude = Record<string, unknown>`, `MediaGroupQuery.mediaWhere: Record<string, unknown>`), the RSS types in podcastUtils, and `FilteredLibraryItem`.
2. Cast reasons: see the table above.
3. Null typing [measured + judgement]: 8 `null as unknown as T` initialisers (listed above), at least 3 of them (AudioFile.metaTags, PodcastEpisodeDownload.rssPodcastEpisode and libraryItem) contradicted by null checks in the same class. For the reverse question, a script compared all 180 `declare x: T | null` fields in group C with the JS at `7f280c67`: only `Stream.episodeId` has no `null` assignment in the JS, and it is legitimately null for books (callers pass `null`). So there is no sign of `| null` being added where the JS never used null.
4. types.ts files [measured]: `providers/types.ts` 21 of 23 properties optional (Phase 2; it describes a union of provider results, so this is defensible); `utils/queries/types.ts` 19 of 25 optional, 5 typed `unknown`, 1 index signature (the weakest file); `auth/types.ts` 5 of 5 optional (`JwtPayload`); `utils/types.ts` 10 of 39; `objects/types.ts` 1 of 15; `utils/parsers/types.ts` 1 of 4.
5. Weakened signatures [judgement]: `ApiRouter.ts:61` (never-param handlers), `queries/types.ts:66-78` (`QueryFindOptions`), `OidcAuthStrategy.ts:303` (`isMobileFlow: unknown`), `FileMetadata.ts:71,85` (`payload: object`), `prober.ts:7` (`isNaN` retyped), `ApiRouter.ts:96,100` (`mediaMetadata: unknown`, `recentSessions: unknown[]` in a return type, although the values are known `PlaybackSession`s), `absMetadataMigration.ts:71` (the model is cast to a hand-written method signature because the JS default `where = null` infers `null`).

## What looks good

[judgement unless marked]
- [measured] 0 `any`, 0 ts-ignore family, 10 non-null assertions in 18k lines, and 419 of 443 cast sites carry an adjacent comment that states the reason. The comments are specific (for example `libraryItemsBookFilters.ts:312` "parseInt(null) is NaN, as in the JS").
- The views of vendored libraries are narrow and honest: `FsExtra` is derived from Node's own `fs` types plus only the 7 extra methods used (`utils/types.ts:13-28`); `ArchiverFactory`, `ZipArchive`, `DateAndTime` list only the methods called.
- Types are derived instead of copied where possible: `ServerSettingsJSON = ReturnType<ServerSettings['toJSON']>` (`ServerSettings.ts:43`), `global.ServerSettings` from the same (`utils/types.ts:33-36`), `RssPodcastEpisode` in `PodcastEpisodeDownload.ts:12` from podcastUtils' return type. These stay in sync automatically.
- `unknown` is used correctly at real trust boundaries and then narrowed: `CustomProviderAdapter.ts:22-36,120-150` (custom provider JSON validated field by field), `utils/index.ts:45-55,207-249` (input validators), `areEquivalent.ts:20`.
- Bugs found by typing are recorded rather than fixed (rule 3): 20 `NOTE:` comments [measured], 12 in the MIGRATION.md Bugs list, each matching a line, and several casts explicitly point at the NOTE (`podcastUtils.ts:182-184`, `scandir.ts:90-92`).
- `Express.User extends UserModel` (`auth/types.ts:6-12`) gives typed `req.user` everywhere without casts.
- `T | null` is not overused: 0 of 180 nullable fields were made nullable without JS precedent [measured, heuristic].
- The batch Logs in MIGRATION.md are candid about every cast family (`TypedDatabase`, option objects, null initialisers), which made this audit much easier.

## Suggested changes to the MIGRATION.md rules for the remaining batches

Suggestions only; nothing was applied.

1. **Batch 3 exit criteria.** Models must declare their JSON columns (`permissions`, `extraData`, `mediaMetadata`, `libraryFiles`) and associations (`book.libraryItem`, `series.bookSeries`, ...), and type `size` and `mtime`/`ctime` as they really are at runtime. After batch 3, remove `TypedDatabase`, `ApiDatabase`, `PatchModels`, `QueryFindOptions` and the `as unknown as LibraryItem['media']` casts, and require `grep -c TypedDatabase` = 0. Otherwise about 180 casts stay forever.
2. **Tag every cast with its reason.** Change rule 4 to require `// cast(a|b|c|d): ...` (a library, b Sequelize/Express, c real mismatch with a NOTE, d other). The next audit can then be done with grep, and "c without a NOTE" can be checked mechanically.
3. **Ban these shortcuts outright:** index signatures on domain types (only allowed for true dictionaries); `never`-parameter function types; `null as unknown as T` (use `T | null`, or `declare x: T` with no initialiser only when the JS never reads it as null); casting `req.query`/`req.body` to all-`string` shapes (use `string | string[] | undefined` or a small reader helper that keeps behaviour).
4. **Cast budget per batch.** Report the counts from `count.js` in each batch Log and stop for review if `as unknown as` goes above, say, 5 per 1,000 code lines, or if a single cast family appears more than 10 times (a sign a shared type is missing).
5. **Rule 4 wording.** "Use `unknown` and narrow it" should add "narrow with a type guard, not with `as`". Parameters must not be wider than the JSDoc they replace (no `unknown` where the JSDoc said `boolean`).
6. **Batch 7 (controllers) should remove `ApiRouterApp`**: once controllers are TS, type `RequestWithUser` as an Express `Request` extension so `this.router` can be a normal `express.Router`.
7. **Lint `.ts` files.** Not allowed under the current rules (the eslint config is frozen), but it is worth asking whether a typescript-eslint config with `no-explicit-any`, `no-non-null-assertion` and `consistent-type-assertions` could be added in batch 10, since right now no `.ts` file is linted.
8. **Small helpers instead of repeated casts:** one `looseIsNaN(value: unknown)` in utils (same runtime behaviour) would remove about 15 `isNaN(x as number)` casts and the file-level retyping in `prober.ts:7`.

## Appendix: commands and scripts

Repository: `/home/danny/Code/compx574/audiobookshelf` at `c9faa3c1`. Scripts were run from the session scratch directory with Node and the repo's own TypeScript 5.9.3 (`node_modules/typescript`). `$R` is the repository path.

```sh
# Git checks
git diff --name-status 7d10b8fc HEAD -- tsconfig.server.json eslint.config.mjs test/   # empty
git status --porcelain                                                                # empty
git ls-tree -r --name-only 7d10b8fc test | wc -l; git ls-files test | wc -l          # 35 and 35
grep '"strict"' tsconfig.server.json                                                  # "strict": true

# Counts (Table of counts)
node count.js $R > counts.json            # per group totals and per-1000 rates
node count.js $R --files > files.tsv      # per file: lines, casts, double casts, non-null, unknown, index sigs
node count.js $R --list as_unknown_as     # also: as_all, nonnull, index_sig, note, as_uncommented, ...

# Cast reasons
node casts.js $R > casts.tsv              # one line per cast site: file:line, DBL flag, target type, expression
node classify.js casts.tsv                # bucket sizes; add "all" to print every cast in each bucket

# types.ts optional ratio, and T | null fields without JS precedent
node optional.js $R
bash nullcheck.sh $R

# grep cross-checks (false positives noted in "Notes on the counts")
F=$(find server -name '*.ts' ! -name '*.d.ts' ! -path 'server/libs/*')
grep -o 'as unknown as' $F | wc -l                                  # 109
grep -nE '@ts-(ignore|nocheck|expect-error)|eslint-disable' $F      # nothing
grep -n 'NOTE:' $F                                                  # 21 lines, constants.ts:26 is code
grep -cE "this\.router\.(get|post|patch|delete)\(" server/routers/ApiRouter.ts   # 203
```


### Scripts

Copied verbatim from the scratch directory so the numbers can be reproduced after it is gone.

#### count.js

```js
// Type-shortcut counter for the audiobookshelf Phase 3 audit.
// Usage: node count.js <repoRoot> [--list kind] [--json]
// Uses the TypeScript compiler API, so only real code nodes are counted
// (comments and string/template contents are never matched).
const path = require('path')
const fs = require('fs')
const repo = path.resolve(process.argv[2] || '.')
const ts = require(path.join(repo, 'node_modules/typescript'))
const listKind = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (path.relative(repo, p) === 'server/libs') continue
      walk(p, out)
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(path.relative(repo, p))
  }
  return out
}

function group(f) {
  if (f.startsWith('server/finders/') || f.startsWith('server/providers/') || f === 'server/controllers/SearchController.ts') return 'A'
  if (f.startsWith('server/utils/')) return 'B'
  if (f.startsWith('server/objects/') || f.startsWith('server/auth/') || f.startsWith('server/routers/')) return 'C'
  return '?'
}

const KINDS = ['as_all', 'as_const', 'as_unknown_as', 'nonnull', 'any', 'unknown', 'unknown_in_double_cast', 'record_string_unknown', 'object_kw', 'index_sig', 'declare_field', 'ts_directive', 'eslint_disable', 'note', 'as_uncommented']

function analyse(rel) {
  const text = fs.readFileSync(path.join(repo, rel), 'utf8')
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const c = Object.fromEntries(KINDS.map((k) => [k, 0]))
  const hits = Object.fromEntries(KINDS.map((k) => [k, []]))
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1
  const hit = (k, node) => {
    c[k]++
    const pos = typeof node === 'number' ? node : node.getStart(sf)
    hits[k].push(`${rel}:${lineOf(pos)}: ${text.split('\n')[lineOf(pos) - 1].trim().slice(0, 160)}`)
  }

  // comments: collect every leading/trailing comment range once
  const comments = new Map()
  const addRanges = (rs) => rs && rs.forEach((r) => comments.set(r.pos, r))
  const visitTrivia = (n) => {
    addRanges(ts.getLeadingCommentRanges(text, n.getFullStart()))
    addRanges(ts.getTrailingCommentRanges(text, n.getEnd()))
    n.getChildren(sf).forEach(visitTrivia)
  }
  visitTrivia(sf)
  addRanges(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()))
  const commentChar = new Uint8Array(text.length)
  const commentLines = new Set()
  for (const r of comments.values()) {
    commentChar.fill(1, r.pos, r.end)
    const body = text.slice(r.pos, r.end)
    for (let l = lineOf(r.pos); l <= lineOf(r.end); l++) commentLines.add(l)
    if (/@ts-(ignore|nocheck|expect-error)/.test(body)) hit('ts_directive', r.pos)
    if (/eslint-disable/.test(body)) hit('eslint_disable', r.pos)
    if (/\bNOTE:/.test(body)) hit('note', r.pos)
  }

  // lines: non-blank, and non-blank with some non-comment code
  const lines = text.split('\n')
  let nonBlank = 0, code = 0, off = 0
  for (const l of lines) {
    if (l.trim()) {
      nonBlank++
      for (let i = 0; i < l.length; i++) if (!/\s/.test(l[i]) && !commentChar[off + i]) { code++; break }
    }
    off += l.length + 1
  }

  const visit = (n) => {
    if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) {
      const isConst = ts.isTypeReferenceNode(n.type) && n.type.typeName.getText(sf) === 'const'
      if (isConst) hit('as_const', n)
      else {
        hit('as_all', n)
        // rule 4: comment on same line or line above
        const l = lineOf(n.type.getStart(sf))
        const startL = lineOf(n.getStart(sf))
        let ok = false
        for (let x = startL - 1; x <= l; x++) if (commentLines.has(x)) ok = true
        if (!ok) hit('as_uncommented', n)
      }
      // `X as unknown as T`: outer as whose expression is `... as unknown`
      const inner = ts.isParenthesizedExpression(n.expression) ? n.expression.expression : n.expression
      if (ts.isAsExpression(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword) hit('as_unknown_as', n)
      if (n.type.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(n.parent)) hit('unknown_in_double_cast', n)
    }
    if (ts.isNonNullExpression(n)) hit('nonnull', n)
    if (n.kind === ts.SyntaxKind.AnyKeyword) hit('any', n)
    if (n.kind === ts.SyntaxKind.UnknownKeyword) hit('unknown', n)
    if (n.kind === ts.SyntaxKind.ObjectKeyword) hit('object_kw', n)
    if (ts.isTypeReferenceNode(n) && n.typeName.getText(sf) === 'Record' && n.typeArguments && n.typeArguments.length === 2 &&
      n.typeArguments[1].kind === ts.SyntaxKind.UnknownKeyword) hit('record_string_unknown', n)
    if (ts.isIndexSignatureDeclaration(n)) hit('index_sig', n)
    if (ts.isPropertyDeclaration(n) && n.modifiers && n.modifiers.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) hit('declare_field', n)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  // `unknown` annotations, excluding the `unknown` that is only the middle of `as unknown as`
  c.unknown_annotations = c.unknown - c.unknown_in_double_cast
  return { rel, group: group(rel), nonBlank, code, c, hits }
}

const files = walk(path.join(repo, 'server'), []).sort()
const results = files.map(analyse)

if (listKind) {
  for (const r of results) for (const h of r.hits[listKind] || []) console.log(h)
  process.exit(0)
}
if (process.argv.includes('--files')) {
  for (const r of results) console.log([r.rel, r.group, r.nonBlank, r.code, r.c.as_all, r.c.as_unknown_as, r.c.nonnull, r.c.unknown_annotations, r.c.index_sig].join('\t'))
  process.exit(0)
}

const cols = ['as_all', 'as_unknown_as', 'nonnull', 'any', 'unknown_annotations', 'index_sig', 'declare_field', 'ts_directive', 'eslint_disable', 'note', 'record_string_unknown', 'object_kw', 'as_const', 'as_uncommented']
const out = []
for (const g of ['A', 'B', 'C', 'Total']) {
  const rs = g === 'Total' ? results : results.filter((r) => r.group === g)
  const sum = (k) => rs.reduce((a, r) => a + r.c[k], 0)
  const nonBlank = rs.reduce((a, r) => a + r.nonBlank, 0)
  const code = rs.reduce((a, r) => a + r.code, 0)
  const row = { group: g, files: rs.length, nonBlank, code }
  for (const k of cols) row[k] = sum(k), row[k + '_per_kloc'] = +((sum(k) * 1000) / code).toFixed(1)
  out.push(row)
}
console.log(JSON.stringify(out, null, 1))
const unknownGroup = results.filter((r) => r.group === '?')
if (unknownGroup.length) console.error('Files outside groups:', unknownGroup.map((r) => r.rel))
```

#### casts.js

```js
// Prints every non-const `as` cast: file:line <TAB> double? <TAB> target type <TAB> expression (first 80 chars)
const path = require('path'), fs = require('fs')
const repo = path.resolve(process.argv[2])
const ts = require(path.join(repo, 'node_modules/typescript'))
const files = require('child_process').execSync("find server -name '*.ts' ! -name '*.d.ts' ! -path 'server/libs/*'", { cwd: repo }).toString().trim().split('\n').sort()
for (const rel of files) {
  const text = fs.readFileSync(path.join(repo, rel), 'utf8')
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const visit = (n) => {
    if (ts.isAsExpression(n) && n.type.getText(sf) !== 'const') {
      const inner = ts.isParenthesizedExpression(n.expression) ? n.expression.expression : n.expression
      const dbl = ts.isAsExpression(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword
      if (!(n.type.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(n.parent))) {
        const expr = (dbl ? inner.expression : n.expression).getText(sf).replace(/\s+/g, ' ').slice(0, 80)
        console.log([`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`, dbl ? 'DBL' : '-', n.type.getText(sf).replace(/\s+/g, ' ').slice(0, 90), expr].join('\t'))
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
```

#### classify.js

```js
// Buckets each cast from casts.tsv by target type / expression. Rules are applied in order; first match wins.
const lines = require('fs').readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => l.split('\t'))
const rules = [
  ['null-init (null as unknown as T)', (d, t, e) => d && e === 'null'],
  ['d: dynamic key access (this/obj as Record or keyof)', (d, t, e) => /^Record<|^keyof |^Exclude<keyof/.test(t) && !/session/.test(e)],
  ['a: vendored or untyped library', (d, t, e) => /^(FsExtra|DateAndTime|ArchiverFactory|FuseConstructor|Ffprobe|LibArchive|SortInstance|ProfilerHistogram|typeof import\('crypto'\)|RraListItem|Function)/.test(t)],
  ['a: loosely typed third-party output (xml2js, openid-client, axios, node http)', (d, t, e) => /XmlElement|XmlAttributes|OpfMetadata|RssPodcastEnclosure|iTunesSearch|OverdriveMediaMarker|OpenIDClient|OidcStrategy|RequestError|\{ url\?: string\[\] \}|Parameters<typeof parseOpf|unknown\[\]|RssPodcastEpisode|AuthorASINObj|BookSearchResult|ScoredOpenLibrary/.test(t)],
  ['d: caught error as Error', (d, t) => t === 'Error'],
  ['b: Sequelize typing (Database view, query options, loaded rows, JSON columns)', (d, t, e) => /TypedDatabase|ApiDatabase|PatchModels|FindOptions|CountOptions|FindAndCountOptions|^Order$|Includeable|Row|With|Expanded|LibraryItem|Old[A-Z]|Podcast|Book|Author|Series|MediaProgress|PlaybackSession|User\[|InstanceType|CustomMetadataProvider|UserPermissions|PlaybackMediaMetadata|totalSize|totalDuration|numAudioFiles|mediaType|seriesHideFrom|librariesAccessible|getLibraryItemsIncrement|NewRecord|LibraryFilterData|SessionRow|\{ path: string \}|podcastEpisodes|include:|MetadataCreator|LibraryFileJSON|SeriesBookJson|CollapsedItemJson|oldLibraryId/.test(t)],
  ['b: Express/passport typing', (d, t, e) => /OidcQuery|ApiRouterApp|^User$|OidcUser|session/.test(t + ' ' + e)],
  ['c?: model JSDoc says a different type (bigint/Date/number)', (d, t, e) => /^(bigint|Date)$/.test(t) || (d && t === 'number' && /size|publishedYear/.test(e))],
  ['c?: drops null/undefined or widens a primitive without a check', (d, t) => /^(string|number|boolean|NodeJS\.Timeout|Buffer|URL|string \| undefined|string \| null|number \| null|string \| null \| undefined|string\[\]|Promise<boolean>|T|FileMetadataJSON|FileMetadata|AudioMetaTags|ServerGlobals|Partial<)/.test(t)],
  ['d: other', () => true]
]
const buckets = {}
for (const [loc, dbl, t, e] of lines) {
  const d = dbl === 'DBL'
  const [name] = rules.find(([, f]) => f(d, t, e))
  ;(buckets[name] ||= []).push(`${loc}\t${dbl}\t${t}\t${e}`)
}
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
  const dbl = v.filter((x) => x.split('\t')[1] === 'DBL').length
  console.log(`${v.length}\t(${dbl} as unknown as)\t${k}`)
  if (process.argv[3] === k.slice(0, 2) || process.argv[3] === 'all') v.forEach((x) => console.log('    ' + x))
}
```

#### optional.js

```js
// Per types.ts: property signatures, how many are optional, how many are typed unknown, index signatures
const path = require('path'), fs = require('fs')
const repo = path.resolve(process.argv[2])
const ts = require(path.join(repo, 'node_modules/typescript'))
const files = require('child_process').execSync("find server -name 'types.ts' ! -path 'server/libs/*'", { cwd: repo }).toString().trim().split('\n').sort()
for (const rel of files) {
  const sf = ts.createSourceFile(rel, fs.readFileSync(path.join(repo, rel), 'utf8'), ts.ScriptTarget.Latest, true)
  let props = 0, opt = 0, unk = 0, idx = 0
  const v = (n) => {
    if (ts.isPropertySignature(n)) { props++; if (n.questionToken) opt++; if (n.type && n.type.kind === ts.SyntaxKind.UnknownKeyword) unk++ }
    if (ts.isIndexSignatureDeclaration(n)) idx++
    ts.forEachChild(n, v)
  }
  v(sf)
  console.log(`${rel}\tprops=${props}\toptional=${opt}\tunknown=${unk}\tindexSigs=${idx}`)
}
```

#### nullcheck.sh

```sh
# For each `declare x: ... | null` field in group C, report fields whose original JS (7f280c67) never assigns null-ish to this.x
cd "$1"
for f in $(git ls-tree -r --name-only HEAD server/objects server/auth server/routers | grep '\.ts$' | grep -v types.ts); do
  js=$(git show 7f280c67:${f%.ts}.js 2>/dev/null) || continue
  grep -oE '^\s*declare (static )?[A-Za-z_]+: [^=]*\| null' "$f" | sed -E 's/^\s*declare (static )?([A-Za-z_]+):.*/\2/' | while read fld; do
    if ! echo "$js" | grep -qE "this\.$fld = [^\n]*null|this\.$fld = (null|[^=]*\|\| null|[^=]*\?\? null)|$fld: null"; then
      echo "$f: $fld"
    fi
  done
done
```
