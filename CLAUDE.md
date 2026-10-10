# Context for the JavaScript to TypeScript migration of server/

Goal: migrate the Audiobookshelf server (server/, minus the out-of-scope list below) from JavaScript to TypeScript with meaningful types, type-only.
Done so far: server/finders/, 24 of the 25 files in server/models/ (LibraryItem.js is still JavaScript), and files in auth/, managers/, objects/, providers/, routers/, scanner/ and utils/ (see git log for [PO-S01] to [PO-S07]). Use them as worked examples. The current run (PO-S08) converts server/controllers/; CacheController.ts is the one controller already converted.
The spec and plan for the finders are in evidence/plans/ (reference only).

## Scope and order
- Out of scope: server/libs/ (vendored), server/migrations/ (MigrationManager copies and loads these by name), server/utils/htmlEntities.js (a data table), server/models/ is IN scope from stage PO-S03, using the uncallable-overload pattern below. Convert models only after the settings classes they depend on.
- Work leaf-first: files with no relative require() first, preferring files that have tests; then files whose relative requires point only at files already converted.
- Leave the root files (Server.js, Database.js, Auth.js and the like) for last.
- Controllers (PO-S08): the 22 remaining controllers in server/controllers/ are in scope. A controller may require JavaScript files that are not converted yet (Logger, Database, SocketAuthority, utils/index, scanner/, managers/ and so on), so the leaf-first order does not apply to controllers. Do not edit or convert server/routers/ApiRouter.js, server/Server.js or any other file outside server/controllers/ in this run.

## Rules
1. Type-only: no change in runtime behaviour, no bug fixes. List any bug you find in the bug log named in the task.
2. Rename with `git mv x.js x.ts`.
3. Keep the CommonJS shape: `import x = require('...')` and `export = ...`. What a JavaScript caller gets from require() must stay identical. For types from a package use `import type { ... } from '...'` (erased when compiled).
4. Banned: any, @ts-ignore, @ts-nocheck, @ts-expect-error, as any, as unknown as.
5. Allowed, with a one-line comment each time: a class or payload/data-interface index signature ([key: string]: unknown) where the code assigns or reads by a dynamic key; an import type that replaces a require of names that are undefined at runtime (name it in the commit message); a non-null assertion (!) where a field starts as null and is set before it is read; a single-step `as` cast only at a boundary where an untyped module returns a wrong or too-vague type. Controllers (PO-S08) have three more allowances, listed in the section "Controllers and Express" and nowhere else.
6. Do not edit test/, tsconfig.server.json, package.json, package-lock.json or server/libs/. Do not install packages. Do not push, merge, rebase, reset or clean.
7. Leave existing JSDoc comments unchanged. Use targeted edits, not whole-file rewrites.

## Checks (after every file or small group)
- npm run build:server must pass, and npm test must show 375 passing (356 original tests plus 19 added in PO-S07).
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
- Do not touch the base class. Declare fields with `declare`. Write init as two overloads followed by the implementation, in this order. First the uncallable overload: `static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces`. Then the real signature as a second overload: `static init(sequelize: Sequelize): void` (without it, a TypeScript caller of init gets TS2684). Then the JSDoc of init. Then the implementation: `static init(sequelize: Sequelize): void { ... }`.
- The JSDoc of init goes BELOW both overloads, directly above the implementation. TypeScript erases overloads together with any comment attached to them, so a JSDoc above the first overload disappears from the compiled file (checked in PO-S04).
- Declare the constructor parameters as optional: `constructor(values?: CreationAttributes<X>, options?: BuildOptions)`. Sequelize needs the class to be callable as `new () => X` for calls such as `this.findAll()` and `hasMany`; required parameters fail with TS2684.
- Import shape that worked in PO-S04 (the compiled file stays almost equal to the original): `import sequelizeModule = require('sequelize')`, then `const { DataTypes, Model } = sequelizeModule`, then `import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'`. After each model, compare its compiled file with the baseline copy if the task names one: only the require lines may differ.
- Untyped JS constructors with a `settings = null` default are inferred as taking null: convert those classes first (EmailSettings, NotificationSettings, ServerSettings), then the models that use them. A cast at a constructor call is a last resort and needs a comment.
- Convert models one at a time, with a build and 375 tests after each. If a model does not fit, restore it, record the compiler errors in the commit-free notes, and move on.

