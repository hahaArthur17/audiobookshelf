import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'
import libraryItemsPodcastFilters = require('../utils/queries/libraryItemsPodcastFilters')

type AudioFileObject = import('./Book').AudioFileObject
type AudioTrack = import('./Book').AudioTrack
type RssPodcastEpisode = import('../utils/podcastUtils').RssPodcastEpisode
type AudioFile = import('../objects/files/AudioFile')

// Type-only: keeps import('./PodcastEpisode').ChapterObject (named in Podcast's JSDoc) resolvable after export = PodcastEpisode
declare namespace PodcastEpisode {
  interface ChapterObject {
    id: number
    start: number
    end: number
    title: string
  }
}
type ChapterObject = PodcastEpisode.ChapterObject

/** Values createFromRssPodcastEpisode() passes to create(): the feed's own value types, which Sequelize converts when it stores them */
type NewPodcastEpisodeValues = {
  index: null
  season: string
  episode: string
  episodeType: string
  title: string
  subtitle: string
  description: string
  pubDate: string
  enclosureURL: string | null
  enclosureSize: string | null // the length attribute of the feed's enclosure
  enclosureType: string | null
  publishedAt: number // Unix timestamp from the feed
  podcastId: string
  audioFile: ReturnType<AudioFile['toJSON']>
  chapters: ChapterObject[]
  extraData: { guid?: string }
}

/**
 * @typedef ChapterObject
 * @property {number} id
 * @property {number} start
 * @property {number} end
 * @property {string} title
 */

class PodcastEpisode extends Model {
  declare id: string
  declare index: number | null // createFromRssPodcastEpisode() stores null; the JSDoc says number
  declare season: string
  declare episode: string
  declare episodeType: string
  declare title: string
  declare subtitle: string
  declare description: string
  declare pubDate: string
  declare enclosureURL: string | null // createFromRssPodcastEpisode() stores null when the feed has no enclosure; the JSDoc says string
  declare enclosureSize: bigint | null // same; toOldJSON() checks it for null. The JSDoc says BigInt
  declare enclosureType: string | null // same
  declare publishedAt: Date
  declare audioFile: AudioFileObject
  declare chapters: ChapterObject[]
  declare extraData: { guid?: string; oldEpisodeId?: string } | null // the JSDoc says Object; these are the two keys this file reads, both with ?.
  declare podcastId: string
  declare createdAt: Date
  declare updatedAt: Date

  constructor(values?: CreationAttributes<PodcastEpisode>, options?: BuildOptions) {
    super(values, options)

    /** @type {string} */
    this.id
    /** @type {number} */
    this.index
    /** @type {string} */
    this.season
    /** @type {string} */
    this.episode
    /** @type {string} */
    this.episodeType
    /** @type {string} */
    this.title
    /** @type {string} */
    this.subtitle
    /** @type {string} */
    this.description
    /** @type {string} */
    this.pubDate
    /** @type {string} */
    this.enclosureURL
    /** @type {BigInt} */
    this.enclosureSize
    /** @type {string} */
    this.enclosureType
    /** @type {Date} */
    this.publishedAt
    /** @type {import('./Book').AudioFileObject} */
    this.audioFile
    /** @type {ChapterObject[]} */
    this.chapters
    /** @type {Object} */
    this.extraData
    /** @type {string} */
    this.podcastId
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  /**
   *
   * @param {import('../utils/podcastUtils').RssPodcastEpisode} rssPodcastEpisode
   * @param {string} podcastId
   * @param {import('../objects/files/AudioFile')} audioFile
   */
  static async createFromRssPodcastEpisode(rssPodcastEpisode: RssPodcastEpisode, podcastId: string, audioFile: AudioFile) {
    const podcastEpisode: NewPodcastEpisodeValues = {
      index: null,
      season: rssPodcastEpisode.season,
      episode: rssPodcastEpisode.episode,
      episodeType: rssPodcastEpisode.episodeType,
      title: rssPodcastEpisode.title,
      subtitle: rssPodcastEpisode.subtitle,
      description: rssPodcastEpisode.description,
      pubDate: rssPodcastEpisode.pubDate,
      enclosureURL: rssPodcastEpisode.enclosure?.url || null,
      enclosureSize: rssPodcastEpisode.enclosure?.length || null,
      enclosureType: rssPodcastEpisode.enclosure?.type || null,
      publishedAt: rssPodcastEpisode.publishedAt,
      podcastId,
      audioFile: audioFile.toJSON(),
      chapters: [],
      extraData: {}
    }
    if (rssPodcastEpisode.guid) {
      podcastEpisode.extraData.guid = rssPodcastEpisode.guid
    }

    if (audioFile.chapters?.length) {
      podcastEpisode.chapters = audioFile.chapters.map((ch) => ({ ...ch }))
    } else if (rssPodcastEpisode.chapters?.length) {
      podcastEpisode.chapters = rssPodcastEpisode.chapters.map((ch) => ({ ...ch }))
    }

    return this.create(podcastEpisode)
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
        index: DataTypes.INTEGER,
        season: DataTypes.STRING,
        episode: DataTypes.STRING,
        episodeType: DataTypes.STRING,
        title: DataTypes.STRING,
        subtitle: DataTypes.STRING(1000),
        description: DataTypes.TEXT,
        pubDate: DataTypes.STRING,
        enclosureURL: DataTypes.STRING,
        enclosureSize: DataTypes.BIGINT,
        enclosureType: DataTypes.STRING,
        publishedAt: DataTypes.DATE,

        audioFile: DataTypes.JSON,
        chapters: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'podcastEpisode',
        indexes: [
          {
            name: 'podcastEpisode_createdAt_podcastId',
            fields: ['createdAt', 'podcastId']
          },
          {
            name: 'podcast_episodes_published_at',
            fields: ['publishedAt']
          }
        ]
      }
    )

