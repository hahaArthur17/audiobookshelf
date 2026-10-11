import type { LibraryItemModelStatic } from '../types/libraryItemModel'
import Path = require('path')
import type { NextFunction, Request, Response } from 'express'
import Logger = require('../Logger')
import SocketAuthority = require('../SocketAuthority')
import Database = require('../Database')

import fs = require('../libs/fsExtra')
import cron = require('../libs/nodeCron')

import podcastUtils = require('../utils/podcastUtils')
const { getPodcastFeed, findMatchingEpisodes } = podcastUtils
import fileUtils = require('../utils/fileUtils')
const { getFileTimestampsWithIno, filePathToPOSIX, isSameOrSubPath } = fileUtils
import utils = require('../utils/index')
const { validateUrl } = utils
import htmlSanitizer = require('../utils/htmlSanitizer')

import Scanner = require('../scanner/Scanner')
import CoverManager = require('../managers/CoverManager')

type User = import('../models/User')
type LibraryItem = import('../models/LibraryItem')
type PodcastExpanded = import('../models/Podcast').PodcastExpanded
type ApiRouter = import('../routers/ApiRouter')
type RssPodcastEpisode = import('../utils/podcastUtils').RssPodcastEpisode
type LibraryFileObject = import('../models/LibraryItem').LibraryFileObject

// lib.d.ts types isNaN(number), but the built-in coerces every value and checkNewEpisodes() passes a query string. Widens the type for this file only; emits no code.
declare function isNaN(value: unknown): boolean

// Query values are assumed to be strings (the original code assumes this, for example when it compares them with '1')
type PodcastQuery = { limit?: string; title?: string; override?: string; hard?: string }
type PodcastParams = { id: string; episodeId: string }
type RequestUserObject = { user: User }
type RequestWithUser<Body = unknown> = Request<PodcastParams, unknown, Body, PodcastQuery> & RequestUserObject
// middleware() only lets podcast items through, so the handlers read media as a podcast: LibraryItem.js (JS) types media as a book or a podcast
type RequestEntityObject = { libraryItem: LibraryItem & { media: PodcastExpanded } }
type RequestWithLibraryItem<Body = unknown> = RequestWithUser<Body> & RequestEntityObject
// Body fields have the types the handlers assume after their own checks
type CreateBody = { media: Parameters<typeof Database.podcastModel.createFromRequest>[0] & { autoDownloadSchedule?: string }; libraryId: string; folderId: string; path: string }
type getPodcastFeedReqBody = { rssFeed: string }
type OpmlTextBody = { opmlText: string }
type OpmlCreateBody = { feeds: string[]; libraryId: string; folderId: string; autoDownloadEpisodes?: boolean }
type UpdateEpisodeBody = { enclosure?: { url?: unknown; type?: unknown; length?: unknown } | null; [key: string]: unknown } // index signature: updateEpisode() reads and writes req.body by a dynamic key
/** downloadCoverFromUrlNew() resolves with { error } or { cover }; the code reads both keys */
type CoverResult = { error?: string; cover?: string }
/** getFileTimestampsWithIno() (fileUtils.js) resolves with false when the stat fails, and create() reads the result without testing it (bug log): a property read on false gives undefined */
type FolderStats = Exclude<Awaited<ReturnType<typeof getFileTimestampsWithIno>>, false> | (false & { ino?: undefined; mtimeMs?: undefined; ctimeMs?: undefined; birthtimeMs?: undefined })

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 *
 * @typedef RequestEntityObject
 * @property {import('../models/LibraryItem')} libraryItem
 *
 * @typedef {RequestWithUser & RequestEntityObject} RequestWithLibraryItem
 */