## Settings (important)
- Only Edit(path) deny rules work; Write(path) rules are ignored (Claude Code warns about them). Edit rules cover all file-editing tools. Shell commands that write files are not covered by any rule.
## Type check without building (PO-S03)
- Run `npx tsc -p tsconfig.check.json` for a no-emit check. It writes nothing, so it is safe to run while other agents work. Filter its output to your own folder (for example with grep "^server/utils/").
- Only the main agent runs `npm run build:server` and `npm test`, and only the main agent commits.
- In server/controllers/ all files are in one folder, so filter by file name, for example grep -E "^server/controllers/(Series|Search)Controller". Other agents' half-finished files also show up in an unfiltered check.

## Controllers and Express (PO-S08, from a spike on four controllers)
- Imports. `const { Request, Response, NextFunction } = require('express')` becomes `import type { NextFunction, Request, Response } from 'express'` (these names are undefined at runtime; say so in the commit message). A destructured require of a JavaScript module becomes `import x = require('../utils')` followed by `const { a, b } = x`. Every other require becomes `import x = require('...')`. End the file with `export = new XController()`.
- Request types. The JSDoc typedefs (RequestWithUser and the like) become TypeScript types, placed above the existing JSDoc block, with the same names: `type User = import('../models/User')` and `type RequestWithUser = Request & { user: User }`. A property that a middleware sets (req.series, req.library, req.libraryItem, req.backup, req.files and so on) is a required property in the type used by the handlers and an optional property in the type used by the middleware that sets it. Describe an uploaded file with a small local type that has only the members the code uses.
- Query, params and body. Do not cast each use of req.query. Use the generics of Request once per controller: `Request<{ id?: string }, unknown, Body, Query>`, where Query is a local type such as `{ include?: string; limit?: string }` with one comment saying that query values are assumed to be strings (the original code assumes this, for example when it calls .split). Where the code reads req.body by a dynamic key, use a body type with an index signature (rule 5, with a comment). Allowance 1: if the compiler calls a comparison impossible (TS2367, for example a query value compared with the number 1), write `(query.podcast as unknown) === 1` with a comment, add it to the bug log, and do not change the comparison.
- this. ApiRouter binds controller methods with .bind(this), so `this` is the ApiRouter instance. Add an erased first parameter: `getAll(this: ApiRouter, req: RequestWithUser, res: Response)` with `type ApiRouter = import('../routers/ApiRouter')`. It disappears when compiled and callers are unaffected. Methods that read this.backupManager, this.auth, this.podcastManager and the like need it, including middleware methods that have no @this tag. Do not add it to methods that never use this.
- Catch variables are unknown. Allowance 2: write `(error as Error).message` with a one-line comment at the first use in each file (later uses in the same file need no comment). Where the code tests `error instanceof SomeClass` first, narrow with instanceof and do not cast.
- Objects that get properties added after toOldJSON(), or that are built as `{}` and filled by key: widen the local variable with an intersection annotation (`ReturnType<Series['toOldJSON']> & { progress?: ... }`) or an index-signature type with a comment. This is an annotation, not a cast.
- Globals: `declare const global: typeof globalThis & { XAccel?: string }` in the file (the same pattern as in ServerSettings.ts).
- A call into an already converted file whose parameter type is too narrow (for example BookFinder.search takes a weak MatchLibraryItem type that a podcast item shares no property with): do not edit that file. Allowance 3: one single-step cast at the call site, for example `libraryItem as Parameters<typeof BookFinder.search>[0]`, with a comment, named in your report.
- A JavaScript file that a controller calls and that returns any or a wrong type: annotate the destructured import once, as in "Pitfalls".
- Behaviour check. Apart from types, imports, `this` parameters and the allowed comments, the code of a converted file must stay the same line by line (check with git diff -M). A new variable, a changed expression or a changed order of statements is a behaviour change: undo it. Real bugs that you notice (for example an unguarded req.files, a comparison that can never be true) go in the bug log, not in the code.
