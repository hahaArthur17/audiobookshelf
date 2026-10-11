import type { LibraryItemModelStatic } from '../types/libraryItemModel'
import type { NextFunction, Request, Response } from 'express'
import Sequelize = require('sequelize')
import type { BindOrReplacements, Order, WhereOptions } from 'sequelize'
import Path = require('path')
import fs = require('../libs/fsExtra')
import Logger = require('../Logger')
import SocketAuthority = require('../SocketAuthority')
import libraryHelpers = require('../utils/libraryHelpers')
import libraryItemsBookFilters = require('../utils/queries/libraryItemsBookFilters')
import libraryItemFilters = require('../utils/queries/libraryItemFilters')
import seriesFilters = require('../utils/queries/seriesFilters')
import fileUtils = require('../utils/fileUtils')
import fastSort = require('../libs/fastSort')
const { createNewSortInstance }: {
  // libs/fastSort is vendored and untyped (its sorter takes and returns any): only the call shape used in this file
  createNewSortInstance(opts: { comparer: (a: string, b: string) => number }): <T>(ctx: T[]) => { asc(sortBy: (item: T) => unknown): T[] }
} = fastSort
const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

import LibraryScanner = require('../scanner/LibraryScanner')
import Scanner = require('../scanner/Scanner')
import Database = require('../Database')
import Watcher = require('../Watcher')
import RssFeedManager = require('../managers/RssFeedManager')

import libraryFilters = require('../utils/queries/libraryFilters')
import libraryItemsPodcastFilters = require('../utils/queries/libraryItemsPodcastFilters')
import authorFilters = require('../utils/queries/authorFilters')
import zipHelpers = require('../utils/zipHelpers')

type User = import('../models/User')
type Library = import('../models/Library')
type LibraryItem = import('../models/LibraryItem')
type Series = import('../models/Series')
type Feed = import('../models/Feed')
type Author = import('../models/Author')
type Playlist = import('../models/Playlist')
type PodcastEpisode = import('../models/PodcastEpisode')
type BookAuthor = import('../models/BookAuthor')
type BookSeries = import('../models/BookSeries')
type BookExpanded = import('../models/Book').BookExpanded
type ApiRouter = import('../routers/ApiRouter')

// lib.d.ts types isNaN(number), but the built-in coerces every value and the handlers pass body and query values. Widens the type for this file only; emits no code.
declare function isNaN(value: unknown): boolean

// Query values are assumed to be strings (the code calls .split and .trim on them), except limit and page: middleware() replaces them with numbers before any handler of a /libraries/:id route runs
type LibraryQuery = { include?: string; limit?: number; page?: number; sort?: string; desc?: string; filter?: string; minified?: string; collapseseries?: string; q?: string; force?: string; ext?: string; ids?: string }
type LibraryMiddlewareQuery = { [key: string]: string | number | undefined } // index signature: middleware() reads and replaces limit and page by a dynamic key
type LibraryParams = { id: string; seriesId: string; narratorId: string }
// Body fields have the types the handlers assume after their own checks
type LibraryFolderBody = { id?: string; fullPath?: string; path: string } // path is a string as the handlers assume: create() checks that fullPath or path is a string, update() does not check (see the bug log)
type SettingsByKey = { [key: string]: unknown } // index signature: create() and update() read and assign library settings by a dynamic key
type LibraryBody = { name?: string; folders?: LibraryFolderBody[]; mediaType?: string; icon?: string; provider?: string; displayOrder?: number; settings?: SettingsByKey; [key: string]: unknown } // index signature: create() and update() read req.body by a dynamic key

type RequestUserObject = { user: User }
type RequestWithUser = Request<LibraryParams, unknown, LibraryBody, LibraryQuery> & RequestUserObject
type RequestEntityObject = { library: Library }
type LibraryControllerRequest = RequestWithUser & RequestEntityObject
type LibraryReorderObj = { id: string; newOrder: number }
type LibraryReorderRequest = Request<{}, {}, LibraryReorderObj[], {}> & RequestUserObject

/** What create() builds for Library.create(): libraryFolders and displayOrder are added after the object is built */
type NewLibraryPayload = { name: string; provider: string; mediaType: string; icon: string; settings: SettingsByKey; libraryFolders?: LibraryFolderBody[]; displayOrder?: number }
/** toOldJSON() of a library plus the stats that findAll() adds to the same object */
type LibraryStats = Awaited<ReturnType<typeof libraryItemsBookFilters.getBookLibraryStats>> | Awaited<ReturnType<typeof libraryItemsPodcastFilters.getPodcastLibraryStats>>
type OldLibraryWithStats = ReturnType<Library['toOldJSON']> & { stats?: LibraryStats }
/** The filter data of a library as far as this file reads it: libraryFilters.js (JS) documents it only as object */
type LibraryFilterData = { numIssues?: number }
type LibraryFilterDataMap = { [libraryId: string]: LibraryFilterData } // index signature: Database.libraryFilterData is read and written by a dynamic key (the library id)
/** A book library item: LibraryItem.js (JS) types media as a book or a podcast */
type BookLibraryItem = LibraryItem & { media: BookExpanded }
/** A library item as the removal queries of update(), delete() and removeLibraryItemsWithIssues() load it: media carries ids only. The code reads podcastEpisodes in a podcast library and bookAuthors and bookSeries in a book library */
type LibraryItemToRemove = LibraryItem & { media: { podcastEpisodes: PodcastEpisode[]; bookAuthors: BookAuthor[]; bookSeries: BookSeries[] } }
/** The payload of a paginated list handler: built with empty results and filled afterwards */
type ListPayload<T> = { results: T[]; total: number; limit: number; page: number }
type FilteredListPayload<T> = ListPayload<T> & { sortBy: string | undefined; sortDesc: boolean; filterBy: string | undefined; minified: boolean; include: string | undefined }
/** The payload of getLibraryItems(): total stays undefined when sub-series are collapsed, and offset is added after the object is built */
type LibraryItemsPayload = Omit<FilteredListPayload<object>, 'total'> & { total: number | undefined; mediaType: string; collapseseries: boolean; offset?: number }
/** toOldJSON() of a series plus the keys that getSeriesForLibrary() adds to the same object */
type SeriesJsonWithIncludes = ReturnType<Series['toOldJSON']> & {
  progress?: { libraryItemIds: string[]; libraryItemIdsFinished: string[]; isFinished: boolean }
  rssFeed?: ReturnType<Feed['toOldJSONMinified']> | null
}
/** The payload of stats(): built with largestItems, the other keys are added per media type */
type LibraryStatsPayload = {
  largestItems: Awaited<ReturnType<typeof libraryItemFilters.getLargestItems>>
  totalAuthors?: number
  authorsWithCount?: Awaited<ReturnType<typeof authorFilters.getAuthorsWithCount>>
  totalGenres?: number
  genresWithCount?: Awaited<ReturnType<typeof libraryItemsBookFilters.getGenresWithCount>> | Awaited<ReturnType<typeof libraryItemsPodcastFilters.getGenresWithCount>>
  totalItems?: number
  longestItems?: Awaited<ReturnType<typeof libraryItemsBookFilters.getLongestBooks>> | Awaited<ReturnType<typeof libraryItemsPodcastFilters.getLongestPodcasts>>
  totalSize?: number
  totalDuration?: number
  numAudioTracks?: number
}
/** toOldJSONExpanded() of an author plus lastFirst, which getAuthors() adds to the same object */
type AuthorJsonWithLastFirst = ReturnType<Author['toOldJSONExpanded']> & { lastFirst?: string }

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 *
 * @typedef RequestEntityObject
 * @property {import('../models/Library')} library
 *
 * @typedef {RequestWithUser & RequestEntityObject} LibraryControllerRequest
 */

