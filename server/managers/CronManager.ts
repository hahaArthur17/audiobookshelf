import Sequelize = require('sequelize')
import cron = require('../libs/nodeCron')
import Logger = require('../Logger')
import Database = require('../Database')
import LibraryScanner = require('../scanner/LibraryScanner')

import ShareManager = require('./ShareManager')
type PodcastManager = import('./PodcastManager')
type PlaybackSessionManager = import('./PlaybackSessionManager')
type Library = import('../models/Library')
type LibraryItem = import('../models/LibraryItem')
type LibraryItemExpanded = import('../models/LibraryItem').LibraryItemExpanded
type PodcastExpanded = import('../models/Podcast').PodcastExpanded
type ScheduledTask = ReturnType<typeof cron.schedule>

// The media of a podcast library item as checkUpdatePodcastCron reads it. metadata is the shape of the old model (see the TODO there); the Podcast model has no such property
type PodcastMedia = PodcastExpanded & { metadata?: { title?: string } }

interface LibraryScanCron {
  libraryId: string
  expression: string | null
  task: ScheduledTask
}

interface PodcastCron {
  libraryItemIds: string[]
  expression: string
  task: ScheduledTask
}

class CronManager {
  declare podcastManager: PodcastManager
  declare playbackSessionManager: PlaybackSessionManager
  declare libraryScanCrons: LibraryScanCron[]
  declare podcastCrons: PodcastCron[]
  declare podcastCronExpressionsExecuting: string[]

  constructor(podcastManager: PodcastManager, playbackSessionManager: PlaybackSessionManager) {
    /** @type {import('./PodcastManager')} */
    this.podcastManager = podcastManager
    /** @type {import('./PlaybackSessionManager')} */
    this.playbackSessionManager = playbackSessionManager

    this.libraryScanCrons = []
    this.podcastCrons = []

    this.podcastCronExpressionsExecuting = []
  }

  /**
   * Initialize library scan crons & podcast download crons
   *
   * @param {import('../models/Library')[]} libraries
   */
  async init(libraries: Library[]) {
    this.initOpenSessionCleanupCron()
    this.initLibraryScanCrons(libraries)
    await this.initPodcastCrons()
  }

  /**
   * Initialize open session & auth session cleanup cron
   * Runs every day at 00:30
   * Closes open share sessions that have not been updated in 24 hours
   * Closes open playback sessions that have not been updated in 36 hours
   * Cleans up expired auth sessions
   * Deactivates expired api keys
   * TODO: Clients should re-open the session if it is closed so that stale sessions can be closed sooner
   */
  initOpenSessionCleanupCron() {
    cron.schedule('30 0 * * *', async () => {
      Logger.debug('[CronManager] Open session cleanup cron executing')
      ShareManager.closeStaleOpenShareSessions()
      await this.playbackSessionManager.closeStaleOpenSessions()
      await Database.cleanupExpiredSessions()
      await Database.deactivateExpiredApiKeys()
    })
  }

  /**
   * Initialize library scan crons
   * @param {import('../models/Library')[]} libraries
   */
  initLibraryScanCrons(libraries: Library[]) {
    for (const library of libraries) {
      if (library.settings.autoScanCronExpression) {
        this.startCronForLibrary(library)
      }
    }
  }

  /**
   * Start cron schedule for library
   *
   * @param {import('../models/Library')} _library
   */
  startCronForLibrary(_library: Library) {
    Logger.debug(`[CronManager] Init library scan cron for ${_library.name} on schedule ${_library.settings.autoScanCronExpression}`)
    // non-null assertion: autoScanCronExpression starts as null; both callers (initLibraryScanCrons, updateLibraryScanCron) test that it is set before they call this method
    const libScanCron = cron.schedule(_library.settings.autoScanCronExpression!, async () => {
      const library = await Database.libraryModel.findByIdWithFolders(_library.id)
      if (!library) {
        Logger.error(`[CronManager] Library not found for scan cron ${_library.id}`)
      } else {
        Logger.debug(`[CronManager] Library scan cron executing for ${library.name}`)
        LibraryScanner.scan(library)
      }
    })
    this.libraryScanCrons.push({
      libraryId: _library.id,
      expression: _library.settings.autoScanCronExpression,
      task: libScanCron
    })
  }

