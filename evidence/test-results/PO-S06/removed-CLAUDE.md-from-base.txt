# Context for the JavaScript to TypeScript migration of server/

Goal: migrate the Audiobookshelf server (server/, excluding server/libs/) from JavaScript to TypeScript with meaningful types. server/finders/ is already done. Use PodcastFinder.ts, AuthorFinder.ts and BookFinder.ts as worked examples. The spec and plan for the finders are in evidence/plans/ (reference only; you do not need to follow their step-by-step process).

## Scope and order

- Out of scope (do not convert): server/libs/ (vendored), server/migrations/ (MigrationManager copies and loads these files by name at runtime) and server/utils/htmlEntities.js (a 2,234-line file that would inflate the progress count).
- Work leaf-first: start with files that have no relative require(), preferring those that have tests. Then convert files that depend only on files already converted.
- Start with these files: utils/parsers/parseNfoMetadata.js, utils/parsers/parseFullName.js, utils/areEquivalent.js, objects/TrackProgressMonitor.js, objects/Task.js, objects/Notification.js, objects/metadata/AudioMetaTags.js, providers/OpenLibrary.js, models/BookAuthor.js, models/PlaylistMediaItem.js, models/Session.js, models/CustomMetadataProvider.js, models/MediaItemShare.js, models/Collection.js.
- Leave the root files (Server.js, Database.js and the like) and the controllers for last, because they depend on shared global state.
- If converting a provider makes a cast in server/finders/ unnecessary, you may remove that cast. Note it in the commit message.

## Rules

1. Type-only migration. Do not change runtime behaviour and do not fix bugs. List any bug you find in evidence/test-results/PO-S01/found-bugs.md.
2. Rename with `git mv x.js x.ts` so the history follows the file.
3. Keep the CommonJS shape: `import x = require('...')` and `export = ...`. What a JavaScript caller gets from require() must stay identical.
4. Do not use `any`, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, `as any` or `as unknown as`. Use `as` only at a boundary where an untyped JavaScript module returns a wrong or too-vague type. Make it a single-step cast and add a short comment saying why.
5. Do not edit test/, tsconfig.server.json, package.json or package-lock.json. Do not install packages. Do not push, merge, rebase or reset.
6. Do not edit the vendored code in server/libs/.
7. Leave existing JSDoc comments unchanged.
8. Use targeted edits, not whole-file rewrites (a rewrite once turned a regex escape into a literal character).

## Checks (after every file or small group)

- `npm run build:server` must pass.
- `npm test` must show 356 passing.
- Commit each passing step with the message `[PO-S01] <file>: migrate to TypeScript`.
- If a file cannot be made to pass within these rules, restore it and move on to another file.

## Pitfalls found in the finders

- TypeScript 5.9.3 can crash ("Debug Failure. False expression") in an incremental build right after a bare rename, and when you use `declare global`. Add the imports and types in the same edit as the rename. A non-incremental, no-emit check shows the real errors (see evidence/test-results/SP-S01/red-PodcastFinder.txt and tsconfig.redcheck.json).
- Never run `tsc --declaration` on the whole program: it crashes on the vendored files in server/libs/archiver.
- For a global that is set elsewhere (for example global.MetadataPath), declare it file-locally: `declare const global: typeof globalThis & { MetadataPath: string }`. Do not use `declare global`.
- Untyped helpers in server/utils return `any` (no JSDoc). Annotate the destructured import with the real types instead of adding a cast at each call site.
- `export =` moves `module.exports = ...` to the end of the compiled file. That is harmless only when nothing but function declarations follow it.
- Keep any `Number(...)` rewrite to the minimum and name it in the commit message.