class PodcastController {
  /**
   * POST /api/podcasts
   * Create podcast
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async create(this: ApiRouter, req: RequestWithUser<CreateBody>, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to create podcast`)
      return res.sendStatus(403)
    }
    const payload = req.body
    if (!payload.media || !payload.media.metadata) {
      return res.status(400).send('Invalid request body. "media" and "media.metadata" are required')
    }

    if (payload.media.autoDownloadSchedule && !cron.validate(payload.media.autoDownloadSchedule)) {
      Logger.error(`[PodcastController] Invalid auto download schedule cron expression "${payload.media.autoDownloadSchedule}"`)
      return res.status(400).send('Invalid auto download schedule cron expression')
    }

    const library = await Database.libraryModel.findByIdWithFolders(payload.libraryId)
    if (!library) {
      Logger.error(`[PodcastController] Create: Library not found "${payload.libraryId}"`)
      return res.status(404).send('Library not found')
    }

    const folder = library.libraryFolders!.find((fold) => fold.id === payload.folderId) // findByIdWithFolders() always includes libraryFolders
    if (!folder) {
      Logger.error(`[PodcastController] Create: Folder not found "${payload.folderId}"`)
      return res.status(404).send('Folder not found')
    }

    if (typeof payload.path !== 'string' || !payload.path.trim()) {
      return res.status(400).send('Invalid request body. "path" must be a non-empty string')
    }

    const libraryFolderPath = filePathToPOSIX(folder.path)
    const podcastPath = filePathToPOSIX(payload.path)

    if (!isSameOrSubPath(libraryFolderPath, podcastPath)) {
      Logger.error(`[PodcastController] Create: Podcast path is outside library folder "${libraryFolderPath}": "${podcastPath}"`)
      return res.status(400).send('Podcast path must be inside the selected library folder')
    }

    // Check if a library item with this podcast folder exists already
    const existingLibraryItem =
      (await (Database.libraryItemModel as LibraryItemModelStatic).count({ // boundary: LibraryItem.js (JS) is not a Sequelize ModelStatic, see types/libraryItemModel.d.ts
        where: {
          path: podcastPath
        }
      })) > 0
    if (existingLibraryItem) {
      Logger.error(`[PodcastController] Podcast already exists at path "${podcastPath}"`)
      return res.status(400).send('Podcast already exists')
    }

    const success = await fs
      .ensureDir(podcastPath)
      .then(() => true)
      .catch((error: unknown) => {
        Logger.error(`[PodcastController] Failed to ensure podcast dir "${podcastPath}"`, error)
        return false
      })
    if (!success) return res.status(400).send('Invalid podcast path')

    const libraryItemFolderStats: FolderStats = await getFileTimestampsWithIno(podcastPath)

    let relPath = podcastPath.replace(libraryFolderPath, '')
    if (relPath.startsWith('/')) relPath = relPath.slice(1)

    let newLibraryItem = null
    const transaction = await Database.sequelize!.transaction() // sequelize starts as null and is set in Database.init() before the first request
    try {
      const podcast = await Database.podcastModel.createFromRequest(payload.media, transaction)

      newLibraryItem = await (Database.libraryItemModel as LibraryItemModelStatic).create( // boundary: LibraryItem.js (JS) is not a Sequelize ModelStatic, see types/libraryItemModel.d.ts
        {
          ino: libraryItemFolderStats.ino,
          path: podcastPath,
          relPath,
          mediaId: podcast.id,
          mediaType: 'podcast',
          isFile: false,
          isMissing: false,
          isInvalid: false,
          mtime: libraryItemFolderStats.mtimeMs || 0,
          ctime: libraryItemFolderStats.ctimeMs || 0,
          birthtime: libraryItemFolderStats.birthtimeMs || 0,
          size: 0,
          libraryFiles: [],
          extraData: {},
          libraryId: library.id,
          libraryFolderId: folder.id,
          title: podcast.title,
          titleIgnorePrefix: podcast.titleIgnorePrefix
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      Logger.error(`[PodcastController] Failed to create podcast: ${error}`)
      await transaction.rollback()
      return res.status(500).send('Failed to create podcast')
    }

    newLibraryItem.media = await newLibraryItem.getMediaExpanded()

    // Download and save cover image
    if (typeof payload.media.metadata.imageUrl === 'string' && payload.media.metadata.imageUrl.startsWith('http')) {
      // Podcast cover will always go into library item folder
      const coverResponse: CoverResult = await CoverManager.downloadCoverFromUrlNew(payload.media.metadata.imageUrl, newLibraryItem.id, newLibraryItem.path, true)
      if (coverResponse.error) {
        Logger.error(`[PodcastController] Download cover error from "${payload.media.metadata.imageUrl}": ${coverResponse.error}`)
      } else if (coverResponse.cover) {
        const coverImageFileStats = await getFileTimestampsWithIno(coverResponse.cover)
        if (!coverImageFileStats) {
          Logger.error(`[PodcastController] Failed to get cover image stats for "${coverResponse.cover}"`)
        } else {
          // Add libraryFile to libraryItem and coverPath to podcast
          const newLibraryFile = {
            ino: coverImageFileStats.ino,
            fileType: 'image',
            addedAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {
              filename: Path.basename(coverResponse.cover),
              ext: Path.extname(coverResponse.cover).slice(1),
              path: coverResponse.cover,
              relPath: Path.basename(coverResponse.cover),
              size: coverImageFileStats.size,
              mtimeMs: coverImageFileStats.mtimeMs || 0,
              ctimeMs: coverImageFileStats.ctimeMs || 0,
              birthtimeMs: coverImageFileStats.birthtimeMs || 0
            }
          }
          newLibraryItem.libraryFiles.push(newLibraryFile as LibraryFileObject & { fileType: string }) // boundary: the LibraryFileObject typedef of LibraryItem.js (JS) requires isSupplementary and has no fileType; this new image file sets fileType and leaves isSupplementary out (TS2345)
          newLibraryItem.changed('libraryFiles', true)
          await newLibraryItem.save()

          newLibraryItem.media.coverPath = coverResponse.cover
          await newLibraryItem.media.save()
        }
      }
    }

    SocketAuthority.libraryItemEmitter('item_added', newLibraryItem)

    res.json(newLibraryItem.toOldJSONExpanded())

    // Turn on podcast auto download cron if not already on
    if ((newLibraryItem.media as PodcastExpanded).autoDownloadEpisodes) { // boundary: LibraryItem.js (JS) types media as a book or a podcast; this item was created above with mediaType 'podcast'
      this.cronManager.checkUpdatePodcastCron(newLibraryItem)
    }
  }

  /**
   * POST: /api/podcasts/feed
   *
   * @typedef getPodcastFeedReqBody
   * @property {string} rssFeed
   *
   * @param {Request<{}, {}, getPodcastFeedReqBody, {}> & RequestUserObject} req
   * @param {Response} res
   */
  async getPodcastFeed(req: RequestWithUser<getPodcastFeedReqBody>, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to get podcast feed`)
      return res.sendStatus(403)
    }

    const url = validateUrl(req.body.rssFeed)
    if (!url) {
      return res.status(400).send('Invalid request body. "rssFeed" must be a valid URL')
    }

    const podcast = await getPodcastFeed(url)
    if (!podcast) {
      return res.status(404).send('Podcast RSS feed request failed or invalid response data')
    }
    res.json({ podcast })
  }

  /**
   * POST: /api/podcasts/opml
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getFeedsFromOPMLText(this: ApiRouter, req: RequestWithUser<OpmlTextBody>, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to get feeds from opml`)
      return res.sendStatus(403)
    }

    if (!req.body.opmlText) {
      return res.sendStatus(400)
    }

    res.json({
      feeds: this.podcastManager.getParsedOPMLFileFeeds(req.body.opmlText)
    })
  }

  /**
   * POST: /api/podcasts/opml/create
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async bulkCreatePodcastsFromOpmlFeedUrls(this: ApiRouter, req: RequestWithUser<OpmlCreateBody>, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to bulk create podcasts`)
      return res.sendStatus(403)
    }

    const rssFeeds = req.body.feeds
    if (!Array.isArray(rssFeeds) || !rssFeeds.length || rssFeeds.some((feed) => !validateUrl(feed))) {
      return res.status(400).send('Invalid request body. "feeds" must be an array of RSS feed URLs')
    }

    const libraryId = req.body.libraryId
    const folderId = req.body.folderId
    if (!libraryId || !folderId) {
      return res.status(400).send('Invalid request body. "libraryId" and "folderId" are required')
    }

    const folder = await Database.libraryFolderModel.findByPk(folderId)
    if (!folder || folder.libraryId !== libraryId) {
      return res.status(404).send('Folder not found')
    }
    const autoDownloadEpisodes = !!req.body.autoDownloadEpisodes
    this.podcastManager.createPodcastsFromFeedUrls(rssFeeds, folder, autoDownloadEpisodes, this.cronManager)

    res.sendStatus(200)
  }

  /**
   * GET: /api/podcasts/:id/checknew
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async checkNewEpisodes(this: ApiRouter, req: RequestWithLibraryItem, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to check/download episodes`)
      return res.sendStatus(403)
    }

    if (!req.libraryItem.media.feedURL) {
      Logger.error(`[PodcastController] checkNewEpisodes no feed url for item ${req.libraryItem.id}`)
      return res.status(400).send('Podcast has no rss feed url')
    }

    const maxEpisodesToDownload = !isNaN(req.query.limit) ? Number(req.query.limit) : 3

    const newEpisodes = await this.podcastManager.checkAndDownloadNewEpisodes(req.libraryItem, maxEpisodesToDownload)
    res.json({
      episodes: newEpisodes || []
    })
  }

  /**
   * GET: /api/podcasts/:id/clear-queue
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  clearEpisodeDownloadQueue(this: ApiRouter, req: RequestWithUser, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempting to clear download queue`)
      return res.sendStatus(403)
    }
    (this.podcastManager.clearDownloadQueue as (libraryItemId?: string | null) => void)(req.params.id) // boundary: PodcastManager.js (JS) has a `libraryItemId = null` default, so its parameter is inferred as null (TS2345)
    res.sendStatus(200)
  }

  /**
   * GET: /api/podcasts/:id/downloads
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  getEpisodeDownloads(this: ApiRouter, req: RequestWithLibraryItem, res: Response) {
    const downloadsInQueue = this.podcastManager.getEpisodeDownloadsInQueue(req.libraryItem.id)
    res.json({
      downloads: downloadsInQueue.map((d) => d.toJSONForClient())
    })
  }

  /**
   * GET: /api/podcasts/:id/search-episode
   * Search for an episode in a podcast
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async findEpisode(req: RequestWithLibraryItem, res: Response) {
    const rssFeedUrl = req.libraryItem.media.feedURL
    if (!rssFeedUrl) {
      Logger.error(`[PodcastController] findEpisode: Podcast has no feed url`)
      return res.status(400).send('Podcast does not have an RSS feed URL')
    }

    const searchTitle = req.query.title
    if (!searchTitle || typeof searchTitle !== 'string') {
      return res.sendStatus(500)
    }
    const episodes = await findMatchingEpisodes(rssFeedUrl, searchTitle)
    res.json({
      episodes: episodes || []
    })
  }

  /**
   * POST: /api/podcasts/:id/download-episodes
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async downloadEpisodes(this: ApiRouter, req: RequestWithLibraryItem<RssPodcastEpisode[]>, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to download episodes`)
      return res.sendStatus(403)
    }

    const episodes = req.body
    if (!Array.isArray(episodes) || !episodes.length) {
      return res.sendStatus(400)
    }

    (this.podcastManager.downloadPodcastEpisodes as (libraryItem: LibraryItem, episodesToDownload: RssPodcastEpisode[], isAutoDownload?: boolean) => Promise<void>)(req.libraryItem, episodes) // boundary: the JSDoc of PodcastManager.js (JS) declares isAutoDownload as required, and this call leaves it out (TS2554)
    res.sendStatus(200)
  }

  /**
   * POST: /api/podcasts/:id/match-episodes
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async quickMatchEpisodes(req: RequestWithLibraryItem, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[PodcastController] Non-admin user "${req.user.username}" attempted to download episodes`)
      return res.sendStatus(403)
    }

    const overrideDetails = req.query.override === '1'
    const episodesUpdated = await Scanner.quickMatchPodcastEpisodes(req.libraryItem, { overrideDetails })
    if (episodesUpdated) {
      SocketAuthority.libraryItemEmitter('item_updated', req.libraryItem)
    }

    res.json({
      numEpisodesUpdated: episodesUpdated
    })
  }

  /**
   * PATCH: /api/podcasts/:id/episode/:episodeId
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async updateEpisode(req: RequestWithLibraryItem<UpdateEpisodeBody>, res: Response) {
    /** @type {import('../models/PodcastEpisode')} */
    const episode = req.libraryItem.media.podcastEpisodes.find((ep) => ep.id === req.params.episodeId)
    if (!episode) {
      return res.status(404).send('Episode not found')
    }

    const updatePayload: { [key: string]: unknown } = {} // index signature: filled by a dynamic key
    const supportedStringKeys = ['title', 'subtitle', 'description', 'pubDate', 'episode', 'season', 'episodeType']
    for (const key in req.body) {
      if (supportedStringKeys.includes(key) && typeof req.body[key] === 'string') {
        // Sanitize description HTML
        if (key === 'description' && req.body[key]) {
          const sanitizedDescription = htmlSanitizer.sanitize(req.body[key])
          if (sanitizedDescription !== req.body[key]) {
            Logger.debug(`[PodcastController] Sanitized description from "${req.body[key]}" to "${sanitizedDescription}"`)
            req.body[key] = sanitizedDescription
          }
        } else if (key === 'subtitle' && req.body[key]) {
          const sanitizedSubtitle = htmlSanitizer.sanitize(req.body[key])
          if (sanitizedSubtitle !== req.body[key]) {
            Logger.debug(`[PodcastController] Sanitized subtitle from "${req.body[key]}" to "${sanitizedSubtitle}"`)
            req.body[key] = sanitizedSubtitle
          }
        }

        updatePayload[key] = req.body[key]
      } else if (key === 'enclosure') {
        const enclosure = req.body.enclosure
        if (enclosure === null) {
          updatePayload.enclosureURL = null
          updatePayload.enclosureSize = null
          updatePayload.enclosureType = null
        } else if (typeof enclosure === 'object' && typeof enclosure.url === 'string') {
          updatePayload.enclosureURL = enclosure.url
          updatePayload.enclosureType = typeof enclosure.type === 'string' ? enclosure.type : null
          updatePayload.enclosureSize = enclosure.length !== undefined && enclosure.length !== null ? enclosure.length : null
        }
      } else if (key === 'chapters' && Array.isArray(req.body[key]) && req.body[key].every((ch) => typeof ch === 'object' && ch.title && ch.start)) {
        updatePayload[key] = req.body[key]
      } else if (key === 'publishedAt' && typeof req.body[key] === 'number') {
        updatePayload[key] = req.body[key]
      }
    }

    if (Object.keys(updatePayload).length) {
      episode.set(updatePayload)
      if (episode.changed()) {
        Logger.info(`[PodcastController] Updated episode "${episode.title}" keys`, episode.changed())
        await episode.save()

        SocketAuthority.libraryItemEmitter('item_updated', req.libraryItem)
      } else {
        Logger.info(`[PodcastController] No changes to episode "${episode.title}"`)
      }
    }

    res.json(req.libraryItem.toOldJSONExpanded())
  }

  /**
   * GET: /api/podcasts/:id/episode/:episodeId
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async getEpisode(req: RequestWithLibraryItem, res: Response) {
    const episodeId = req.params.episodeId

    /** @type {import('../models/PodcastEpisode')} */
    const episode = req.libraryItem.media.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[PodcastController] getEpisode episode ${episodeId} not found for item ${req.libraryItem.id}`)
      return res.sendStatus(404)
    }

    res.json(episode.toOldJSON(req.libraryItem.id))
  }

  /**
   * DELETE: /api/podcasts/:id/episode/:episodeId
   *
   * @param {RequestWithLibraryItem} req
   * @param {Response} res
   */
  async removeEpisode(req: RequestWithLibraryItem, res: Response) {
    const episodeId = req.params.episodeId
    const hardDelete = req.query.hard === '1'

    /** @type {import('../models/PodcastEpisode')} */
    const episode = req.libraryItem.media.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[PodcastController] removeEpisode episode ${episodeId} not found for item ${req.libraryItem.id}`)
      return res.sendStatus(404)
    }

    // Remove it from the podcastEpisodes array
    req.libraryItem.media.podcastEpisodes = req.libraryItem.media.podcastEpisodes.filter((ep) => ep.id !== episodeId)

    if (hardDelete) {
      const audioFile = episode.audioFile
      // TODO: this will trigger the watcher. should maybe handle this gracefully
      await (fs as { remove(path: string): Promise<void> }) // boundary: libs/fsExtra (vendored JS) infers remove() as a promise or undefined (undefined only when a callback is passed)
        .remove(audioFile.metadata.path)
        .then(() => {
          Logger.info(`[PodcastController] Hard deleted episode file at "${audioFile.metadata.path}"`)
        })
        .catch((error) => {
          Logger.error(`[PodcastController] Failed to hard delete episode file at "${audioFile.metadata.path}"`, error)
        })
    }

    // Remove episode from playlists
    await Database.playlistModel.removeMediaItemsFromPlaylists([episodeId])

    // Remove media progress for this episode
    const mediaProgressRemoved = await Database.mediaProgressModel.destroy({
      where: {
        mediaItemId: episode.id
      }
    })
    if (mediaProgressRemoved) {
      Logger.info(`[PodcastController] Removed ${mediaProgressRemoved} media progress for episode ${episode.id}`)
    }

    // Remove episode
    await episode.destroy()

    // Remove library file
    req.libraryItem.libraryFiles = req.libraryItem.libraryFiles.filter((file) => file.ino !== episode.audioFile.ino)
    req.libraryItem.changed('libraryFiles', true)
    await req.libraryItem.save()

    // update number of episodes
    req.libraryItem.media.numEpisodes = req.libraryItem.media.podcastEpisodes.length
    await req.libraryItem.media.save()

    SocketAuthority.libraryItemEmitter('item_updated', req.libraryItem)
    res.json(req.libraryItem.toOldJSON())
  }

  /**
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req: RequestWithUser & { libraryItem?: LibraryItem }, res: Response, next: NextFunction) {
    const libraryItem = await Database.libraryItemModel.getExpandedById(req.params.id)
    if (!libraryItem?.media) return res.sendStatus(404)

    if (!libraryItem.isPodcast) {
      return res.sendStatus(500)
    }

    // Check user can access this library item
    if (!req.user.checkCanAccessLibraryItem(libraryItem)) {
      return res.sendStatus(403)
    }

    if (req.method == 'DELETE' && !req.user.canDelete) {
      Logger.warn(`[PodcastController] User "${req.user.username}" attempted to delete without permission`)
      return res.sendStatus(403)
    } else if ((req.method == 'PATCH' || req.method == 'POST') && !req.user.canUpdate) {
      Logger.warn(`[PodcastController] User "${req.user.username}" attempted to update without permission`)
      return res.sendStatus(403)
    }

    req.libraryItem = libraryItem
    next()
  }
}
export = new PodcastController()
