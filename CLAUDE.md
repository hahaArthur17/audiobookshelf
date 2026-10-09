# Context for the JavaScript to TypeScript migration of server/

Goal: migrate the Audiobookshelf server (server/, minus the out-of-scope list below) from JavaScript to TypeScript with meaningful types, type-only.
Done so far: server/finders/ and 11 more files (see git log for [PO-S01]). Use them as worked examples.
The spec and plan for the finders are in evidence/plans/ (reference only).

## Scope and order
- Out of scope: server/libs/ (vendored), server/migrations/ (MigrationManager copies and loads these by name), server/utils/htmlEntities.js (a data table), server/models/ is IN scope from stage PO-S03, using the uncallable-overload pattern below. Convert models only after the settings classes they depend on.
- Work leaf-first: files with no relative require() first, preferring files that have tests; then files whose relative requires point only at files already converted.
- Leave the root files (Server.js, Database.js, Auth.js and the like) for last.

## Rules
1. Type-only: no change in runtime behaviour, no bug fixes. List any bug you find in the bug log named in the task.
2. Rename with `git mv x.js x.ts`.
3. Keep the CommonJS shape: `import x = require('...')` and `export = ...`. What a JavaScript caller gets from require() must stay identical. For types from a package use `import type { ... } from '...'` (erased when compiled).
4. Banned: any, @ts-ignore, @ts-nocheck, @ts-expect-error, as any, as unknown as.
5. Allowed, with a one-line comment each time: a class or payload/data-interface index signature ([key: string]: unknown) where the code assigns or reads by a dynamic key; an import type that replaces a require of names that are undefined at runtime (name it in the commit message); and, as before: a non-null assertion (!) where a field starts as null and is set before it is read; a class index signature ([key: string]: unknown) where the code assigns by a dynamic key; a single-step `as` cast only at a boundary where an untyped module returns a wrong or too-vague type.
6. Do not edit test/, tsconfig.server.json, package.json, package-lock.json or server/libs/. Do not install packages. Do not push, merge, rebase, reset or clean.
7. Leave existing JSDoc comments unchanged. Use targeted edits, not whole-file rewrites.

## Checks (after every file or small group)
- npm run build:server must pass, and npm test must show 356 passing.
- Commit each passing step with the prefix given in the task.
- If a file cannot pass within these rules, restore it (git mv back, git restore that one file), say why, and do not commit it.

## Pitfalls found so far
- Class fields: declare them with `declare` (the target is ES2022; a plain field would compile to a real field that starts as undefined and changes behaviour).
- Comments: a comment directly above an interface or type disappears when compiled, and TypeScript drops comments placed above `export =`. Put new types above existing JSDoc blocks, and leave a blank line after a file-header comment.
- TypeScript 5.9.3 can crash ("Debug Failure. False expression") in an incremental build right after a bare rename, or with `declare global`. Add the imports and types in the same edit as the rename. A non-incremental, no-emit check shows the real errors (see evidence/test-results/SP-S01/tsconfig.redcheck.json). Never run `tsc --declaration` on the whole program.
- Globals set elsewhere: declare them in the file (`declare const global: typeof globalThis & { MetadataPath: string }`). Never use `declare global`.
- Untyped npm packages: describe only what is used in server/types/untypedModules.d.ts and pull it in with `/// <reference path="...">` (tsconfig excludes *.d.ts). Types for express, cookie-parser, express-session, passport and passport-jwt are installed (@types).
- Untyped helpers in server/utils return any. Annotate the destructured import once instead of casting at each call.
- `export =` moves `module.exports = ...` to the end of the compiled file. That is only safe when nothing but function declarations follow it.
- server/libs/fsExtra has an inferred type without writeFile and other methods, because they are added in a loop. One boundary cast per call site is allowed, with a comment.

## Sequelize models (D3, from the PO-S02 spike on Setting.js)
- Do not touch the base class. Declare fields with `declare`. Keep `static init(sequelize: Sequelize): void` as the real signature, and add this uncallable overload directly above it: `static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces`.
- Put the JSDoc of init ABOVE the overloads. TypeScript erases overloads, and a comment attached to one disappears from the compiled file.
- Untyped JS constructors with a `settings = null` default are inferred as taking null: convert those classes first (EmailSettings, NotificationSettings, ServerSettings), then the models that use them. A cast at a constructor call is a last resort and needs a comment.
- Convert models one at a time, with a build and 356 tests after each. If a model does not fit, restore it, record the compiler errors in the commit-free notes, and move on.

## Settings (important)
- Only Edit(path) deny rules work; Write(path) rules are ignored (Claude Code warns about them). Edit rules cover all file-editing tools. Shell commands that write files are not covered by any rule.
## Type check without building (PO-S03)
- Run `npx tsc -p tsconfig.check.json` for a no-emit check. It writes nothing, so it is safe to run while other agents work. Filter its output to your own folder (for example with grep "^server/utils/").
- Only the main agent runs `npm run build:server` and `npm test`, and only the main agent commits.
