# Set 3: declarations needed

## For the converted file (server/scanner/AudioFileScanner.ts)

None. The file is clean without any new declaration.

## For a later run of server/scanner/LibraryScanner (restored in this run, so nothing waits for these now)

Target file: server/types/libraryItemModel.d.ts, inside `export interface LibraryItemModelStatic { ... }`.
Reason: LibraryItem.js is JavaScript and its inherited Sequelize statics fail with TS2684/TS2769 at a TypeScript caller. findAll, findByPk, count and create are declared; LibraryScanner also calls findOne and update.

    // inherited Model.findOne: LibraryScanner.scanFolderUpdates() calls it with attributes and where (LibraryScanner.js:514, :527, :613)
    findOne(options?: LibraryItemFindOptions): Promise<import('../models/LibraryItem') | null>
    // inherited Model.update: LibraryScanner.scanLibrary() marks the missing items with it (LibraryScanner.js:242)
    update(values: Record<string, unknown>, options: import('sequelize').UpdateOptions): Promise<[affectedCount: number]>

These two declarations are not enough to convert LibraryScanner: see section 2 of report.md for the errors that no declaration resolves.
