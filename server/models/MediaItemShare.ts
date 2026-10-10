import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BelongsToGetAssociationMixin, BindOrReplacements, BuildOptions, CreationAttributes, FindOptions, IncludeOptions, Sequelize, WhereOptions } from 'sequelize'

type Book = import('./Book')
type PodcastEpisode = import('./PodcastEpisode')

type LibraryItemExpanded = import('./LibraryItem').LibraryItemExpanded

/** Registry entry this file reads by name. LibraryItem is still JavaScript and its JSDoc marks replacements and include as optional, while both default to null and the call below passes null, so the one static used here is described by hand */
type RegisteredModels = { libraryItem: { findOneExpanded(where: WhereOptions, replacements?: BindOrReplacements | null, include?: IncludeOptions | null): Promise<LibraryItemExpanded> } }

// Type-only: keeps import('../models/MediaItemShare').MediaItemShareObject, .MediaItemShareModel and .MediaItemShareForClient (read by managers/ShareManager.ts) resolvable after export = MediaItemShare
declare namespace MediaItemShare {
  interface MediaItemShareObject {
    id: string
    mediaItemId: string
    mediaItemType: string
    slug: string
    pash: string
    userId: string
    expiresAt: Date | null // null for a permanent share (ShareManager only schedules a share that has expiresAt); the typedef says Date
    extraData: Record<string, unknown>
    createdAt: Date
    updatedAt: Date
    isDownloadable: boolean
  }
  type MediaItemShareModel = MediaItemShareObject & MediaItemShare
  interface MediaItemShareForClient {
    id: string
    mediaItemId: string
    mediaItemType: string
    slug: string
    expiresAt: Date | null // null for a permanent share; the typedef says Date
    createdAt: Date
    updatedAt: Date
    isDownloadable: boolean
  }
}

/**
 * @typedef MediaItemShareObject
 * @property {UUIDV4} id
 * @property {UUIDV4} mediaItemId
 * @property {string} mediaItemType
 * @property {string} slug
 * @property {string} pash
 * @property {UUIDV4} userId
 * @property {Date} expiresAt
 * @property {Object} extraData
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {boolean} isDownloadable
 *
 * @typedef {MediaItemShareObject & MediaItemShare} MediaItemShareModel
 */

/**
 * @typedef MediaItemShareForClient
 * @property {UUIDV4} id
 * @property {UUIDV4} mediaItemId
 * @property {string} mediaItemType
 * @property {string} slug
 * @property {Date} expiresAt
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {boolean} isDownloadable
 */

class MediaItemShare extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: 'book' | 'podcastEpisode' // the JSDoc says string; these are the two values the associations in init() are scoped to, and getMediaItem() builds a mixin name from them
  declare slug: string
  declare pash: string
  declare userId: string
  declare expiresAt: Date | null // null for a permanent share (ShareManager only schedules a share that has expiresAt); the JSDoc says Date
  declare extraData: Record<string, unknown>
  declare createdAt: Date
  declare updatedAt: Date
  declare isDownloadable: boolean
  declare mediaItem: Book | PodcastEpisode
  declare book?: Book // set by a query that includes book; the afterFind hook moves it to mediaItem and deletes it
  declare podcastEpisode?: PodcastEpisode // set by a query that includes podcastEpisode; the afterFind hook moves it to mediaItem and deletes it
  declare getBook: BelongsToGetAssociationMixin<Book> // mixin added by belongsTo(book) in init()
  declare getPodcastEpisode: BelongsToGetAssociationMixin<PodcastEpisode> // mixin added by belongsTo(podcastEpisode) in init()
  declare static readonly sequelize: Sequelize & { models: RegisteredModels } // set by init() before any query runs; names the registry entry this file reads
  declare readonly sequelize: Sequelize & { uppercaseFirst<T extends string>(str: T): Capitalize<T> } // Database.js adds uppercaseFirst to the Sequelize instance before any model is used

  constructor(values?: CreationAttributes<MediaItemShare>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {UUIDV4} */
    this.mediaItemId
    /** @type {string} */
    this.mediaItemType
    /** @type {string} */
    this.slug
    /** @type {string} */
    this.pash
    /** @type {UUIDV4} */
    this.userId
    /** @type {Date} */
    this.expiresAt
    /** @type {Object} */
    this.extraData
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
    /** @type {boolean} */
    this.isDownloadable

    // Expanded properties

    /** @type {import('./Book')|import('./PodcastEpisode')} */
    this.mediaItem
  }

  toJSONForClient() {
    return {
      id: this.id,
      mediaItemId: this.mediaItemId,
      mediaItemType: this.mediaItemType,
      slug: this.slug,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isDownloadable: this.isDownloadable
    }
  }

  /**
   * Expanded book that includes library settings
   *
   * @param {string} mediaItemId
   * @param {string} mediaItemType
   * @returns {Promise<import('./LibraryItem').LibraryItemExpanded>}
   */
  static async getMediaItemsLibraryItem(mediaItemId: string, mediaItemType: string) {
    /** @type {typeof import('./LibraryItem')} */
    const libraryItemModel = this.sequelize.models.libraryItem

    if (mediaItemType === 'book') {
      const libraryItem = await libraryItemModel.findOneExpanded({ mediaId: mediaItemId }, null, {
        model: this.sequelize.models.library,
        attributes: ['settings']
      })

      return libraryItem
    }
    return null
  }

  /**
   *
   * @param {import('sequelize').FindOptions} options
   * @returns {Promise<import('./Book')|import('./PodcastEpisode')>}
   */
  getMediaItem(options?: FindOptions) {
    if (!this.mediaItemType) return Promise.resolve(null)
    const mixinMethodName: 'getBook' | 'getPodcastEpisode' = `get${this.sequelize.uppercaseFirst(this.mediaItemType)}`
    return this[mixinMethodName](options)
  }

  static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces
  static init(sequelize: Sequelize): void
  /**
   * Initialize model
   *
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
        mediaItemId: DataTypes.UUID,
        mediaItemType: DataTypes.STRING,
        slug: DataTypes.STRING,
        pash: DataTypes.STRING,
        expiresAt: DataTypes.DATE,
        extraData: DataTypes.JSON,
        isDownloadable: DataTypes.BOOLEAN
      },
      {
        sequelize,
        modelName: 'mediaItemShare'
      }
    )

    const { user, book, podcastEpisode } = sequelize.models

    user.hasMany(MediaItemShare)
    MediaItemShare.belongsTo(user)

    book.hasMany(MediaItemShare, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    MediaItemShare.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(MediaItemShare, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    MediaItemShare.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    MediaItemShare.addHook('afterFind', (findResult: MediaItemShare | MediaItemShare[] | null) => {
      if (!findResult) return

      if (!Array.isArray(findResult)) findResult = [findResult]

      for (const instance of findResult) {
        if (instance.mediaItemType === 'book' && instance.book !== undefined) {
          instance.mediaItem = instance.book
          instance.dataValues.mediaItem = instance.dataValues.book
        } else if (instance.mediaItemType === 'podcastEpisode' && instance.podcastEpisode !== undefined) {
          instance.mediaItem = instance.podcastEpisode
          instance.dataValues.mediaItem = instance.dataValues.podcastEpisode
        }
        // To prevent mistakes:
        delete instance.book
        delete instance.dataValues.book
        delete instance.podcastEpisode
        delete instance.dataValues.podcastEpisode
      }
    })
  }
}

export = MediaItemShare