  /**
   *
   * @param {import('../models/Library')} library
   */
  removeCronForLibrary(library: Library) {
    Logger.debug(`[CronManager] Removing library scan cron for ${library.name}`)
    this.libraryScanCrons = this.libraryScanCrons.filter((lsc) => lsc.libraryId !== library.id)
  }

  /**
   *
   * @param {import('../models/Library')} library
   */
  updateLibraryScanCron(library: Library) {
    const expression = library.settings.autoScanCronExpression
    const existingCron = this.libraryScanCrons.find((lsc) => lsc.libraryId === library.id)

    if (!expression && existingCron) {
      if (existingCron.task.stop) existingCron.task.stop()

      this.removeCronForLibrary(library)
    } else if (!existingCron && expression) {
      this.startCronForLibrary(library)
    } else if (existingCron && existingCron.expression !== expression) {
      if (existingCron.task.stop) existingCron.task.stop()

      this.removeCronForLibrary(library)
      this.startCronForLibrary(library)
    }
  }

  /**
   * Init cron jobs for auto-download podcasts
   */
  async initPodcastCrons() {
    // Built as {} and filled by cron expression below
    const cronExpressionMap: Record<string, { expression: string; libraryItemIds: string[] }> = {}

    const podcastsWithAutoDownload = await Database.podcastModel.findAll({
      where: {
        autoDownloadEpisodes: true,
        autoDownloadSchedule: {
          [Sequelize.Op.not]: null
        }
      },
      include: {
        model: Database.libraryItemModel
      }
    })

    for (const podcast of podcastsWithAutoDownload) {
      if (!cronExpressionMap[podcast.autoDownloadSchedule]) {
        cronExpressionMap[podcast.autoDownloadSchedule] = {
          expression: podcast.autoDownloadSchedule,
          libraryItemIds: []
        }
      }
      cronExpressionMap[podcast.autoDownloadSchedule].libraryItemIds.push(podcast.libraryItem!.id) // non-null assertion: the findAll above includes libraryItemModel
    }

    if (!Object.keys(cronExpressionMap).length) return

    Logger.debug(`[CronManager] Found ${Object.keys(cronExpressionMap).length} podcast episode schedules to start`)
    for (const expression in cronExpressionMap) {
      this.startPodcastCron(expression, cronExpressionMap[expression].libraryItemIds)
    }
  }

  startPodcastCron(expression: string, libraryItemIds: string[]) {
    try {
      if (!cron.validate(expression)) {
        Logger.error(`[CronManager] Invalid auto download schedule cron expression "${expression}" - not starting podcast episode check cron`)
        return
      }

      Logger.debug(`[CronManager] Scheduling podcast episode check cron "${expression}" for ${libraryItemIds.length} item(s)`)
      const task = cron.schedule(expression, () => {
        if (this.podcastCronExpressionsExecuting.includes(expression)) {
          Logger.warn(`[CronManager] Podcast cron "${expression}" is already executing`)
        } else {
          this.executePodcastCron(expression, libraryItemIds)
        }
      })
      this.podcastCrons.push({
        libraryItemIds,
        expression,
        task
      })
    } catch (error) {
      Logger.error(`[PodcastManager] Failed to schedule podcast cron ${expression}`, error)
    }
  }

