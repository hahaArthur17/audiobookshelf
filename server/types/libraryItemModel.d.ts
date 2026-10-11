/**
 * Declarations for server/models/LibraryItem.js, which is still JavaScript.
 *
 * Its static init(sequelize) does not match Model.init, so `typeof LibraryItem` is not a Sequelize ModelStatic and the
 * inherited static methods reject it as `this` (TS2684). A cast to ModelStatic<LibraryItem> is refused as well (TS2352).
 * This interface describes only the inherited static methods that the controllers call, so that a TypeScript caller can
 * use one single-step boundary cast: (Database.libraryItemModel as LibraryItemModelStatic).findAll(...)
 *
 * Pull it in with `import type { LibraryItemModelStatic } from '../types/libraryItemModel'` (erased when compiled).
 * This file is a module on purpose (it has exports). A declaration file with global declarations affects the global scope,
 * like `declare global`: the incremental build then recomputes every file and TypeScript 5.9.3 crashes ("Debug Failure").
 * Remove this file when LibraryItem.js is converted.
 *
 * LibraryItemInclude: Sequelize types a nested include as an array, but at runtime it also accepts a single one
 * (Model._conformIncludes wraps it), and the controllers pass a single one.
 */
export type LibraryItemInclude = import('sequelize').Includeable | (Omit<import('sequelize').IncludeOptions, 'include'> & { include?: LibraryItemInclude | LibraryItemInclude[] })
export type LibraryItemFindOptions = Omit<import('sequelize').FindOptions, 'include'> & { include?: LibraryItemInclude | LibraryItemInclude[] }
export interface LibraryItemModelStatic {
  findAll(options?: LibraryItemFindOptions): Promise<import('../models/LibraryItem')[]>
  findByPk(identifier?: import('sequelize').Identifier, options?: Omit<LibraryItemFindOptions, 'where'>): Promise<import('../models/LibraryItem') | null>
  count(options?: Omit<import('sequelize').CountOptions, 'group'>): Promise<number>
  create(values?: Record<string, unknown>, options?: import('sequelize').CreateOptions): Promise<import('../models/LibraryItem')>
}