class LibraryController {
  constructor() {}

  /**
   * POST: /api/libraries
   * Create a new library
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async create(req: RequestWithUser, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to create library`)
      return res.sendStatus(403)
    }

    // Validation
    if (!req.body.name || typeof req.body.name !== 'string') {
      return res.status(400).send('Invalid request. Name must be a string')
    }
    if (
      !Array.isArray(req.body.folders) ||
      req.body.folders.some((f) => {
        // Old model uses fullPath and new model will use path. Support both for now
        const path = f?.fullPath || f?.path
        return !path || typeof path !== 'string'
      })
    ) {
      return res.status(400).send('Invalid request. Folders must be a non-empty array of objects with path string')
    }
    const optionalStringFields = ['mediaType', 'icon', 'provider']
    for (const field of optionalStringFields) {
      if (req.body[field] && typeof req.body[field] !== 'string') {
        return res.status(400).send(`Invalid request. ${field} must be a string`)
      }
    }
    if (req.body.settings && (typeof req.body.settings !== 'object' || Array.isArray(req.body.settings))) {
      return res.status(400).send('Invalid request. Settings must be an object')
    }

    const mediaType = req.body.mediaType || 'book'
    const newLibraryPayload: NewLibraryPayload = {
      name: req.body.name,
      provider: req.body.provider || 'google',
      mediaType,
      icon: req.body.icon || 'database',
      settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType(mediaType)
    }

    // Validate settings
    if (req.body.settings) {
      for (const key in req.body.settings) {
        if (newLibraryPayload.settings[key] !== undefined) {
          if (key === 'metadataPrecedence') {
            if (!Array.isArray(req.body.settings[key])) {
              return res.status(400).send('Invalid request. Settings "metadataPrecedence" must be an array')
            }
            newLibraryPayload.settings[key] = [...req.body.settings[key]]
          } else if (key === 'autoScanCronExpression' || key === 'podcastSearchRegion') {
            if (!req.body.settings[key]) continue
            if (typeof req.body.settings[key] !== 'string') {
              return res.status(400).send(`Invalid request. Settings "${key}" must be a string`)
            }
            newLibraryPayload.settings[key] = req.body.settings[key]
          } else if (key === 'markAsFinishedPercentComplete' || key === 'markAsFinishedTimeRemaining') {
            if (req.body.settings[key] !== null && isNaN(req.body.settings[key])) {
              return res.status(400).send(`Invalid request. Setting "${key}" must be a number`)
            } else if (key === 'markAsFinishedPercentComplete' && req.body.settings[key] !== null && (Number(req.body.settings[key]) < 0 || Number(req.body.settings[key]) > 100)) {
              return res.status(400).send(`Invalid request. Setting "${key}" must be between 0 and 100`)
            } else if (key === 'markAsFinishedTimeRemaining' && req.body.settings[key] !== null && Number(req.body.settings[key]) < 0) {
              return res.status(400).send(`Invalid request. Setting "${key}" must be greater than or equal to 0`)
            }
            newLibraryPayload.settings[key] = req.body.settings[key] === null ? null : Number(req.body.settings[key])
          } else {
            if (typeof req.body.settings[key] !== typeof newLibraryPayload.settings[key]) {
              return res.status(400).send(`Invalid request. Setting "${key}" must be of type ${typeof newLibraryPayload.settings[key]}`)
            }
            newLibraryPayload.settings[key] = req.body.settings[key]
          }
        }
      }
    }

    // Validate that the custom provider exists if given any
    if (newLibraryPayload.provider.startsWith('custom-')) {
      if (!(await Database.customMetadataProviderModel.checkExistsBySlug(newLibraryPayload.provider))) {
        Logger.error(`[LibraryController] Custom metadata provider "${newLibraryPayload.provider}" does not exist`)
        return res.status(400).send('Invalid request. Custom metadata provider does not exist')
      }
    }

    // Validate folder paths exist or can be created & resolve rel paths
    //   returns 400 if a folder fails to access
    newLibraryPayload.libraryFolders = req.body.folders.map((f) => {
      const fpath = f.fullPath || f.path
      f.path = fileUtils.filePathToPOSIX(Path.resolve(fpath))
      return f
    })
    for (const folder of newLibraryPayload.libraryFolders) {
      try {
        // Create folder if it doesn't exist
        await fs.ensureDir(folder.path)
      } catch (error) {
        Logger.error(`[LibraryController] Failed to ensure folder dir "${folder.path}"`, error)
        return res.status(400).send(`Invalid request. Invalid folder directory "${folder.path}"`)
      }
    }

    // Set display order
    let currentLargestDisplayOrder = await Database.libraryModel.getMaxDisplayOrder()
    if (isNaN(currentLargestDisplayOrder)) currentLargestDisplayOrder = 0
    newLibraryPayload.displayOrder = currentLargestDisplayOrder + 1

    // Create library with libraryFolders
    const library = await Database.libraryModel
      .create(newLibraryPayload, {
        include: Database.libraryFolderModel
      })
      .catch((error) => {
        Logger.error(`[LibraryController] Failed to create library "${newLibraryPayload.name}"`, error)
      })
    if (!library) {
      return res.status(500).send('Failed to create library')
    }

    library.libraryFolders = await library.getLibraryFolders()

    // Only emit to users with access to library
    const userFilter = (user: User) => {
      return user.checkCanAccessLibrary?.(library.id)
    }
    SocketAuthority.emitter('library_added', library.toOldJSON(), userFilter)

    // Add library watcher
    Watcher.addLibrary(library)

    res.json(library.toOldJSON())
  }

  /**
   * GET: /api/libraries
   * Get all libraries
   *
   * ?include=stats to load library stats - used in android auto to filter out libraries with no audio
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async findAll(req: RequestWithUser, res: Response) {
    let libraries: Library[] | OldLibraryWithStats[] = await Database.libraryModel.getAllWithFolders()

    const librariesAccessible = req.user.permissions?.librariesAccessible || []
    if (librariesAccessible.length) {
      libraries = libraries.filter((lib) => librariesAccessible.includes(lib.id))
    }

    libraries = libraries.map((lib) => lib.toOldJSON())

    const includeArray = (req.query.include || '').split(',')
    if (includeArray.includes('stats')) {
      for (const library of libraries) {
        if (library.mediaType === 'book') {
          library.stats = await libraryItemsBookFilters.getBookLibraryStats(library.id)
        } else if (library.mediaType === 'podcast') {
          library.stats = await libraryItemsPodcastFilters.getPodcastLibraryStats(library.id)
        }
      }
    }

    res.json({
      libraries
    })
  }

  /**
   * GET: /api/libraries/:id
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async findOne(req: LibraryControllerRequest, res: Response) {
    const includeArray = (req.query.include || '').split(',')
    if (includeArray.includes('filterdata')) {
      const filterdata: LibraryFilterData = await libraryFilters.getFilterData(req.library.mediaType, req.library.id)

      return res.json({
        filterdata,
        issues: filterdata.numIssues,
        numUserPlaylists: await Database.playlistModel.getNumPlaylistsForUserAndLibrary(req.user.id, req.library.id),
        library: req.library.toOldJSON()
      })
    }
    res.json(req.library.toOldJSON())
  }

  /**
   * GET: /api/libraries/:id/episode-downloads
   * Get podcast episodes in download queue
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getEpisodeDownloadQueue(this: ApiRouter, req: LibraryControllerRequest, res: Response) {
    // boundary: PodcastManager.js (JS) declares getDownloadQueueDetails(libraryId = null), so its parameter is typed as null (TS2345); the cast of the callee is erased and keeps this
    const libraryDownloadQueueDetails = (this.podcastManager.getDownloadQueueDetails as (libraryId?: string | null) => ReturnType<ApiRouter['podcastManager']['getDownloadQueueDetails']>)(req.library.id)
    res.json(libraryDownloadQueueDetails)
  }

  /**
   * PATCH: /api/libraries/:id
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async update(this: ApiRouter, req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to update library`)
      return res.sendStatus(403)
    }

    // Validation
    const updatePayload: { displayOrder?: number; settings?: SettingsByKey; [key: string]: unknown } = {} // index signature: filled by a dynamic key
    const keysToCheck = ['name', 'provider', 'mediaType', 'icon']
    for (const key of keysToCheck) {
      if (!req.body[key]) continue
      if (typeof req.body[key] !== 'string') {
        Logger.error(`[LibraryController] Invalid request. ${key} must be a string`)
        return res.status(400).send(`Invalid request. ${key} must be a string`)
      }
      updatePayload[key] = req.body[key]
    }
    if (req.body.displayOrder !== undefined) {
      if (isNaN(req.body.displayOrder)) {
        Logger.error(`[LibraryController] Invalid request. displayOrder must be a number`)
        return res.status(400).send('Invalid request. displayOrder must be a number')
      }
      updatePayload.displayOrder = req.body.displayOrder
    }

    // Validate that the custom provider exists if given any
    if (req.body.provider?.startsWith('custom-')) {
      if (!(await Database.customMetadataProviderModel.checkExistsBySlug(req.body.provider))) {
        Logger.error(`[LibraryController] Custom metadata provider "${req.body.provider}" does not exist`)
        return res.status(400).send('Custom metadata provider does not exist')
      }
    }

    // Validate settings
    const defaultLibrarySettings: SettingsByKey = Database.libraryModel.getDefaultLibrarySettingsForMediaType(req.library.mediaType)
    const updatedSettings: SettingsByKey = {
      ...(req.library.settings || defaultLibrarySettings)
    }
    // In case new settings are added in the future, ensure all settings are present
    for (const key in defaultLibrarySettings) {
      if (updatedSettings[key] === undefined) {
        updatedSettings[key] = defaultLibrarySettings[key]
      }
    }

    let hasUpdates = false
    let hasUpdatedDisableWatcher = false
    let hasUpdatedScanCron = false
    if (req.body.settings) {
      for (const key in req.body.settings) {
        if (!Object.keys(defaultLibrarySettings).includes(key)) {
          continue
        }

        if (key === 'metadataPrecedence') {
          if (!Array.isArray(req.body.settings[key])) {
            Logger.error(`[LibraryController] Invalid request. Settings "metadataPrecedence" must be an array`)
            return res.status(400).send('Invalid request. Settings "metadataPrecedence" must be an array')
          }
          if (JSON.stringify(req.body.settings[key]) !== JSON.stringify(updatedSettings[key])) {
            hasUpdates = true
            updatedSettings[key] = [...req.body.settings[key]]
            Logger.debug(`[LibraryController] Library "${req.library.name}" updating setting "${key}" to "${updatedSettings[key]}"`)
          }
        } else if (key === 'autoScanCronExpression' || key === 'podcastSearchRegion') {
          if (req.body.settings[key] !== null && typeof req.body.settings[key] !== 'string') {
            Logger.error(`[LibraryController] Invalid request. Settings "${key}" must be a string`)
            return res.status(400).send(`Invalid request. Settings "${key}" must be a string`)
          }
          if (req.body.settings[key] !== updatedSettings[key]) {
            if (key === 'autoScanCronExpression') hasUpdatedScanCron = true

            hasUpdates = true
            updatedSettings[key] = req.body.settings[key]
            Logger.debug(`[LibraryController] Library "${req.library.name}" updating setting "${key}" to "${updatedSettings[key]}"`)
          }
        } else if (key === 'markAsFinishedPercentComplete') {
          if (req.body.settings[key] !== null && isNaN(req.body.settings[key])) {
            Logger.error(`[LibraryController] Invalid request. Setting "${key}" must be a number`)
            return res.status(400).send(`Invalid request. Setting "${key}" must be a number`)
          } else if (req.body.settings[key] !== null && (Number(req.body.settings[key]) < 0 || Number(req.body.settings[key]) > 100)) {
            Logger.error(`[LibraryController] Invalid request. Setting "${key}" must be between 0 and 100`)
            return res.status(400).send(`Invalid request. Setting "${key}" must be between 0 and 100`)
          }
          if (req.body.settings[key] !== updatedSettings[key]) {
            hasUpdates = true
            updatedSettings[key] = req.body.settings[key] === null ? null : Number(req.body.settings[key])
            Logger.debug(`[LibraryController] Library "${req.library.name}" updating setting "${key}" to "${updatedSettings[key]}"`)
          }
        } else if (key === 'markAsFinishedTimeRemaining') {
          if (req.body.settings[key] !== null && isNaN(req.body.settings[key])) {
            Logger.error(`[LibraryController] Invalid request. Setting "${key}" must be a number`)
            return res.status(400).send(`Invalid request. Setting "${key}" must be a number`)
          } else if (req.body.settings[key] !== null && Number(req.body.settings[key]) < 0) {
            Logger.error(`[LibraryController] Invalid request. Setting "${key}" must be greater than or equal to 0`)
            return res.status(400).send(`Invalid request. Setting "${key}" must be greater than or equal to 0`)
          }
          if (req.body.settings[key] !== updatedSettings[key]) {
            hasUpdates = true
            updatedSettings[key] = req.body.settings[key] === null ? null : Number(req.body.settings[key])
            Logger.debug(`[LibraryController] Library "${req.library.name}" updating setting "${key}" to "${updatedSettings[key]}"`)
          }
        } else {
          if (typeof req.body.settings[key] !== typeof updatedSettings[key]) {
            Logger.error(`[LibraryController] Invalid request. Setting "${key}" must be of type ${typeof updatedSettings[key]}`)
            return res.status(400).send(`Invalid request. Setting "${key}" must be of type ${typeof updatedSettings[key]}`)
          }
          if (req.body.settings[key] !== updatedSettings[key]) {
            if (key === 'disableWatcher') hasUpdatedDisableWatcher = true

            hasUpdates = true
            updatedSettings[key] = req.body.settings[key]
            Logger.debug(`[LibraryController] Library "${req.library.name}" updating setting "${key}" to "${updatedSettings[key]}"`)
          }
        }
      }
      if (hasUpdates) {
        updatePayload.settings = updatedSettings
        req.library.changed('settings', true)
      }
    }

    let hasFolderUpdates = false
    // Validate new folder paths exist or can be created & resolve rel paths
    //   returns 400 if a new folder fails to access
    if (Array.isArray(req.body.folders)) {
      const newFolderPaths: string[] = []
      req.body.folders = req.body.folders.map((f) => {
        if (!f.id) {
          const path = f.fullPath || f.path
          f.path = fileUtils.filePathToPOSIX(Path.resolve(path))
          newFolderPaths.push(f.path)
        }
        return f
      })
      for (const path of newFolderPaths) {
        const pathExists = await fs.pathExists(path)
        if (!pathExists) {
          const success = await fs
            .ensureDir(path)
            .then(() => true)
            .catch((error: unknown) => {
              Logger.error(`[LibraryController] Failed to ensure folder dir "${path}"`, error)
              return false
            })
          if (!success) {
            Logger.error(`[LibraryController] Invalid folder directory "${path}"`)
            return res.status(400).send(`Invalid folder directory "${path}"`)
          }
        }
        // Create folder
        const libraryFolder = await Database.libraryFolderModel.create({
          path,
          libraryId: req.library.id
        })
        Logger.info(`[LibraryController] Created folder "${libraryFolder.path}" for library "${req.library.name}"`)
        hasFolderUpdates = true
      }

      // Handle removing folders
      for (const folder of req.library.libraryFolders!) { // libraryFolders is set by the include of findByIdWithFolders() in middleware()
        if (!req.body.folders.some((f) => f.id === folder.id)) {
          // Remove library items in folder
          const libraryItemsInFolder = await (Database.libraryItemModel as LibraryItemModelStatic).findAll({ // boundary: LibraryItem.js (JS) is not a Sequelize ModelStatic, see types/libraryItemModel.d.ts
            where: {
              libraryFolderId: folder.id
            },
            attributes: ['id', 'mediaId', 'mediaType'],
            include: [
              {
                model: Database.podcastModel,
                attributes: ['id'],
                include: {
                  model: Database.podcastEpisodeModel,
                  attributes: ['id']
                }
              },
              {
                model: Database.bookModel,
                attributes: ['id'],
                include: [
                  {
                    model: Database.bookAuthorModel,
                    attributes: ['authorId']
                  },
                  {
                    model: Database.bookSeriesModel,
                    attributes: ['seriesId']
                  }
                ]
              }
            ]
          }) as LibraryItemToRemove[] // boundary: LibraryItem.js (JS) types media as a book or a podcast; this query loads only the ids named in LibraryItemToRemove
          Logger.info(`[LibraryController] Removed folder "${folder.path}" from library "${req.library.name}" with ${libraryItemsInFolder.length} library items`)
          const seriesIds = []
          const authorIds = []
          for (const libraryItem of libraryItemsInFolder) {
            let mediaItemIds = []
            if (req.library.isPodcast) {
              mediaItemIds = libraryItem.media.podcastEpisodes.map((pe) => pe.id)
            } else {
              mediaItemIds.push(libraryItem.mediaId)
              if (libraryItem.media.bookAuthors.length) {
                authorIds.push(...libraryItem.media.bookAuthors.map((ba) => ba.authorId))
              }
              if (libraryItem.media.bookSeries.length) {
                seriesIds.push(...libraryItem.media.bookSeries.map((bs) => bs.seriesId))
              }
            }
            Logger.info(`[LibraryController] Removing library item "${libraryItem.id}" from folder "${folder.path}"`)
            await this.handleDeleteLibraryItem(libraryItem.id, mediaItemIds, req.library.id)
          }

          if (authorIds.length) {
            await this.checkRemoveAuthorsWithNoBooks(authorIds)
          }
          if (seriesIds.length) {
            await this.checkRemoveEmptySeries(seriesIds)
          }

          // Remove folder
          await folder.destroy()
          hasFolderUpdates = true
        }
      }
    }

    if (Object.keys(updatePayload).length) {
      req.library.set(updatePayload)
      if (req.library.changed()) {
        Logger.debug(`[LibraryController] Updated library "${req.library.name}" with changed keys ${req.library.changed()}`)
        hasUpdates = true
        await req.library.save()
      }
    }

    if (hasUpdatedScanCron) {
      Logger.debug(`[LibraryController] Updated library "${req.library.name}" auto scan cron`)
      // Update auto scan cron
      this.cronManager.updateLibraryScanCron(req.library)
    }

    if (hasFolderUpdates || hasUpdatedDisableWatcher) {
      req.library.libraryFolders = await req.library.getLibraryFolders()

      // Update watcher
      Watcher.updateLibrary(req.library)

      hasUpdates = true
    }

    if (hasUpdates) {
      // Only emit to users with access to library
      const userFilter = (user: User) => {
        return user.checkCanAccessLibrary?.(req.library.id)
      }
      SocketAuthority.emitter('library_updated', req.library.toOldJSON(), userFilter)

      await Database.resetLibraryIssuesFilterData(req.library.id)
    }
    return res.json(req.library.toOldJSON())
  }

  /**
   * DELETE: /api/libraries/:id
   * Delete a library
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async delete(this: ApiRouter, req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to delete library`)
      return res.sendStatus(403)
    }

    // Remove library watcher
    Watcher.removeLibrary(req.library)

    // Remove collections for library
    const numCollectionsRemoved = await Database.collectionModel.removeAllForLibrary(req.library.id)
    if (numCollectionsRemoved) {
      Logger.info(`[Server] Removed ${numCollectionsRemoved} collections for library "${req.library.name}"`)
    }

    // Remove items in this library
    const libraryItemsInLibrary = await (Database.libraryItemModel as LibraryItemModelStatic).findAll({ // boundary: LibraryItem.js (JS) is not a Sequelize ModelStatic, see types/libraryItemModel.d.ts
      where: {
        libraryId: req.library.id
      },
      attributes: ['id', 'mediaId', 'mediaType'],
      include: [
        {
          model: Database.podcastModel,
          attributes: ['id'],
          include: {
            model: Database.podcastEpisodeModel,
            attributes: ['id']
          }
        }
      ]
    }) as LibraryItemToRemove[] // boundary: LibraryItem.js (JS) types media as a book or a podcast; this query loads only the podcast episode ids
    Logger.info(`[LibraryController] Removing ${libraryItemsInLibrary.length} library items in library "${req.library.name}"`)
    for (const libraryItem of libraryItemsInLibrary) {
      let mediaItemIds = []
      if (req.library.isPodcast) {
        mediaItemIds = libraryItem.media.podcastEpisodes.map((pe) => pe.id)
      } else {
        mediaItemIds.push(libraryItem.mediaId)
      }
      Logger.info(`[LibraryController] Removing library item "${libraryItem.id}" from library "${req.library.name}"`)
      await this.handleDeleteLibraryItem(libraryItem.id, mediaItemIds, req.library.id)
    }

    // Set PlaybackSessions libraryId to null
    const [sessionsUpdated] = await Database.playbackSessionModel.update(
      {
        libraryId: null
      },
      {
        where: {
          libraryId: req.library.id
        }
      }
    )
    Logger.info(`[LibraryController] Updated ${sessionsUpdated} playback sessions to remove library id`)

    const libraryJson = req.library.toOldJSON()
    await req.library.destroy()

    // Re-order libraries
    await Database.libraryModel.resetDisplayOrder()

    SocketAuthority.emitter('library_removed', libraryJson)

    // Remove library filter data
    if ((Database.libraryFilterData as LibraryFilterDataMap)[req.library.id]) { // boundary: Database.js (JS) starts libraryFilterData as {} and gives it no type
      delete (Database.libraryFilterData as LibraryFilterDataMap)[req.library.id] // boundary: see the line above
    }

    return res.json(libraryJson)
  }

  /**
   * GET /api/libraries/:id/items
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getLibraryItems(req: LibraryControllerRequest, res: Response) {
    const include = (req.query.include || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => !!v)

    const payload: LibraryItemsPayload = {
      results: [],
      total: undefined,
      limit: req.query.limit || 0,
      page: req.query.page || 0,
      sortBy: req.query.sort,
      sortDesc: req.query.desc === '1',
      filterBy: req.query.filter,
      mediaType: req.library.mediaType,
      minified: req.query.minified === '1',
      collapseseries: req.query.collapseseries === '1',
      include: include.join(',')
    }

    payload.offset = payload.page * payload.limit

    // TODO: Temporary way of handling collapse sub-series. Either remove feature or handle through sql queries
    const filterByGroup = payload.filterBy?.split('.').shift()
    const filterByValue = filterByGroup ? libraryFilters.decode(payload.filterBy!.replace(`${filterByGroup}.`, '')) : null // filterBy is set here: filterByGroup, tested first, is taken from it
    if (filterByGroup === 'series' && filterByValue !== 'no-series' && payload.collapseseries) {
      const seriesId = libraryFilters.decode(payload.filterBy!.split('.')[1]) // filterBy is set here: filterByGroup is 'series'
      payload.results = await libraryHelpers.handleCollapseSubseries(payload, seriesId as Parameters<typeof libraryHelpers.handleCollapseSubseries>[1], req.user, req.library) // boundary: the JSDoc of libraryHelpers.js (JS) types seriesId as string, but decode() returns null when it fails (TS2345); see the bug log
    } else {
      const { libraryItems, count } = await Database.libraryItemModel.getByFilterAndSort(req.library, req.user, payload)
      payload.results = libraryItems
      payload.total = count
    }

    res.json(payload)
  }

  /**
   * DELETE: /api/libraries/:id/issues
   * Remove all library items missing or invalid
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async removeLibraryItemsWithIssues(this: ApiRouter, req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to delete library items missing or invalid`)
      return res.sendStatus(403)
    }

    const libraryItemsWithIssues = await (Database.libraryItemModel as LibraryItemModelStatic).findAll({ // boundary: LibraryItem.js (JS) is not a Sequelize ModelStatic, see types/libraryItemModel.d.ts
      where: {
        libraryId: req.library.id,
        [Sequelize.Op.or]: [
          {
            isMissing: true
          },
          {
            isInvalid: true
          }
        ]
      },
      attributes: ['id', 'mediaId', 'mediaType'],
      include: [
        {
          model: Database.podcastModel,
          attributes: ['id'],
          include: {
            model: Database.podcastEpisodeModel,
            attributes: ['id']
          }
        },
        {
          model: Database.bookModel,
          attributes: ['id'],
          include: [
            {
              model: Database.bookAuthorModel,
              attributes: ['authorId']
            },
            {
              model: Database.bookSeriesModel,
              attributes: ['seriesId']
            }
          ]
        }
      ]
    }) as LibraryItemToRemove[] // boundary: LibraryItem.js (JS) types media as a book or a podcast; this query loads only the ids named in LibraryItemToRemove

    if (!libraryItemsWithIssues.length) {
      Logger.warn(`[LibraryController] No library items have issues`)
      return res.sendStatus(200)
    }

    Logger.info(`[LibraryController] Removing ${libraryItemsWithIssues.length} items with issues`)
    const authorIds = []
    const seriesIds = []
    for (const libraryItem of libraryItemsWithIssues) {
      let mediaItemIds = []
      if (req.library.isPodcast) {
        mediaItemIds = libraryItem.media.podcastEpisodes.map((pe) => pe.id)
      } else {
        mediaItemIds.push(libraryItem.mediaId)
        if (libraryItem.media.bookAuthors.length) {
          authorIds.push(...libraryItem.media.bookAuthors.map((ba) => ba.authorId))
        }
        if (libraryItem.media.bookSeries.length) {
          seriesIds.push(...libraryItem.media.bookSeries.map((bs) => bs.seriesId))
        }
      }
      Logger.info(`[LibraryController] Removing library item "${libraryItem.id}" with issue`)
      await this.handleDeleteLibraryItem(libraryItem.id, mediaItemIds, req.library.id)
    }

    if (authorIds.length) {
      await this.checkRemoveAuthorsWithNoBooks(authorIds)
    }
    if (seriesIds.length) {
      await this.checkRemoveEmptySeries(seriesIds)
    }

    // Set numIssues to 0 for library filter data
    if ((Database.libraryFilterData as LibraryFilterDataMap)[req.library.id]) { // boundary: Database.js (JS) starts libraryFilterData as {} and gives it no type
      (Database.libraryFilterData as LibraryFilterDataMap)[req.library.id].numIssues = 0 // boundary: see the line above
    }

    res.sendStatus(200)
  }

  /**
   * GET: /api/libraries/:id/series
   * Optional query string: `?include=rssfeed` that adds `rssFeed` to series if a feed is open
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getAllSeriesForLibrary(req: LibraryControllerRequest, res: Response) {
    const include = (req.query.include || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => !!v)

    const payload: FilteredListPayload<object> = {
      results: [],
      total: 0,
      limit: req.query.limit || 0,
      page: req.query.page || 0,
      sortBy: req.query.sort,
      sortDesc: req.query.desc === '1',
      filterBy: req.query.filter,
      minified: req.query.minified === '1',
      include: include.join(',')
    }

    const offset = payload.page * payload.limit
    // boundary (both casts): the JSDoc of seriesFilters.js (JS) types filterBy and sortBy as string, but the query may leave them out, which getFilteredSeries() handles (TS2345)
    const { series, count } = await seriesFilters.getFilteredSeries(req.library, req.user, payload.filterBy as Parameters<typeof seriesFilters.getFilteredSeries>[2], payload.sortBy as Parameters<typeof seriesFilters.getFilteredSeries>[3], payload.sortDesc, include, payload.limit, offset)

    payload.total = count
    payload.results = series
    res.json(payload)
  }

  /**
   * GET: /api/libraries/:id/series/:seriesId
   *
   * Optional includes (e.g. `?include=rssfeed,progress`)
   * rssfeed: adds `rssFeed` to series object if a feed is open
   * progress: adds `progress` to series object with { libraryItemIds:Array<llid>, libraryItemIdsFinished:Array<llid>, isFinished:boolean }
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res - Series
   */
  async getSeriesForLibrary(req: LibraryControllerRequest, res: Response) {
    const include = (req.query.include || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => !!v)

    const series = await Database.seriesModel.findByPk(req.params.seriesId)
    if (!series || series.libraryId !== req.library.id) return res.sendStatus(404)

    const libraryItemsInSeries = await libraryItemsBookFilters.getLibraryItemsForSeries(series, req.user)

    const seriesJson: SeriesJsonWithIncludes = series.toOldJSON()
    if (include.includes('progress')) {
      const libraryItemsFinished = libraryItemsInSeries.filter((li) => !!req.user.getMediaProgress(li.media.id)?.isFinished)
      seriesJson.progress = {
        libraryItemIds: libraryItemsInSeries.map((li) => li.id),
        libraryItemIdsFinished: libraryItemsFinished.map((li) => li.id),
        isFinished: libraryItemsFinished.length >= libraryItemsInSeries.length
      }
    }

    if (include.includes('rssfeed')) {
      const feedObj = await RssFeedManager.findFeedForEntityId(seriesJson.id)
      seriesJson.rssFeed = feedObj?.toOldJSONMinified() || null
    }

    res.json(seriesJson)
  }

