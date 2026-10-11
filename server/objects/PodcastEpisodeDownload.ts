/// <reference path="../types/untypedModules.d.ts" />
import Path = require('path')
import uuid = require('uuid')
const uuidv4 = uuid.v4
import fileUtils = require('../utils/fileUtils')
const { sanitizeFilename, filePathToPOSIX } = fileUtils
import globals = require('../utils/globals')

type RssPodcastEpisode = import('../utils/podcastUtils').RssPodcastEpisode
type LibraryItem = import('../models/LibraryItem')

class PodcastEpisodeDownload {
  declare id: string | null
  declare rssPodcastEpisode: RssPodcastEpisode | null
  declare url: string | null
  declare libraryItem: LibraryItem | null
  declare libraryId: string | null
  declare isAutoDownload: boolean
  declare isFinished: boolean
  declare failed: boolean
  declare appendRandomId: boolean
  declare targetFilename: string | null
  declare startedAt: number | null
  declare createdAt: number | null
  declare finishedAt: number | null

  constructor() {
    this.id = null
    /** @type {import('../utils/podcastUtils').RssPodcastEpisode} */
    this.rssPodcastEpisode = null

    this.url = null
    /** @type {import('../models/LibraryItem')} */
    this.libraryItem = null
    this.libraryId = null

    this.isAutoDownload = false
    this.isFinished = false
    this.failed = false

    this.appendRandomId = false

    this.targetFilename = null

    this.startedAt = null
    this.createdAt = null
    this.finishedAt = null
  }

  toJSONForClient() {
    return {
      id: this.id,
      episodeDisplayTitle: this.rssPodcastEpisode?.title ?? null,
      url: this.url,
      libraryItemId: this.libraryItemId,
      libraryId: this.libraryId || null,
      isFinished: this.isFinished,
      failed: this.failed,
      appendRandomId: this.appendRandomId,
      startedAt: this.startedAt,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      podcastTitle: this.libraryItem?.media.title ?? null,
      podcastExplicit: !!this.libraryItem?.media.explicit,
      season: this.rssPodcastEpisode?.season ?? null,
      episode: this.rssPodcastEpisode?.episode ?? null,
      episodeType: this.rssPodcastEpisode?.episodeType ?? 'full',
      publishedAt: this.rssPodcastEpisode?.publishedAt ?? null,
      guid: this.rssPodcastEpisode?.guid ?? null
    }
  }

  get urlFileExtension() {
    // url is set by setData() right after the constructor (PodcastManager.downloadPodcastEpisodes), so the ! below is safe
    const cleanUrl = this.url!.split('?')[0] // Remove query string
    return Path.extname(cleanUrl).substring(1).toLowerCase()
  }
  get fileExtension() {
    const extname = this.urlFileExtension
    if (globals.SupportedAudioTypes.includes(extname)) return extname
    return 'mp3'
  }
  get enclosureType() {
    const enclosureType = this.rssPodcastEpisode!.enclosure.type // rssPodcastEpisode is set by setData() right after the constructor
    return typeof enclosureType === 'string' ? enclosureType : null
  }
  get episodeTitle() {
    return this.rssPodcastEpisode!.title // rssPodcastEpisode is set by setData() right after the constructor
  }
  get targetPath(): string {
    return filePathToPOSIX(Path.join(this.libraryItem!.path, this.targetFilename!)) // libraryItem and targetFilename are set by setData() right after the constructor
  }
  get targetRelPath() {
    return this.targetFilename
  }
  get libraryItemId() {
    return this.libraryItem?.id || null
  }
  get pubYear() {
    if (!this.rssPodcastEpisode!.publishedAt) return null // rssPodcastEpisode is set by setData() right after the constructor
    return new Date(this.rssPodcastEpisode!.publishedAt).getFullYear() // same: set by setData() before this getter is read
  }

  /**
   * @param {string} title
   */
  getSanitizedFilename(title: string): string {
    const appendage = this.appendRandomId ? ` (${this.id})` : ''
    const filename = `${title.trim()}${appendage}.${this.fileExtension}`
    return sanitizeFilename(filename) as string // boundary: fileUtils.sanitizeFilename (JavaScript) returns false only for a non-string argument; filename is a string here
  }

  /**
   * @param {boolean} appendRandomId
   */
  setAppendRandomId(appendRandomId: boolean): void {
    this.appendRandomId = appendRandomId
    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode!.title || '') // rssPodcastEpisode is set by setData() before PodcastManager calls setAppendRandomId()
  }

  /**
   *
   * @param {import('../utils/podcastUtils').RssPodcastEpisode} rssPodcastEpisode - from rss feed
   * @param {import('../models/LibraryItem')} libraryItem
   * @param {*} isAutoDownload
   * @param {*} libraryId
   */
  setData(rssPodcastEpisode: RssPodcastEpisode, libraryItem: LibraryItem, isAutoDownload: boolean, libraryId: string): void {
    this.id = uuidv4()
    this.rssPodcastEpisode = rssPodcastEpisode

    const url = rssPodcastEpisode.enclosure.url
    if (decodeURIComponent(url) !== url) {
      // Already encoded
      this.url = url
    } else {
      this.url = encodeURI(url)
    }

    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode.title || '')

    this.libraryItem = libraryItem
    this.isAutoDownload = isAutoDownload
    this.createdAt = Date.now()
    this.libraryId = libraryId
  }

  setFinished(success: boolean): void {
    this.finishedAt = Date.now()
    this.isFinished = true
    this.failed = !success
  }
}
export = PodcastEpisodeDownload
