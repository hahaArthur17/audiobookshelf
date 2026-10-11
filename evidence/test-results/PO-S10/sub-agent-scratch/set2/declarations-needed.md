# Set 2: declarations needed

## 1. REQUIRED: `semver` (untyped npm package)

- Target file: server/types/untypedModules.d.ts
- Exact text (also in set2/pending.d.ts):

```ts
// Used by server/managers/MigrationManager.ts. Only gt, lte and compare are called. A value that is not a version string makes them throw a TypeError, so the parameters are strings.
declare module 'semver' {
  export function gt(v1: string, v2: string): boolean
  export function lte(v1: string, v2: string): boolean
  export function compare(v1: string, v2: string): 1 | 0 | -1
}
```

- Needed by: server/managers/MigrationManager.ts line 8 (`import semver = require('semver')`); the calls are in init() (semver.gt), runMigrations() (semver.compare), initUmzug() (semver.compare in the sort) and findMigrationsToRun() (semver.gt, semver.lte).
- MigrationManager.ts already has `/// <reference path="../types/untypedModules.d.ts" />` as its first line.
- Until it is added, the normal check shows exactly one error:
  `server/managers/MigrationManager.ts(8,25): error TS7016: Could not find a declaration file for module 'semver'.`
  With set2/tsconfig.pending.json the file is clean.

## 2. OPTIONAL (no error remains without it): `embeddedCoverArt` on `Book.AudioFileObject`

- Target file: server/models/Book.ts, interface `AudioFileObject` inside `declare namespace Book` (line 63)
- Exact line: `embeddedCoverArt?: string | null // not in the JSDoc typedef: AudioFile.toJSON() stores it (null or the codec name of the embedded cover) and CoverManager.saveEmbeddedCoverArt() reads it`
- Needed by: server/managers/CoverManager.ts, saveEmbeddedCoverArt() (`af.embeddedCoverArt`, `audioFileWithCover.embeddedCoverArt`).
- CoverManager.ts currently adds the member locally with an intersection type (`type AudioFileObject = import('../models/Book').AudioFileObject & { embeddedCoverArt?: string | null }`, an annotation, not a cast), so the file is clean either way. If the field is added in Book.ts, the local intersection becomes redundant and still compiles.