    const { podcast } = sequelize.models
    podcast.hasMany(PodcastEpisode, {
      onDelete: 'CASCADE'
    })
    PodcastEpisode.belongsTo(podcast)

    PodcastEpisode.addHook('afterDestroy', async (instance) => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterDestroy')
    })

    PodcastEpisode.addHook('afterCreate', async (instance) => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterCreate')
    })
  }

  get size() {
    return this.audioFile?.metadata.size || 0
  }

  get duration() {
    return this.audioFile?.duration || 0
  }

  /**
   * Used for matching the episode with an episode in the RSS feed
   *
   * @param {string} guid
   * @param {string} enclosureURL
   * @returns {boolean}
   */
  checkMatchesGuidOrEnclosureUrl(guid: string, enclosureURL: string) {
    if (this.extraData?.guid && this.extraData.guid === guid) {
      return true
    }
    if (this.enclosureURL && this.enclosureURL === enclosureURL) {
      return true
    }
    return false
  }

  /**
   * Used in client players
   *
   * @param {string} libraryItemId
   * @returns {import('./Book').AudioTrack}
   */
  getAudioTrack(libraryItemId: string) {
    const track: AudioFileObject & Partial<AudioTrack> = structuredClone(this.audioFile)
    track.startOffset = 0
    track.title = this.audioFile.metadata.filename
    track.index = 1 // Podcast episodes only have one track
    track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
    return track
  }

  toOldJSON(libraryItemId: string) {
    if (!libraryItemId) {
      throw new Error(`[PodcastEpisode] Cannot convert to old JSON because libraryItemId is not provided`)
    }

    let enclosure = null
    if (this.enclosureURL) {
      enclosure = {
        url: this.enclosureURL,
        type: this.enclosureType,
        length: this.enclosureSize !== null ? String(this.enclosureSize) : null
      }
    }

    return {
      libraryItemId: libraryItemId,
      podcastId: this.podcastId,
      id: this.id,
      oldEpisodeId: this.extraData?.oldEpisodeId || null,
      index: this.index,
      season: this.season,
      episode: this.episode,
      episodeType: this.episodeType,
      title: this.title,
      subtitle: this.subtitle,
      description: this.description,
      enclosure,
      guid: this.extraData?.guid || null,
      pubDate: this.pubDate,
      chapters: structuredClone(this.chapters),
      audioFile: structuredClone(this.audioFile),
      publishedAt: this.publishedAt?.valueOf() || null,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  toOldJSONExpanded(libraryItemId: string) {
    const json: ReturnType<PodcastEpisode['toOldJSON']> & { audioTrack?: ReturnType<PodcastEpisode['getAudioTrack']>; size?: number; duration?: number } = this.toOldJSON(libraryItemId)

    json.audioTrack = this.getAudioTrack(libraryItemId)
    json.size = this.size
    json.duration = this.duration

    return json
  }
}

export = PodcastEpisode