  async executePodcastCron(expression: string, libraryItemIds?: string[]): Promise<void> // overload (erased): startPodcastCron passes a second argument that the implementation does not take
  async executePodcastCron(expression: string) {
    const podcastCron = this.podcastCrons.find((cron) => cron.expression === expression)
    if (!podcastCron) {
      Logger.error(`[CronManager] Podcast cron not found for expression ${expression}`)
      return
    }
    this.podcastCronExpressionsExecuting.push(expression)

    const libraryItemIds = podcastCron.libraryItemIds
    Logger.debug(`[CronManager] Start executing podcast cron ${expression} for ${libraryItemIds.length} item(s)`)

    // Get podcast library items to check
    const libraryItems: LibraryItemExpanded[] = []
    for (const libraryItemId of libraryItemIds) {
      const libraryItem = await Database.libraryItemModel.getExpandedById(libraryItemId)
      if (!libraryItem) {
        Logger.error(`[CronManager] Library item ${libraryItemId} not found for episode check cron ${expression}`)
        podcastCron.libraryItemIds = podcastCron.libraryItemIds.filter((lid) => lid !== libraryItemId) // Filter it out
      } else {
        libraryItems.push(libraryItem)
      }
    }

    // Run episode checks
    for (const libraryItem of libraryItems) {
      const keepAutoDownloading = await this.podcastManager.runEpisodeCheck(libraryItem)
      if (!keepAutoDownloading) {
        // auto download was disabled
        podcastCron.libraryItemIds = podcastCron.libraryItemIds.filter((lid) => lid !== libraryItem.id) // Filter it out
      }
    }

    // Stop and remove cron if no more library items
    if (!podcastCron.libraryItemIds.length) {
      this.removePodcastEpisodeCron(podcastCron)
      return
    }

    Logger.debug(`[CronManager] Finished executing podcast cron ${expression} for ${libraryItems.length} item(s)`)
    this.podcastCronExpressionsExecuting = this.podcastCronExpressionsExecuting.filter((exp) => exp !== expression)
  }

  removePodcastEpisodeCron(podcastCron: PodcastCron) {
    Logger.info(`[CronManager] Stopping & removing podcast episode cron for ${podcastCron.expression}`)
    if (podcastCron.task) podcastCron.task.stop()
    this.podcastCrons = this.podcastCrons.filter((pc) => pc.expression !== podcastCron.expression)
  }

  /**
   *
   * @param {import('../models/LibraryItem')} libraryItem
   */
  checkUpdatePodcastCron(libraryItem: LibraryItem) {
    // Remove from old cron by library item id
    const existingCron = this.podcastCrons.find((pc) => pc.libraryItemIds.includes(libraryItem.id))
    if (existingCron) {
      existingCron.libraryItemIds = existingCron.libraryItemIds.filter((lid) => lid !== libraryItem.id)
      if (!existingCron.libraryItemIds.length) {
        this.removePodcastEpisodeCron(existingCron)
      }
    }

    // Add to cron or start new cron
    if ((libraryItem.media as PodcastMedia).autoDownloadEpisodes && (libraryItem.media as PodcastMedia).autoDownloadSchedule) { // boundary (both casts): LibraryItem.js (JS) types media as a book or a podcast; the callers pass a podcast item
      const cronMatchingExpression = this.podcastCrons.find((pc) => pc.expression === (libraryItem.media as PodcastMedia).autoDownloadSchedule) // boundary: as on the line above
      if (cronMatchingExpression) {
        cronMatchingExpression.libraryItemIds.push(libraryItem.id)

        // TODO: Update after old model removed
        const podcastTitle = libraryItem.media.title || (libraryItem.media as PodcastMedia).metadata?.title // boundary: as above; metadata is read from the old model's shape
        Logger.info(`[CronManager] Added podcast "${podcastTitle}" to auto dl episode cron "${cronMatchingExpression.expression}"`)
      } else {
        this.startPodcastCron((libraryItem.media as PodcastMedia).autoDownloadSchedule, [libraryItem.id]) // boundary: as above
      }
    }
  }
}
export = CronManager
