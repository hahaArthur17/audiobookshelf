import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BelongsToGetAssociationMixin, BelongsToGetAssociationMixinOptions, BuildOptions, CreationAttributes, Sequelize } from 'sequelize'

type Book = import('./Book')
type PodcastEpisode = import('./PodcastEpisode')
type Playlist = import('./Playlist')

class PlaylistMediaItem extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: 'book' | 'podcastEpisode' // the JSDoc says string; these are the two values the associations in init() are scoped to, and getMediaItem() builds a mixin name from them
  declare order: number
  declare playlistId: string
  declare createdAt: Date
  declare mediaItem: Book | PodcastEpisode
  declare book?: Book // set by a query that includes book; the afterFind hook moves it to mediaItem and deletes it
  declare podcastEpisode?: PodcastEpisode // set by a query that includes podcastEpisode; the afterFind hook moves it to mediaItem and deletes it
  declare playlist: Playlist // only set by a query that includes playlist (Playlist.getPlaylistsForMediaItemIds); not listed in the constructor
  declare getBook: BelongsToGetAssociationMixin<Book> // mixin added by belongsTo(book) in init()
  declare getPodcastEpisode: BelongsToGetAssociationMixin<PodcastEpisode> // mixin added by belongsTo(podcastEpisode) in init()
  declare readonly sequelize: Sequelize & { uppercaseFirst<T extends string>(str: T): Capitalize<T> } // Database.js adds uppercaseFirst to the Sequelize instance before any model is used

  constructor(values?: CreationAttributes<PlaylistMediaItem>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {UUIDV4} */
    this.mediaItemId
    /** @type {string} */
    this.mediaItemType
    /** @type {number} */
    this.order
    /** @type {UUIDV4} */
    this.playlistId
    /** @type {Date} */
    this.createdAt

    // Expanded properties

    /** @type {import('./Book')|import('./PodcastEpisode')} - only set when expanded */
    this.mediaItem
  }

  getMediaItem(options?: BelongsToGetAssociationMixinOptions) {
    if (!this.mediaItemType) return Promise.resolve(null)
    const mixinMethodName: 'getBook' | 'getPodcastEpisode' = `get${this.sequelize.uppercaseFirst(this.mediaItemType)}`
    return this[mixinMethodName](options)
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
        mediaItemId: DataTypes.UUID,
        mediaItemType: DataTypes.STRING,
        order: DataTypes.INTEGER
      },
      {
        sequelize,
        timestamps: true,
        updatedAt: false,
        modelName: 'playlistMediaItem'
      }
    )

    const { book, podcastEpisode, playlist } = sequelize.models

    book.hasMany(PlaylistMediaItem, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    PlaylistMediaItem.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(PlaylistMediaItem, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    PlaylistMediaItem.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    PlaylistMediaItem.addHook('afterFind', (findResult: PlaylistMediaItem | PlaylistMediaItem[] | null) => {
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

    playlist.hasMany(PlaylistMediaItem, {
      onDelete: 'CASCADE'
    })
    PlaylistMediaItem.belongsTo(playlist)
  }
}

export = PlaylistMediaItem
