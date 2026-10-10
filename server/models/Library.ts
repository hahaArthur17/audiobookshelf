import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'
import Logger = require('../Logger')

type LibraryFolder = import('./LibraryFolder')

// Type-only: keeps import('../models/Library').LibrarySettingsObject (used by the scanners) resolvable after export = Library
declare namespace Library {
  // The typedef lists every key as required. The keys marked optional are the ones getDefaultLibrarySettingsForMediaType() leaves out for one of the two media types;
  // epubsAllowScriptedContent and podcastSearchRegion are set there but missing from the typedef; the two null defaults are typed as nullable.
  interface LibrarySettingsObject {
    coverAspectRatio: number
    disableWatcher: boolean
    skipMatchingMediaWithAsin?: boolean
    skipMatchingMediaWithIsbn?: boolean
    autoScanCronExpression: string | null
    audiobooksOnly?: boolean
    epubsAllowScriptedContent?: boolean
    hideSingleBookSeries?: boolean
    onlyShowLaterBooksInContinueSeries?: boolean
    metadataPrecedence?: string[]
    podcastSearchRegion?: string
    markAsFinishedTimeRemaining: number
    markAsFinishedPercentComplete: number | null
  }
}
type LibrarySettingsObject = Library.LibrarySettingsObject

/**
 * @typedef LibrarySettingsObject
 * @property {number} coverAspectRatio BookCoverAspectRatio
 * @property {boolean} disableWatcher
 * @property {boolean} skipMatchingMediaWithAsin
 * @property {boolean} skipMatchingMediaWithIsbn
 * @property {string} autoScanCronExpression
 * @property {boolean} audiobooksOnly
 * @property {boolean} hideSingleBookSeries Do not show series that only have 1 book
 * @property {boolean} onlyShowLaterBooksInContinueSeries Skip showing books that are earlier than the max sequence read
 * @property {string[]} metadataPrecedence
 * @property {number} markAsFinishedTimeRemaining Time remaining in seconds to mark as finished. (defaults to 10s)
 * @property {number} markAsFinishedPercentComplete Percent complete to mark as finished (0-100). If this is set it will be used over markAsFinishedTimeRemaining.
 */

class Library extends Model {
  declare id: string
  declare name: string
  declare displayOrder: number
  declare icon: string
  declare mediaType: string
  declare provider: string
  declare lastScan: Date | null // null until the first scan (toOldJSON() reads it with ?.); the JSDoc says Date
  declare lastScanVersion: string
  declare settings: LibrarySettingsObject
  declare extraData: { lastScanMetadataPrecedence?: string[] } | null // the JSDoc says Object; lastScanMetadataPrecedence is the only key this file reads, and it reads it with ?.
  declare createdAt: Date
  declare updatedAt: Date
  declare libraryFolders?: LibraryFolder[]
  declare static readonly sequelize: Sequelize // set by init() before any query runs (optional in Sequelize's typings)

  constructor(values?: CreationAttributes<Library>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.name
    /** @type {number} */
    this.displayOrder
    /** @type {string} */
    this.icon
    /** @type {string} */
    this.mediaType
    /** @type {string} */
    this.provider
    /** @type {Date} */
    this.lastScan
    /** @type {string} */
    this.lastScanVersion
    /** @type {LibrarySettingsObject} */
    this.settings
    /** @type {Object} */
    this.extraData
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
    /** @type {import('./LibraryFolder')[]|undefined} */
    this.libraryFolders
  }

  /**
   *
   * @param {string} mediaType
   * @returns
   */
  static getDefaultLibrarySettingsForMediaType(mediaType: string) {
    if (mediaType === 'podcast') {
      return {
        coverAspectRatio: 1, // Square
        disableWatcher: false,
        autoScanCronExpression: null,
        podcastSearchRegion: 'us',
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10
      }
    } else {
      return {
        coverAspectRatio: 1, // Square
        disableWatcher: false,
        autoScanCronExpression: null,
        skipMatchingMediaWithAsin: false,
        skipMatchingMediaWithIsbn: false,
        audiobooksOnly: false,
        epubsAllowScriptedContent: false,
        hideSingleBookSeries: false,
        onlyShowLaterBooksInContinueSeries: false,
        metadataPrecedence: this.defaultMetadataPrecedence,
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10
      }
    }
  }

  static get defaultMetadataPrecedence() {
    return ['folderStructure', 'audioMetatags', 'nfoFile', 'txtFiles', 'opfFile', 'absMetadata']
  }

  /**
   *
   * @returns {Promise<Library[]>}
   */
  static getAllWithFolders() {
    return this.findAll({
      include: this.sequelize.models.libraryFolder,
      order: [['displayOrder', 'ASC']]
    })
  }

  /**
   *
   * @param {string} libraryId
   * @returns {Promise<Library>}
   */
  static findByIdWithFolders(libraryId: string) {
    return this.findByPk(libraryId, {
      include: this.sequelize.models.libraryFolder
    })
  }

  /**
   * Get all library ids
   * @returns {Promise<string[]>} array of library ids
   */
  static async getAllLibraryIds() {
    const libraries = await this.findAll({
      attributes: ['id', 'displayOrder'],
      order: [['displayOrder', 'ASC']]
    })
    return libraries.map((l) => l.id)
  }

  /**
   * Get the largest value in the displayOrder column
   * Used for setting a new libraries display order
   * @returns {Promise<number>}
   */
  static async getMaxDisplayOrder() {
    return (await this.max<number, Library>('displayOrder')) || 0
  }

  /**
   * Updates displayOrder to be sequential
   * Used after removing a library
   */
  static async resetDisplayOrder() {
    const libraries = await this.findAll({
      order: [['displayOrder', 'ASC']]
    })
    for (let i = 0; i < libraries.length; i++) {
      const library = libraries[i]
      if (library.displayOrder !== i + 1) {
        Logger.debug(`[Library] Updating display order of library from ${library.displayOrder} to ${i + 1}`)
        await library.update({ displayOrder: i + 1 }).catch((error) => {
          Logger.error(`[Library] Failed to update library display order to ${i + 1}`, error)
        })
      }
    }
  }

  static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces
  static init(sequelize: Sequelize): void
  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize: Sequelize): void {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        displayOrder: DataTypes.INTEGER,
        icon: DataTypes.STRING,
        mediaType: DataTypes.STRING,
        provider: DataTypes.STRING,
        lastScan: DataTypes.DATE,
        lastScanVersion: DataTypes.STRING,
        settings: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'library'
      }
    )
  }

  get isPodcast() {
    return this.mediaType === 'podcast'
  }
  get isBook() {
    return this.mediaType === 'book'
  }
  /**
   * @returns {string[]}
   */
  get lastScanMetadataPrecedence() {
    return this.extraData?.lastScanMetadataPrecedence || []
  }

  /**
   * @returns {LibrarySettingsObject}
   */
  get librarySettings(): LibrarySettingsObject {
    return this.settings || Library.getDefaultLibrarySettingsForMediaType(this.mediaType)
  }

  /**
   * TODO: Update to use new model
   */
  toOldJSON() {
    return {
      id: this.id,
      name: this.name,
      folders: (this.libraryFolders || []).map((f) => f.toOldJSON()),
      displayOrder: this.displayOrder,
      icon: this.icon,
      mediaType: this.mediaType,
      provider: this.provider,
      settings: {
        ...this.settings
      },
      lastScan: this.lastScan?.valueOf() || null,
      lastScanVersion: this.lastScanVersion,
      createdAt: this.createdAt.valueOf(),
      lastUpdate: this.updatedAt.valueOf()
    }
  }
}

export = Library
