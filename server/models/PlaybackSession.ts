import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BelongsToGetAssociationMixin, BelongsToGetAssociationMixinOptions, BuildOptions, CreationAttributes, Sequelize, WhereOptions } from 'sequelize'

import oldPlaybackSession = require('../objects/PlaybackSession')

type Book = import('./Book')
type PodcastEpisode = import('./PodcastEpisode')
type Device = import('./Device')

class PlaybackSession extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: 'book' | 'podcastEpisode' // the JSDoc says string; these are the two values getFromOld() stores and the associations in init() are scoped to, and getMediaItem() builds a mixin name from them
  declare displayTitle: string
  declare displayAuthor: string
  declare duration: number
  declare playMethod: number
  declare mediaPlayer: string
  declare startTime: number
  declare currentTime: number
  declare serverVersion: string | null // getFromOld() stores null when the old session has no version; the JSDoc says string
  declare coverPath: string
  declare timeListening: number
  declare mediaMetadata: Record<string, unknown>
  declare date: string
  declare dayOfWeek: string
  declare extraData: { libraryItemId?: string } | null // the JSDoc says Object; libraryItemId is the only key this file reads or writes, and it reads it with ?.
  declare userId: string
  declare deviceId: string | null // getFromOld() stores null when the old session has no device info; the JSDoc says UUIDV4
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date
  declare device?: Device // only set by a query that includes device (getOldPlaybackSessions, getById); not listed in the constructor
  declare mediaItem: Book | PodcastEpisode // set by the afterFind hook; not listed in the constructor
  declare book?: Book // set by a query that includes book; the afterFind hook moves it to mediaItem and deletes it
  declare podcastEpisode?: PodcastEpisode // set by a query that includes podcastEpisode; the afterFind hook moves it to mediaItem and deletes it
  declare getBook: BelongsToGetAssociationMixin<Book> // mixin added by belongsTo(book) in init()
  declare getPodcastEpisode: BelongsToGetAssociationMixin<PodcastEpisode> // mixin added by belongsTo(podcastEpisode) in init()
  declare static readonly sequelize: Sequelize // set by init() before any query runs (optional in Sequelize's typings)
  declare readonly sequelize: Sequelize & { uppercaseFirst<T extends string>(str: T): Capitalize<T> } // Database.js adds uppercaseFirst to the Sequelize instance before any model is used

  constructor(values?: CreationAttributes<PlaybackSession>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {UUIDV4} */
    this.mediaItemId
    /** @type {string} */
    this.mediaItemType
    /** @type {string} */
    this.displayTitle
    /** @type {string} */
    this.displayAuthor
    /** @type {number} */
    this.duration
    /** @type {number} */
    this.playMethod
    /** @type {string} */
    this.mediaPlayer
    /** @type {number} */
    this.startTime
    /** @type {number} */
    this.currentTime
    /** @type {string} */
    this.serverVersion
    /** @type {string} */
    this.coverPath
    /** @type {number} */
    this.timeListening
    /** @type {Object} */
    this.mediaMetadata
    /** @type {string} */
    this.date
    /** @type {string} */
    this.dayOfWeek
    /** @type {Object} */
    this.extraData
    /** @type {UUIDV4} */
    this.userId
    /** @type {UUIDV4} */
    this.deviceId
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {Date} */
    this.updatedAt
    /** @type {Date} */
    this.createdAt
  }

  static async getOldPlaybackSessions(where: WhereOptions | null = null) {
    const playbackSessions = await this.findAll({
      ...(where && { where }), // where is left out when it is null: Sequelize's typings reject where: null, which it treats like no where
      include: [
        {
          model: this.sequelize.models.device
        }
      ]
    })
    return playbackSessions.map((session) => this.getOldPlaybackSession(session))
  }

  static async getById(sessionId: string) {
    const playbackSession = await this.findByPk(sessionId, {
      include: [
        {
          model: this.sequelize.models.device
        }
      ]
    })
    if (!playbackSession) return null
    return this.getOldPlaybackSession(playbackSession)
  }

  static getOldPlaybackSession(playbackSessionExpanded: PlaybackSession) {
    const isPodcastEpisode = playbackSessionExpanded.mediaItemType === 'podcastEpisode'

    return new oldPlaybackSession({
      id: playbackSessionExpanded.id,
      userId: playbackSessionExpanded.userId,
      libraryId: playbackSessionExpanded.libraryId,
      libraryItemId: playbackSessionExpanded.extraData?.libraryItemId || null,
      bookId: isPodcastEpisode ? null : playbackSessionExpanded.mediaItemId,
      episodeId: isPodcastEpisode ? playbackSessionExpanded.mediaItemId : null,
      mediaType: isPodcastEpisode ? 'podcast' : 'book',
      mediaMetadata: playbackSessionExpanded.mediaMetadata,
      chapters: null,
      displayTitle: playbackSessionExpanded.displayTitle,
      displayAuthor: playbackSessionExpanded.displayAuthor,
      coverPath: playbackSessionExpanded.coverPath,
      duration: playbackSessionExpanded.duration,
      playMethod: playbackSessionExpanded.playMethod,
      mediaPlayer: playbackSessionExpanded.mediaPlayer,
      deviceInfo: playbackSessionExpanded.device?.getOldDevice() || null,
      serverVersion: playbackSessionExpanded.serverVersion,
      date: playbackSessionExpanded.date,
      dayOfWeek: playbackSessionExpanded.dayOfWeek,
      timeListening: playbackSessionExpanded.timeListening,
      startTime: playbackSessionExpanded.startTime,
      currentTime: playbackSessionExpanded.currentTime,
      startedAt: playbackSessionExpanded.createdAt.valueOf(),
      updatedAt: playbackSessionExpanded.updatedAt.valueOf()
    })
  }

  static removeById(sessionId: string) {
    return this.destroy({
      where: {
        id: sessionId
      }
    })
  }

  static createFromOld(oldPlaybackSession: oldPlaybackSession) {
    const playbackSession = this.getFromOld(oldPlaybackSession)
    return this.upsert(playbackSession)
  }

  static updateFromOld(oldPlaybackSession: oldPlaybackSession) {
    const playbackSession = this.getFromOld(oldPlaybackSession)
    return this.update(playbackSession, {
      where: {
        id: playbackSession.id
      },
      silent: true
    })
  }

  static getFromOld(oldPlaybackSession: oldPlaybackSession) {
    return {
      id: oldPlaybackSession.id,
      mediaItemId: oldPlaybackSession.episodeId || oldPlaybackSession.bookId,
      mediaItemType: oldPlaybackSession.episodeId ? 'podcastEpisode' : 'book',
      libraryId: oldPlaybackSession.libraryId,
      displayTitle: oldPlaybackSession.displayTitle,
      displayAuthor: oldPlaybackSession.displayAuthor,
      duration: oldPlaybackSession.duration,
      playMethod: oldPlaybackSession.playMethod,
      mediaPlayer: oldPlaybackSession.mediaPlayer,
      startTime: oldPlaybackSession.startTime,
      currentTime: oldPlaybackSession.currentTime,
      serverVersion: oldPlaybackSession.serverVersion || null,
      createdAt: oldPlaybackSession.startedAt,
      updatedAt: oldPlaybackSession.updatedAt,
      userId: oldPlaybackSession.userId,
      deviceId: oldPlaybackSession.deviceInfo?.id || null,
      timeListening: oldPlaybackSession.timeListening,
      coverPath: oldPlaybackSession.coverPath,
      mediaMetadata: oldPlaybackSession.mediaMetadata,
      date: oldPlaybackSession.date,
      dayOfWeek: oldPlaybackSession.dayOfWeek,
      extraData: {
        libraryItemId: oldPlaybackSession.libraryItemId
      }
    }
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
        displayTitle: DataTypes.STRING,
        displayAuthor: DataTypes.STRING,
        duration: DataTypes.FLOAT,
        playMethod: DataTypes.INTEGER,
        mediaPlayer: DataTypes.STRING,
        startTime: DataTypes.FLOAT,
        currentTime: DataTypes.FLOAT,
        serverVersion: DataTypes.STRING,
        coverPath: DataTypes.STRING,
        timeListening: DataTypes.INTEGER,
        mediaMetadata: DataTypes.JSON,
        date: DataTypes.STRING,
        dayOfWeek: DataTypes.STRING,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'playbackSession'
      }
    )

    const { book, podcastEpisode, user, device, library } = sequelize.models

    user.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(user)

    device.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(device)

    library.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(library)

    book.hasMany(PlaybackSession, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    PlaybackSession.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(PlaybackSession, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    PlaybackSession.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    PlaybackSession.addHook('afterFind', (findResult: PlaybackSession | PlaybackSession[] | null) => {
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

export = PlaybackSession
