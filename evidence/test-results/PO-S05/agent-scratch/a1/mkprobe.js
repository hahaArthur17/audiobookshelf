// Builds a first-pass TypeScript copy of LibraryItem in the scratchpad (nothing is written to the repo).
const fs = require('fs')
const path = require('path')
const repo = 'D:/SEM-2/574/Project/audiobookshelf-po'
let s = fs.readFileSync(path.join(repo, 'server/models/LibraryItem.js'), 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'
s = s.replace(/\r\n/g, '\n')
function rep(a, b) {
  const i = s.indexOf(a)
  if (i < 0) throw new Error('not found: ' + a.slice(0, 60))
  if (s.indexOf(a, i + 1) >= 0) throw new Error('not unique: ' + a.slice(0, 60))
  s = s.slice(0, i) + b + s.slice(i + a.length)
}
rep(`const Path = require('path')
const { DataTypes, Model } = require('sequelize')
const fsExtra = require('../libs/fsExtra')
const Logger = require('../Logger')
const libraryFilters = require('../utils/queries/libraryFilters')
const { filePathToPOSIX, getFileTimestampsWithIno } = require('../utils/fileUtils')
const LibraryFile = require('../objects/files/LibraryFile')
const Book = require('./Book')
const Podcast = require('./Podcast')
`, `import Path = require('path')
import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BindOrReplacements, BuildOptions, CreationAttributes, FindOptions, Includeable, Sequelize, WhereOptions } from 'sequelize'
import fsExtra = require('../libs/fsExtra')
import Logger = require('../Logger')
import libraryFilters = require('../utils/queries/libraryFilters')
import fileUtils = require('../utils/fileUtils')
const { filePathToPOSIX, getFileTimestampsWithIno } = fileUtils
import LibraryFile = require('../objects/files/LibraryFile')
import Book = require('./Book')
import Podcast = require('./Podcast')

type Library = import('./Library')
type User = import('./User')
type Author = import('./Author')

declare const global: typeof globalThis & { MetadataPath: string; ServerSettings: { storeMetadataWithItem: boolean; metadataFileFormat: string } }

// Type-only: keeps import('./LibraryItem').LibraryItemExpanded and .LibraryFileObject resolvable after export = LibraryItem
declare namespace LibraryItem {
  interface LibraryFileObject {
    ino: string
    isSupplementary: boolean
    addedAt: number
    updatedAt: number
    metadata: { filename: string; ext: string; path: string; relPath: string; size: number; mtimeMs: number; ctimeMs: number; birthtimeMs: number }
  }
  interface LibraryItemExpandedProperties {
    media: Book.BookExpanded | Podcast
  }
  type LibraryItemExpanded = LibraryItem & LibraryItemExpandedProperties
}
type LibraryFileObject = LibraryItem.LibraryFileObject
type LibraryItemExpanded = LibraryItem.LibraryItemExpanded
`)
rep(`class LibraryItem extends Model {
  constructor(values, options) {`, `class LibraryItem extends Model {
  declare static readonly sequelize: Sequelize // set by init() before any query runs
  declare readonly sequelize: Sequelize & { uppercaseFirst(str: string): string } // Database.js adds uppercaseFirst to the instance
  declare id: string
  declare ino: string
  declare path: string
  declare relPath: string
  declare mediaId: string
  declare mediaType: string
  declare isFile: boolean
  declare isMissing: boolean
  declare isInvalid: boolean
  declare mtime: Date
  declare ctime: Date
  declare birthtime: Date
  declare size: number
  declare lastScan: Date
  declare lastScanVersion: string
  declare libraryFiles: LibraryFileObject[]
  declare extraData: { oldLibraryItemId?: string } | null
  declare libraryId: string
  declare libraryFolderId: string
  declare createdAt: Date
  declare updatedAt: Date
  declare media: Book.BookExpanded | Podcast
  declare title: string
  declare titleIgnorePrefix: string
  declare authorNamesFirstLast: string
  declare authorNamesLastFirst: string

  constructor(values?: CreationAttributes<LibraryItem>, options?: BuildOptions) {`)
rep(`static getLibraryItemsIncrement(offset, limit, where = null) {`, `static getLibraryItemsIncrement(offset: number, limit: number, where: WhereOptions | null = null) {`)
rep(`static removeById(libraryItemId) {`, `static removeById(libraryItemId: string) {`)
rep(`static async findAllExpandedWhere(where = null) {`, `static async findAllExpandedWhere(where: WhereOptions | null = null) {`)
rep(`static async getExpandedById(libraryItemId) {`, `static async getExpandedById(libraryItemId: string) {`)
rep(`static async findOneExpanded(where, replacements = null, include = null) {`, `static async findOneExpanded(where: WhereOptions, replacements: BindOrReplacements | null = null, include: Includeable | Includeable[] | null = null) {`)
rep(`static async getByFilterAndSort(library, user, options) {`, `static async getByFilterAndSort(library: Library, user: User, options: object) {`)
rep(`static async getPersonalizedShelves(library, user, include, limit) {`, `static async getPersonalizedShelves(library: Library, user: User, include: string[], limit: number) {`)
rep(`const timed = async (loader) => {`, `const timed = async <T>(loader: () => Promise<T>) => {`)
rep(`static async getForAuthor(author, user = null) {`, `static async getForAuthor(author: Author, user: User | null = null) {`)
rep(`static async checkExistsById(libraryItemId) {`, `static async checkExistsById(libraryItemId: string) {`)
rep(`static async getCoverPath(libraryItemId) {`, `static async getCoverPath(libraryItemId: string) {`)
rep(`  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {`, `  static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces
  static init(sequelize: Sequelize): void
  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize: Sequelize): void {`)
rep(`  getMedia(options) {`, `  getMedia(options?: FindOptions) {`)
rep(`  getAudioFileWithIno(ino) {`, `  getAudioFileWithIno(ino: string) {`)
rep(`  getTrackList(episodeId) {`, `  getTrackList(episodeId?: string) {`)
rep(`  getLibraryFileWithIno(ino) {`, `  getLibraryFileWithIno(ino: string) {`)
rep(`module.exports = LibraryItem`, `export = LibraryItem`)
fs.writeFileSync(path.join(process.argv[2], 'LibraryItem.probe.ts'), s.replace(/\n/g, nl))
console.log('ok, eol=' + JSON.stringify(nl), 'lines=' + s.split('\n').length)