  /**
   * GET: /api/libraries/:id/collections
   * Get all collections for library
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getCollectionsForLibrary(req: LibraryControllerRequest, res: Response) {
    const include = (req.query.include || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => !!v)

    const payload: FilteredListPayload<Awaited<ReturnType<typeof Database.collectionModel.getOldCollectionsJsonExpanded>>[number]> = {
      results: [],
      total: 0,
      limit: req.query.limit || 0,
      page: req.query.page || 0,
      sortBy: req.query.sort,
      sortDesc: req.query.desc === '1',
      filterBy: req.query.filter,
      minified: req.query.minified === '1',
      include: include.join(',')
    }

    // TODO: Create paginated queries
    let collections = await Database.collectionModel.getOldCollectionsJsonExpanded(req.user, req.library.id, include)

    payload.total = collections.length

    if (payload.limit) {
      const startIndex = payload.page * payload.limit
      collections = collections.slice(startIndex, startIndex + payload.limit)
    }

    payload.results = collections
    res.json(payload)
  }

  /**
   * GET: /api/libraries/:id/playlists
   * Get playlists for user in library
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getUserPlaylistsForLibrary(req: LibraryControllerRequest, res: Response) {
    let playlistsForUser = await Database.playlistModel.getOldPlaylistsForUserAndLibrary(req.user.id, req.library.id)

    const payload: ListPayload<ReturnType<Playlist['toOldJSONExpanded']>> = {
      results: [],
      total: playlistsForUser.length,
      limit: req.query.limit || 0,
      page: req.query.page || 0
    }

    if (payload.limit) {
      const startIndex = payload.page * payload.limit
      playlistsForUser = playlistsForUser.slice(startIndex, startIndex + payload.limit)
    }

    payload.results = playlistsForUser
    res.json(payload)
  }

  /**
   * GET: /api/libraries/:id/filterdata
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getLibraryFilterData(req: LibraryControllerRequest, res: Response) {
    const filterData = await libraryFilters.getFilterData(req.library.mediaType, req.library.id)
    res.json(filterData)
  }

  /**
   * GET: /api/libraries/:id/personalized
   * Home page shelves
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getUserPersonalizedShelves(req: LibraryControllerRequest, res: Response) {
    const limitPerShelf = req.query.limit || 10
    const include = (req.query.include || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => !!v)
    const shelves = await Database.libraryItemModel.getPersonalizedShelves(req.library, req.user, include, limitPerShelf)
    res.json(shelves)
  }

  /**
   * POST: /api/libraries/order
   * Change the display order of libraries
   *
   * @typedef LibraryReorderObj
   * @property {string} id
   * @property {number} newOrder
   *
   * @typedef {Request<{}, {}, LibraryReorderObj[], {}> & RequestUserObject} LibraryReorderRequest
   *
   * @param {LibraryReorderRequest} req
   * @param {Response} res
   */
  async reorder(req: LibraryReorderRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user}" attempted to reorder libraries`)
      return res.sendStatus(403)
    }

    const libraries = await Database.libraryModel.getAllWithFolders()

    const orderdata = req.body
    if (!Array.isArray(orderdata) || orderdata.some((o) => typeof o?.id !== 'string' || typeof o?.newOrder !== 'number')) {
      return res.status(400).send('Invalid request. Request body must be an array of objects')
    }

    let hasUpdates = false
    for (let i = 0; i < orderdata.length; i++) {
      const library = libraries.find((lib) => lib.id === orderdata[i].id)
      if (!library) {
        Logger.error(`[LibraryController] Invalid library not found in reorder ${orderdata[i].id}`)
        return res.status(400).send(`Library not found with id ${orderdata[i].id}`)
      }
      if (library.displayOrder === orderdata[i].newOrder) continue
      library.displayOrder = orderdata[i].newOrder
      await library.save()
      hasUpdates = true
    }

    if (hasUpdates) {
      libraries.sort((a, b) => a.displayOrder - b.displayOrder)
      Logger.debug(`[LibraryController] Updated library display orders`)
    } else {
      Logger.debug(`[LibraryController] Library orders were up to date`)
    }

    res.json({
      libraries: libraries.map((lib) => lib.toOldJSON())
    })
  }

  /**
   * GET: /api/libraries/:id/search
   * Search library items with query
   *
   * ?q=search
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async search(req: LibraryControllerRequest, res: Response) {
    if (!req.query.q || typeof req.query.q !== 'string') {
      return res.status(400).send('Invalid request. Query param "q" must be a string')
    }

    const limit = req.query.limit || 12
    const query = req.query.q.trim()

    const matches = await libraryItemFilters.search(req.user, req.library, query, limit)
    res.json(matches)
  }

  /**
   * GET: /api/libraries/:id/stats
   * Get stats for library
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async stats(req: LibraryControllerRequest, res: Response) {
    const stats: LibraryStatsPayload = {
      largestItems: await libraryItemFilters.getLargestItems(req.library.id, 10)
    }

    if (req.library.mediaType === 'book') {
      const authors = await authorFilters.getAuthorsWithCount(req.library.id, 10)
      const genres = await libraryItemsBookFilters.getGenresWithCount(req.library.id)
      const bookStats = await libraryItemsBookFilters.getBookLibraryStats(req.library.id)
      const longestBooks = await libraryItemsBookFilters.getLongestBooks(req.library.id, 10)

      stats.totalAuthors = await authorFilters.getAuthorsTotalCount(req.library.id)
      stats.authorsWithCount = authors
      stats.totalGenres = genres.length
      stats.genresWithCount = genres
      stats.totalItems = bookStats.totalItems
      stats.longestItems = longestBooks
      stats.totalSize = bookStats.totalSize
      stats.totalDuration = bookStats.totalDuration
      stats.numAudioTracks = bookStats.numAudioFiles
    } else {
      const genres = await libraryItemsPodcastFilters.getGenresWithCount(req.library.id)
      const podcastStats = await libraryItemsPodcastFilters.getPodcastLibraryStats(req.library.id)
      const longestPodcasts = await libraryItemsPodcastFilters.getLongestPodcasts(req.library.id, 10)

      stats.totalGenres = genres.length
      stats.genresWithCount = genres
      stats.totalItems = podcastStats.totalItems
      stats.longestItems = longestPodcasts
      stats.totalSize = podcastStats.totalSize
      stats.totalDuration = podcastStats.totalDuration
      stats.numAudioTracks = podcastStats.numAudioFiles
    }
    res.json(stats)
  }

  /**
   * GET: /api/libraries/:id/authors
   * Get authors for library
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getAuthors(req: LibraryControllerRequest, res: Response) {
    const isPaginated = req.query.limit && !isNaN(req.query.limit) && !isNaN(req.query.page)

    const payload: FilteredListPayload<AuthorJsonWithLastFirst> = {
      results: [],
      total: 0,
      limit: isPaginated ? Number(req.query.limit) : 0,
      page: isPaginated ? Number(req.query.page) : 0,
      sortBy: req.query.sort,
      sortDesc: req.query.desc === '1',
      filterBy: req.query.filter,
      minified: req.query.minified === '1',
      include: req.query.include
    }

    // create order, limit and offset for pagination
    let offset = isPaginated ? payload.page * payload.limit : undefined
    let limit = isPaginated ? payload.limit : undefined
    let order: Order | undefined = undefined
    const direction = payload.sortDesc ? 'DESC' : 'ASC'
    if (payload.sortBy === 'name') {
      order = [[Sequelize.literal('name COLLATE NOCASE'), direction]]
    } else if (payload.sortBy === 'lastFirst') {
      order = [[Sequelize.literal('lastFirst COLLATE NOCASE'), direction]]
    } else if (payload.sortBy === 'addedAt') {
      order = [['createdAt', direction]]
    } else if (payload.sortBy === 'updatedAt') {
      order = [['updatedAt', direction]]
    } else if (payload.sortBy === 'numBooks') {
      offset = undefined
      limit = undefined
    }

    const { bookWhere, replacements } = libraryItemsBookFilters.getUserPermissionBookWhereQuery(req.user) as { bookWhere: WhereOptions; replacements: BindOrReplacements } // boundary: the JSDoc of libraryItemsBookFilters.js (JS) types replacements as object, which Sequelize does not accept (TS2322)
    const { rows: authors, count } = await Database.authorModel.findAndCountAll({
      where: {
        libraryId: req.library.id
      },
      replacements,
      include: {
        model: Database.bookModel,
        attributes: ['id', 'tags', 'explicit'],
        where: bookWhere,
        required: !req.user.isAdminOrUp, // Only show authors with 0 books for admin users or up
        through: {
          attributes: []
        }
      },
      order: order,
      limit: limit,
      offset: offset,
      distinct: true
    })

    let oldAuthors = []

    for (const author of authors) {
      const oldAuthor: AuthorJsonWithLastFirst = author.toOldJSONExpanded(author.books!.length) // books is set by the include of the query above
      oldAuthor.lastFirst = author.lastFirst
      oldAuthors.push(oldAuthor)
    }

    // numBooks sort is handled post-query
    if (payload.sortBy === 'numBooks') {
      oldAuthors.sort((a, b) => (payload.sortDesc ? b.numBooks! - a.numBooks! : a.numBooks! - b.numBooks!)) // numBooks is optional in the type of toOldJSONExpanded() and is always set by it (four assertions)
      if (isPaginated) {
        const startIndex = payload.page * payload.limit
        const endIndex = startIndex + payload.limit
        oldAuthors = oldAuthors.slice(startIndex, endIndex)
      }
    }

    payload.results = oldAuthors
    if (isPaginated) {
      payload.total = count
      res.json(payload)
    } else {
      res.json({
        authors: payload.results
      })
    }
  }

  /**
   * GET: /api/libraries/:id/narrators
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getNarrators(req: LibraryControllerRequest, res: Response) {
    // Get all books with narrators
    const booksWithNarrators = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col('narrators')), {
        [Sequelize.Op.gt]: 0
      }),
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'libraryId'],
        where: {
          libraryId: req.library.id
        }
      },
      attributes: ['id', 'narrators']
    })

    const narrators: { [name: string]: { id: string; name: string; numBooks: number } } = {} // index signature: filled by a dynamic key (the narrator name)
    for (const book of booksWithNarrators) {
      book.narrators.forEach((n) => {
        if (typeof n !== 'string') {
          Logger.error(`[LibraryController] getNarrators: Invalid narrator "${n}" on book "${book.title}"`)
        } else if (!narrators[n]) {
          narrators[n] = {
            id: encodeURIComponent(Buffer.from(n).toString('base64')),
            name: n,
            numBooks: 1
          }
        } else {
          narrators[n].numBooks++
        }
      })
    }

    res.json({
      narrators: naturalSort(Object.values(narrators)).asc((n) => n.name)
    })
  }

  /**
   * PATCH: /api/libraries/:id/narrators/:narratorId
   * Update narrator name
   * :narratorId is base64 encoded name
   * req.body { name }
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async updateNarrator(req: LibraryControllerRequest, res: Response) {
    if (!req.user.canUpdate) {
      Logger.error(`[LibraryController] Unauthorized user "${req.user.username}" attempted to update narrator`)
      return res.sendStatus(403)
    }

    const narratorName = libraryFilters.decode(req.params.narratorId)
    const updatedName = req.body.name
    if (!updatedName) {
      return res.status(400).send('Invalid request payload. Name not specified.')
    }

    // Update filter data
    Database.replaceNarratorInFilterData(req.library.id, narratorName, updatedName)

    const itemsUpdated = []

    // boundary (both casts): the JSDoc of libraryItemFilters.js (JS) types narrators as string[], but decode() returns null when it fails (TS2322, see the bug log); and LibraryItem.js (JS) types media as a book or a podcast, while this query returns book items
    const itemsWithNarrator = await libraryItemFilters.getAllLibraryItemsWithNarrators([narratorName] as Parameters<typeof libraryItemFilters.getAllLibraryItemsWithNarrators>[0], req.library.id) as BookLibraryItem[]

    for (const libraryItem of itemsWithNarrator) {
      libraryItem.media.narrators = libraryItem.media.narrators.filter((n) => n !== narratorName)
      if (!libraryItem.media.narrators.includes(updatedName)) {
        libraryItem.media.narrators.push(updatedName)
      }
      await libraryItem.media.update({
        narrators: libraryItem.media.narrators
      })

      itemsUpdated.push(libraryItem)
    }

    if (itemsUpdated.length) {
      SocketAuthority.libraryItemsEmitter('items_updated', itemsUpdated)
    }

    res.json({
      updated: itemsUpdated.length
    })
  }

  /**
   * DELETE: /api/libraries/:id/narrators/:narratorId
   * Remove narrator
   * :narratorId is base64 encoded name
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async removeNarrator(req: LibraryControllerRequest, res: Response) {
    if (!req.user.canUpdate) {
      Logger.error(`[LibraryController] Unauthorized user "${req.user.username}" attempted to remove narrator`)
      return res.sendStatus(403)
    }

    const narratorName = libraryFilters.decode(req.params.narratorId)

    // Update filter data
    Database.removeNarratorFromFilterData(req.library.id, narratorName)

    const itemsUpdated = []

    // boundary (both casts): the JSDoc of libraryItemFilters.js (JS) types narrators as string[], but decode() returns null when it fails (TS2322, see the bug log); and LibraryItem.js (JS) types media as a book or a podcast, while this query returns book items
    const itemsWithNarrator = await libraryItemFilters.getAllLibraryItemsWithNarrators([narratorName] as Parameters<typeof libraryItemFilters.getAllLibraryItemsWithNarrators>[0], req.library.id) as BookLibraryItem[]

    for (const libraryItem of itemsWithNarrator) {
      libraryItem.media.narrators = libraryItem.media.narrators.filter((n) => n !== narratorName)
      await libraryItem.media.update({
        narrators: libraryItem.media.narrators
      })

      itemsUpdated.push(libraryItem)
    }

    if (itemsUpdated.length) {
      SocketAuthority.libraryItemsEmitter('items_updated', itemsUpdated)
    }

    res.json({
      updated: itemsUpdated.length
    })
  }

  /**
   * GET: /api/libraries/:id/matchall
   * Quick match all library items. Book libraries only.
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async matchAll(this: ApiRouter, req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-root user "${req.user.username}" attempted to match library items`)
      return res.sendStatus(403)
    }
    Scanner.matchLibraryItems(this, req.library)
    res.sendStatus(200)
  }

  /**
   * POST: /api/libraries/:id/scan
   * Optional query:
   * ?force=1
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async scan(req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to scan library`)
      return res.sendStatus(403)
    }
    res.sendStatus(200)

    const forceRescan = req.query.force === '1'
    await LibraryScanner.scan(req.library, forceRescan)

    await Database.resetLibraryIssuesFilterData(req.library.id)
    Logger.info('[LibraryController] Scan complete')
  }

  /**
   * GET: /api/libraries/:id/recent-episodes
   * Used for latest page
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getRecentEpisodes(req: LibraryControllerRequest, res: Response) {
    if (req.library.mediaType !== 'podcast') {
      return res.sendStatus(404)
    }

    const payload: { episodes: object[]; limit: number; page: number } = {
      episodes: [],
      limit: req.query.limit || 0,
      page: req.query.page || 0
    }

    const offset = payload.page * payload.limit
    payload.episodes = await libraryItemsPodcastFilters.getRecentEpisodes(req.user, req.library, payload.limit, offset)
    res.json(payload)
  }

  /**
   * GET: /api/libraries/:id/opml
   * Get OPML file for a podcast library
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getOPMLFile(this: ApiRouter, req: LibraryControllerRequest, res: Response) {
    const userPermissionPodcastWhere = libraryItemsPodcastFilters.getUserPermissionPodcastWhereQuery(req.user)
    const podcasts = await Database.podcastModel.findAll({
      attributes: ['id', 'feedURL', 'title', 'description', 'itunesPageURL', 'language'],
      where: userPermissionPodcastWhere.podcastWhere,
      replacements: userPermissionPodcastWhere.replacements as BindOrReplacements, // boundary: the JSDoc of libraryItemsPodcastFilters.js (JS) types replacements as object, which Sequelize does not accept (TS2322)
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'libraryId'],
        where: {
          libraryId: req.library.id
        }
      }
    })

    const opmlText = this.podcastManager.generateOPMLFileText(podcasts)
    res.type('application/xml')
    res.send(opmlText)
  }

  /**
   * POST: /api/libraries/:id/remove-metadata
   * Remove all metadata.json or metadata.abs files in library item folders
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async removeAllMetadataFiles(req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to remove all metadata files`)
      return res.sendStatus(403)
    }

    const fileExt = req.query.ext === 'abs' ? 'abs' : 'json'
    const metadataFilename = `metadata.${fileExt}`
    const libraryItemsWithMetadata = await (Database.libraryItemModel as LibraryItemModelStatic).findAll({ // boundary: LibraryItem.js (JS) is not a Sequelize ModelStatic, see types/libraryItemModel.d.ts
      attributes: ['id', 'libraryFiles'],
      where: [
        {
          libraryId: req.library.id
        },
        Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(libraryFiles) WHERE json_valid(libraryFiles) AND json_extract(json_each.value, "$.metadata.filename") = "${metadataFilename}")`), {
          [Sequelize.Op.gte]: 1
        })
      ]
    })
    if (!libraryItemsWithMetadata.length) {
      Logger.info(`[LibraryController] No ${metadataFilename} files found to remove`)
      return res.json({
        found: 0
      })
    }

    Logger.info(`[LibraryController] Found ${libraryItemsWithMetadata.length} ${metadataFilename} files to remove`)

    let numRemoved = 0
    for (const libraryItem of libraryItemsWithMetadata) {
      const metadataFilepath = libraryItem.libraryFiles.find((lf) => lf.metadata.filename === metadataFilename)?.metadata.path
      if (!metadataFilepath) continue
      Logger.debug(`[LibraryController] Removing file "${metadataFilepath}"`)
      if (await fileUtils.removeFile(metadataFilepath)) {
        numRemoved++
      }
    }

    res.json({
      found: libraryItemsWithMetadata.length,
      removed: numRemoved
    })
  }

  /**
   * GET: /api/libraries/:id/podcast-titles
   *
   * Get podcast titles with itunesId and libraryItemId for library
   * Used on the podcast add page in order to check if a podcast is already in the library and redirect to it
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async getPodcastTitles(req: LibraryControllerRequest, res: Response) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[LibraryController] Non-admin user "${req.user.username}" attempted to get podcast titles`)
      return res.sendStatus(403)
    }

    const podcasts = await Database.podcastModel.findAll({
      attributes: ['id', 'title', 'itunesId'],
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'libraryId'],
        where: {
          libraryId: req.library.id
        }
      }
    })

    res.json({
      podcasts: podcasts.map((p) => {
        return {
          title: p.title,
          itunesId: p.itunesId,
          libraryItemId: p.libraryItem!.id, // libraryItem is set by the include of the query above
          libraryId: p.libraryItem!.libraryId // libraryItem is set by the include of the query above
        }
      })
    })
  }

  /**
   * GET: /api/library/:id/download
   * Downloads multiple library items
   *
   * @param {LibraryControllerRequest} req
   * @param {Response} res
   */
  async downloadMultiple(req: LibraryControllerRequest, res: Response) {
    if (!req.user.canDownload) {
      Logger.warn(`User "${req.user.username}" attempted to download without permission`)
      return res.sendStatus(403)
    }

    if (!req.query.ids || typeof req.query.ids !== 'string') {
      res.status(400).send('Invalid request. ids must be a string')
      return
    }

    const itemIds = req.query.ids.split(',')

    const libraryItems = await Database.libraryItemModel.findAllExpandedWhere({
      id: itemIds,
      libraryId: req.library.id
    })

    for (const libraryItem of libraryItems) {
      if (!req.user.checkCanAccessLibraryItem(libraryItem)) {
        return res.sendStatus(403)
      }
    }

    if (libraryItems.length < itemIds.length) {
      Logger.warn(`[LibraryController] User "${req.user.username}" requested ${itemIds.length} items but only ${libraryItems.length} are in library "${req.library.id}"`)
    }

    Logger.info(`[LibraryController] User "${req.user.username}" requested download for items "${itemIds}"`)

    const filename = `LibraryItems-${Date.now()}.zip`
    const pathObjects = libraryItems.map((li) => ({ path: li.path, isFile: li.isFile }))

    if (!pathObjects.length) {
      Logger.warn(`[LibraryController] No library items found for ids "${itemIds}"`)
      return res.status(404).send('Library items not found')
    }

    try {
      await zipHelpers.zipDirectoriesPipe(pathObjects, filename, res)
      Logger.info(`[LibraryController] Downloaded ${pathObjects.length} items "${filename}"`)
    } catch (error) {
      Logger.error(`[LibraryController] Download failed for items "${filename}" at ${pathObjects.map((po) => po.path).join(', ')}`, error)
      zipHelpers.handleDownloadError(error, res)
    }
  }

  /**
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req: Request<LibraryParams, unknown, LibraryBody, LibraryMiddlewareQuery> & RequestUserObject & Partial<RequestEntityObject>, res: Response, next: NextFunction) {
    if (!req.user.checkCanAccessLibrary(req.params.id)) {
      Logger.warn(`[LibraryController] Library ${req.params.id} not accessible to user ${req.user.username}`)
      return res.sendStatus(403)
    }

    const library = await Database.libraryModel.findByIdWithFolders(req.params.id)
    if (!library) {
      return res.status(404).send('Library not found')
    }
    req.library = library

    // Ensure pagination query params are positive integers
    for (const queryKey of ['limit', 'page']) {
      if (req.query[queryKey] !== undefined) {
        req.query[queryKey] = !isNaN(req.query[queryKey]) ? Number(req.query[queryKey]) : 0
        if (!Number.isInteger(req.query[queryKey]) || req.query[queryKey] < 0) {
          return res.status(400).send(`Invalid request. ${queryKey} must be a positive integer`)
        }
      }
    }

    next()
  }
}
export = new LibraryController()
