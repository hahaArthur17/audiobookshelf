/**
 * Declarations for server/models/LibraryItem.js, which is still JavaScript.
 *
 * Its static init(sequelize) does not match Model.init, so `typeof LibraryItem` is not a Sequelize ModelStatic and the
 * inherited static methods reject it as `this` (TS2684). A cast to ModelStatic<LibraryItem> is refused as well (TS2352).
 * This interface describes only the inherited static methods that the controllers call, so that a TypeScript caller can
 * use one single-step boundary cast: (Database.libraryItemModel as LibraryItemModelStatic).findAll(...)
 *
 * Pull it in with /// <reference path="../types/libraryItemModel.d.ts" /> (tsconfig excludes *.d.ts).
 * Remove this file when LibraryItem.js is converted.
 */
interface LibraryItemModelStatic {
  findAll(options?: import('sequelize').FindOptions): Promise<import('../models/LibraryItem')[]>
  findByPk(identifier?: import('sequelize').Identifier, options?: Omit<import('sequelize').FindOptions, 'where'>): Promise<import('../models/LibraryItem') | null>
  count(options?: Omit<import('sequelize').CountOptions, 'group'>): Promise<number>
  create(values?: Record<string, unknown>, options?: import('sequelize').CreateOptions): Promise<import('../models/LibraryItem')>
}
