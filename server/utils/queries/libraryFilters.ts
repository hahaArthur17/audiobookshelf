type LibraryFiltersPagination = number | string | null | undefined

interface LibraryFiltersUser {
  id?: string
  canAccessExplicitContent: boolean
  permissions?: {
    accessAllTags?: boolean
    itemTagsSelected?: string[] | null
    selectedTagsNotAccessible?: boolean
  }
}

interface LibraryFiltersOldItem {
  [key: string]: unknown
  media: Record<string, unknown> & {
    size?: unknown
    metadata: Record<string, unknown> & { series?: unknown }
  }
}

interface LibraryFiltersFeed {
  toOldJSONMinified(): unknown
}

interface LibraryFiltersItem {
  [key: string]: unknown
  id: string
  size?: unknown
  rssFeed?: LibraryFiltersFeed | null
  mediaItemShare?: unknown
  numEpisodesIncomplete?: number
  recentEpisode?: unknown
  series?: unknown
  toOldJSONMinified(): LibraryFiltersOldItem
}

interface LibraryFiltersBook {
  [key: string]: unknown
  id: string
  tags?: string[] | null
  genres?: string[] | null
  narrators?: string[] | null
  publisher?: string | null
  publishedYear?: number | null
  language?: string | null
  libraryItem: LibraryFiltersItem & { isMissing?: unknown; isInvalid?: unknown }
  authors?: unknown[]
  series?: unknown[]
}

interface LibraryFiltersBookSeries {
  sequence?: string | null
  book: Omit<LibraryFiltersBook, 'libraryItem'> & { libraryItem?: LibraryFiltersItem }
}

interface LibraryFiltersOldSeries {
  [key: string]: unknown
  rssFeed?: unknown
  books?: Array<LibraryFiltersOldItem | null>
}

interface LibraryFiltersSeries {
  [key: string]: unknown
  id: string
  name?: string | null
  feeds?: LibraryFiltersFeed[]
  bookSeries: LibraryFiltersBookSeries[]
  toOldJSON(): LibraryFiltersOldSeries
}

interface LibraryFiltersAuthor {
  [key: string]: unknown
  id: string
  name: string
  books: unknown[]
  toOldJSONExpanded(numBooks: number): unknown
}

interface LibraryFiltersPodcast {
  tags?: string[] | null
  genres?: string[] | null
  language?: string | null
}

interface LibraryFiltersQueryOptions {
  [key: string]: unknown
  [key: symbol]: unknown
  limit?: LibraryFiltersPagination
  offset?: LibraryFiltersPagination
}

interface LibraryFiltersQueryModel<Row> {
  count(options: LibraryFiltersQueryOptions): Promise<number>
  findAll(options: LibraryFiltersQueryOptions): Promise<Row[]>
  findAndCountAll(options: LibraryFiltersQueryOptions): Promise<{ rows: Row[]; count: number }>
}

interface LibraryFiltersData {
  authors: Array<{ id: string; name: string }>
  genres: Set<string> | string[]
  tags: Set<string> | string[]
  series: Array<{ id: string; name: string }>
  narrators: Set<string> | string[]
  languages: Set<string> | string[]
  publishers: Set<string> | string[]
  publishedDecades: Set<string> | string[]
  bookCount: number
  authorCount: number
  seriesCount: number
  podcastCount: number
  numIssues: number
  loadedAt?: number
}

interface LibraryFiltersDatabase {
  libraryFilterData: Record<string, LibraryFiltersData | undefined>
  bookModel: LibraryFiltersQueryModel<LibraryFiltersBook>
  seriesModel: LibraryFiltersQueryModel<LibraryFiltersSeries>
  authorModel: LibraryFiltersQueryModel<LibraryFiltersAuthor>
  podcastModel: LibraryFiltersQueryModel<LibraryFiltersPodcast>
  libraryItemModel: unknown
  feedModel: unknown
  bookSeriesModel: unknown
}

interface LibraryFiltersLibrary {
  id: string
  isBook: boolean
  mediaType: string
  settings: { hideSingleBookSeries?: boolean }
}

interface LibraryFiltersAuthorSource {
  id: string
  libraryId: string
}

interface LibraryFiltersModule {
  decode(text: string): string | null
  getFilteredLibraryItems(libraryId: string, user: LibraryFiltersUser, options: {
    filterBy?: string | null
    sortBy?: string | null
    sortDesc?: boolean | string | null
    limit?: LibraryFiltersPagination
    offset?: LibraryFiltersPagination
    collapseseries?: boolean
    include: string[]
    mediaType?: string
  }): Promise<{ libraryItems: LibraryFiltersItem[]; count: number | undefined }>
  getMediaItemsInProgress(library: LibraryFiltersLibrary, user: LibraryFiltersUser, include: string[], limit: LibraryFiltersPagination): Promise<{ items: LibraryFiltersOldItem[]; count: number | undefined }>
  getLibraryItemsMostRecentlyAdded(library: LibraryFiltersLibrary, user: LibraryFiltersUser, include: string[], limit: LibraryFiltersPagination): Promise<{ libraryItems: LibraryFiltersOldItem[]; count: number | undefined }>
  getLibraryItemsContinueSeries(library: LibraryFiltersLibrary, user: LibraryFiltersUser, include: string[], limit: LibraryFiltersPagination): Promise<{ libraryItems: LibraryFiltersOldItem[]; count: number | undefined }>
  getMediaFinished(library: LibraryFiltersLibrary, user: LibraryFiltersUser, include: string[], limit: LibraryFiltersPagination): Promise<{ items: LibraryFiltersOldItem[]; count: number | undefined }>
  getSeriesMostRecentlyAdded(library: LibraryFiltersLibrary, user: LibraryFiltersUser, include: string[], limit: LibraryFiltersPagination): Promise<{ series: LibraryFiltersOldSeries[]; count: number }>
  getNewestAuthors(library: LibraryFiltersLibrary, user: LibraryFiltersUser, limit: LibraryFiltersPagination): Promise<{ authors: unknown[]; count: number }>
  getLibraryItemsToDiscover(library: LibraryFiltersLibrary, user: LibraryFiltersUser, include: string[], limit: LibraryFiltersPagination): Promise<{ libraryItems: LibraryFiltersOldItem[]; count: number | undefined }>
  getNewestPodcastEpisodes(library: LibraryFiltersLibrary, user: LibraryFiltersUser, limit: LibraryFiltersPagination): Promise<{ libraryItems: LibraryFiltersOldItem[]; count: number | undefined }>
  getLibraryItemsForAuthor(author: LibraryFiltersAuthorSource, user: LibraryFiltersUser, limit: LibraryFiltersPagination, offset: LibraryFiltersPagination): Promise<{ libraryItems: LibraryFiltersItem[]; count: number | undefined }>
  getLibraryItemsForCollection(collection: unknown): Promise<LibraryFiltersItem[]>
  getFilterData(mediaType: string, libraryId: string): Promise<LibraryFiltersData>
}

interface LibraryFiltersBookModule {
  getFilteredLibraryItems(...args: unknown[]): Promise<{ libraryItems: LibraryFiltersItem[]; count: number | undefined }>
  getContinueSeriesLibraryItems(...args: unknown[]): Promise<{ libraryItems: LibraryFiltersItem[]; count: number }>
  getDiscoverLibraryItems(...args: unknown[]): Promise<{ libraryItems: LibraryFiltersItem[]; count: number | undefined }>
  getUserPermissionBookWhereQuery(user: LibraryFiltersUser): { bookWhere: unknown[]; replacements: Record<string, unknown> }
  getLibraryItemsForCollection(collection: unknown): Promise<LibraryFiltersItem[]>
}

interface LibraryFiltersPodcastModule {
  getFilteredLibraryItems(...args: unknown[]): Promise<{ libraryItems: LibraryFiltersItem[]; count: number | undefined }>
  getFilteredPodcastEpisodes(...args: unknown[]): Promise<{ libraryItems: LibraryFiltersItem[]; count: number | undefined }>
}

const Sequelize = require('sequelize') as typeof import('sequelize')
const Logger = require('../../Logger')
const Database = require('../../Database') as LibraryFiltersDatabase
const libraryItemsBookFilters = require('./libraryItemsBookFilters') as LibraryFiltersBookModule
const libraryItemsPodcastFilters = require('./libraryItemsPodcastFilters') as LibraryFiltersPodcastModule
const { createNewSortInstance } = require('../../libs/fastSort')
const { profile } = require('../../utils/profiler')
const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

const libraryFilters: LibraryFiltersModule = {
  decode(text) {
    try {
      return Buffer.from(decodeURIComponent(text), 'base64').toString()
    } catch (error) {
      Logger.warn(`[libraryFilters] Failed to decode filter value "${text}": ${(error as { message: unknown }).message}`)
      return null
    }
  },

  /**
   * Get library items using filter and sort
   * @param {string} libraryId
   * @param {import('../../models/User')} user
   * @param {object} options
   * @returns {Promise<{ libraryItems:import('../../models/LibraryItem')[], count:number }>}
   */
  async getFilteredLibraryItems(libraryId, user, options) {
    const { filterBy, sortBy, sortDesc, limit, offset, collapseseries, include, mediaType } = options

    let filterValue = null
    let filterGroup = null
    if (filterBy) {
      const searchGroups = ['genres', 'tags', 'series', 'authors', 'progress', 'narrators', 'publishers', 'publishedDecades', 'missing', 'languages', 'tracks', 'ebooks']
      const group = searchGroups.find((_group) => filterBy.startsWith(_group + '.'))
      filterGroup = group || filterBy
      filterValue = group ? this.decode(filterBy.replace(`${group}.`, '')) : null
    }

    if (mediaType === 'book') {
      return libraryItemsBookFilters.getFilteredLibraryItems(libraryId, user, filterGroup, filterValue, sortBy, sortDesc, collapseseries, include, limit, offset)
    } else {
      return libraryItemsPodcastFilters.getFilteredLibraryItems(libraryId, user, filterGroup, filterValue, sortBy, sortDesc, include, limit, offset)
    }
  },

  /**
   * Get library items for continue listening & continue reading shelves
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {string[]} include
   * @param {number} limit
   * @returns {Promise<{ items:import('../../models/LibraryItem')[], count:number }>}
   */
  async getMediaItemsInProgress(library, user, include, limit) {
    if (library.isBook) {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(library.id, user, 'progress', 'in-progress', 'progress', true, false, include, limit, 0, true)
      return {
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.mediaItemShare) {
            oldLibraryItem.mediaItemShare = li.mediaItemShare
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredPodcastEpisodes(library.id, user, 'progress', 'in-progress', 'progress', true, limit, 0, true)
      return {
        count,
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          oldLibraryItem.recentEpisode = li.recentEpisode
          return oldLibraryItem
        })
      }
    }
  },

  /**
   * Get library items for most recently added shelf
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {string[]} include
   * @param {number} limit
   * @returns {object} { libraryItems:LibraryItem[], count:number }
   */
  async getLibraryItemsMostRecentlyAdded(library, user, include, limit) {
    if (library.isBook) {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(library.id, user, 'recent', null, 'addedAt', true, false, include, limit, 0)
      return {
        libraryItems: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.size && !oldLibraryItem.media.size) {
            oldLibraryItem.media.size = li.size
          }
          if (li.mediaItemShare) {
            oldLibraryItem.mediaItemShare = li.mediaItemShare
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredLibraryItems(library.id, user, 'recent', null, 'addedAt', true, include, limit, 0)
      return {
        libraryItems: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.size && !oldLibraryItem.media.size) {
            oldLibraryItem.media.size = li.size
          }
          if (li.numEpisodesIncomplete) {
            oldLibraryItem.numEpisodesIncomplete = li.numEpisodesIncomplete
          }
          return oldLibraryItem
        }),
        count
      }
    }
  },

  /**
   * Get library items for continue series shelf
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {string[]} include
   * @param {number} limit
   * @returns {object} { libraryItems:LibraryItem[], count:number }
   */
  async getLibraryItemsContinueSeries(library, user, include, limit) {
    const { libraryItems, count } = await libraryItemsBookFilters.getContinueSeriesLibraryItems(library, user, include, limit, 0)
    return {
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        if (li.rssFeed) {
          oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
        }
        if (li.series) {
          oldLibraryItem.media.metadata.series = li.series
        }
        if (li.mediaItemShare) {
          oldLibraryItem.mediaItemShare = li.mediaItemShare
        }
        return oldLibraryItem
      }),
      count
    }
  },

  /**
   * Get library items or podcast episodes for the "Listen Again" and "Read Again" shelf
   *
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {string[]} include
   * @param {number} limit
   * @returns {Promise<{ items:oldLibraryItem[], count:number }>}
   */
  async getMediaFinished(library, user, include, limit) {
    if (library.isBook) {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(library.id, user, 'progress', 'finished', 'progress', true, false, include, limit, 0)
      return {
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.mediaItemShare) {
            oldLibraryItem.mediaItemShare = li.mediaItemShare
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredPodcastEpisodes(library.id, user, 'progress', 'finished', 'progress', true, limit, 0)
      return {
        count,
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          oldLibraryItem.recentEpisode = li.recentEpisode
          return oldLibraryItem
        })
      }
    }
  },

  /**
   * Get series for recent series shelf
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {string[]} include
   * @param {number} limit
   * @returns {{ series:any[], count:number}}
   */
  async getSeriesMostRecentlyAdded(library, user, include, limit) {
    if (!library.isBook) return { series: [], count: 0 }

    const seriesIncludes = []
    if (include.includes('rssfeed')) {
      seriesIncludes.push({
        model: Database.feedModel
      })
    }

    const userPermissionBookWhere = libraryItemsBookFilters.getUserPermissionBookWhereQuery(user)

    const seriesWhere: unknown[] = [
      {
        libraryId: library.id,
        createdAt: {
          [Sequelize.Op.gte]: new Date((new Date() as Date & number) - 60 * 24 * 60 * 60 * 1000) // 60 days ago
        }
      }
    ]

    // Handle library setting to hide single book series
    // TODO: Merge with existing query
    if (library.settings.hideSingleBookSeries) {
      seriesWhere.push(
        Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id)`), {
          [Sequelize.Op.gt]: 1
        })
      )
    }

    // Handle user permissions to only include series with at least 1 book
    // TODO: Simplify to a single query
    if (userPermissionBookWhere.bookWhere.length) {
      let attrQuery = 'SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id'
      if (!user.canAccessExplicitContent) {
        attrQuery += ' AND b.explicit = 0'
      }
      if (!user.permissions?.accessAllTags && user.permissions?.itemTagsSelected?.length) {
        if (user.permissions.selectedTagsNotAccessible) {
          attrQuery += ' AND (SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected)) = 0'
        } else {
          attrQuery += ' AND (SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected)) > 0'
        }
      }
      seriesWhere.push(
        Sequelize.where(Sequelize.literal(`(${attrQuery})`), {
          [Sequelize.Op.gt]: 0
        })
      )
    }

    const { rows: series, count } = await Database.seriesModel.findAndCountAll({
      where: seriesWhere,
      limit,
      offset: 0,
      distinct: true,
      subQuery: false,
      replacements: userPermissionBookWhere.replacements,
      include: [
        {
          model: Database.bookSeriesModel,
          include: {
            model: Database.bookModel,
            where: userPermissionBookWhere.bookWhere,
            include: {
              model: Database.libraryItemModel
            }
          },
          separate: true
        },
        ...seriesIncludes
      ],
      order: [['createdAt', 'DESC']]
    })

    const allOldSeries: LibraryFiltersOldSeries[] = []
    for (const s of series) {
      const oldSeries = s.toOldJSON()

      if (s.feeds?.length) {
        oldSeries.rssFeed = s.feeds[0].toOldJSONMinified()
      }

      // TODO: Sort books by sequence in query
      s.bookSeries.sort((a, b) => {
        if (!a.sequence) return 1
        if (!b.sequence) return -1
        return a.sequence.localeCompare(b.sequence, undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      })
      oldSeries.books = s.bookSeries
        .map((bs) => {
          const libraryItem = bs.book.libraryItem
          if (!libraryItem) {
            Logger.warn(`Book series book has no libraryItem`, bs, bs.book, 'series=', series)
            return null
          }

          delete bs.book.libraryItem
          bs.book.authors = [] // Not needed
          bs.book.series = [] // Not needed
          libraryItem.media = bs.book
          const oldLibraryItem = libraryItem.toOldJSONMinified()
          return oldLibraryItem
        })
        .filter((b) => b)
      allOldSeries.push(oldSeries)
    }

    return {
      series: allOldSeries,
      count
    }
  },

  /**
   * Get most recently created authors for "Newest Authors" shelf
   * Author must be linked to at least 1 book
   *
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {number} limit
   * @returns {Promise<{ authors:oldAuthor[], count:number }>}
   */
  async getNewestAuthors(library, user, limit) {
    if (library.mediaType !== 'book') return { authors: [], count: 0 }

    const { bookWhere, replacements } = libraryItemsBookFilters.getUserPermissionBookWhereQuery(user)

    const { rows: authors, count } = await Database.authorModel.findAndCountAll({
      where: {
        libraryId: library.id,
        createdAt: {
      [Sequelize.Op.gte]: new Date((new Date() as Date & number) - 60 * 24 * 60 * 60 * 1000) // 60 days ago
        }
      },
      replacements,
      include: {
        model: Database.bookModel,
        attributes: ['id', 'tags', 'explicit'],
        where: bookWhere,
        required: true, // Must belong to a book
        through: {
          attributes: []
        }
      },
      limit,
      distinct: true,
      order: [['createdAt', 'DESC']]
    })

    return {
      authors: authors.map((au) => {
        const numBooks = au.books.length || 0
        return au.toOldJSONExpanded(numBooks)
      }),
      count
    }
  },

  /**
   * Get book library items for the "Discover" shelf
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {string[]} include
   * @param {number} limit
   * @returns {Promise<{libraryItems:oldLibraryItem[], count:number}>}
   */
  async getLibraryItemsToDiscover(library, user, include, limit) {
    if (library.mediaType !== 'book') return { libraryItems: [], count: 0 }

    const { libraryItems, count } = await libraryItemsBookFilters.getDiscoverLibraryItems(library.id, user, include, limit)
    return {
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        if (li.rssFeed) {
          oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
        }
        if (li.mediaItemShare) {
          oldLibraryItem.mediaItemShare = li.mediaItemShare
        }
        return oldLibraryItem
      }),
      count
    }
  },

  /**
   * Get podcast episodes most recently added
   * @param {import('../../models/Library')} library
   * @param {import('../../models/User')} user
   * @param {number} limit
   * @returns {Promise<{libraryItems:oldLibraryItem[], count:number}>}
   */
  async getNewestPodcastEpisodes(library, user, limit) {
    if (library.mediaType !== 'podcast') return { libraryItems: [], count: 0 }

    const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredPodcastEpisodes(library.id, user, 'recent', null, 'createdAt', true, limit, 0)
    return {
      count,
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        oldLibraryItem.recentEpisode = li.recentEpisode
        return oldLibraryItem
      })
    }
  },

  /**
   * Get library items for an author, optional use user permissions
   * @param {import('../../models/Author')} author
   * @param {import('../../models/User')} user
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<{ libraryItems:import('../../models/LibraryItem')[], count:number }>}
   */
  async getLibraryItemsForAuthor(author, user, limit, offset) {
    const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(author.libraryId, user, 'authors', author.id, 'addedAt', true, false, [], limit, offset)
    return {
      count,
      libraryItems
    }
  },

  /**
   * Get book library items in a collection
   * @param {oldCollection} collection
   * @returns {Promise<import('../../models/LibraryItem')[]>}
   */
  getLibraryItemsForCollection(collection) {
    return libraryItemsBookFilters.getLibraryItemsForCollection(collection)
  },

  /**
   * Get filter data used in filter menus
   * @param {string} mediaType
   * @param {string} libraryId
   * @returns {Promise<object>}
   */
  async getFilterData(mediaType, libraryId) {
    const cachedFilterData = Database.libraryFilterData[libraryId]
    if (cachedFilterData) {
      const cacheElapsed = Date.now() - cachedFilterData.loadedAt!
      // Cache library filters for 30 mins
      // TODO: Keep cached filter data up-to-date on updates
      if (cacheElapsed < 1000 * 60 * 30) {
        return cachedFilterData
      }
    }
    const start = Date.now() // Temp for checking load times

    const data: LibraryFiltersData = {
      authors: [],
      genres: new Set<string>(),
      tags: new Set<string>(),
      series: [],
      narrators: new Set<string>(),
      languages: new Set<string>(),
      publishers: new Set<string>(),
      publishedDecades: new Set<string>(),
      bookCount: 0, // How many books returned from database query
      authorCount: 0, // How many authors returned from database query
      seriesCount: 0, // How many series returned from database query
      podcastCount: 0, // How many podcasts returned from database query
      numIssues: 0
    }

    const lastLoadedAt = cachedFilterData ? cachedFilterData.loadedAt! : 0

    if (mediaType === 'podcast') {
      // Check how many podcasts are in library to determine if we need to load all of the data
      // This is done to handle the edge case of podcasts having been deleted and not having
      // an updatedAt timestamp to trigger a reload of the filter data
      const podcastModelCount = process.env.QUERY_PROFILING ? profile(Database.podcastModel.count.bind(Database.podcastModel)) : Database.podcastModel.count.bind(Database.podcastModel)
      const podcastCountFromDatabase = await podcastModelCount({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId: libraryId
          }
        }
      })

      // To reduce the cold-start load time, first check if any podcasts
      // have an "updatedAt" timestamp since the last time the filter
      // data was loaded. If so, we can skip loading all of the data.
      // Because many items could change, just check the count of items instead
      // of actually loading the data twice
      const changedPodcasts = await podcastModelCount({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId: libraryId,
            updatedAt: {
              [Sequelize.Op.gt]: new Date(lastLoadedAt)
            }
          }
        },
        where: {
          updatedAt: {
            [Sequelize.Op.gt]: new Date(lastLoadedAt)
          }
        },
        limit: 1
      })

      if (changedPodcasts === 0) {
        // If nothing has changed, check if the number of podcasts in
        // library is still the same as prior check before updating cache creation time

        if (podcastCountFromDatabase === Database.libraryFilterData[libraryId]?.podcastCount) {
          Logger.debug(`Filter data for ${libraryId} has not changed, returning cached data and updating cache time after ${((Date.now() - start) / 1000).toFixed(2)}s`)
          Database.libraryFilterData[libraryId]!.loadedAt = Date.now()
          return cachedFilterData!
        }
      }

      // Something has changed in the podcasts table, so reload all of the filter data for library
      const findAll = process.env.QUERY_PROFILING ? profile(Database.podcastModel.findAll.bind(Database.podcastModel)) : Database.podcastModel.findAll.bind(Database.podcastModel)
      const podcasts: LibraryFiltersPodcast[] = await findAll({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId: libraryId
          }
        },
        attributes: ['tags', 'genres', 'language']
      })
      for (const podcast of podcasts) {
        if (podcast.tags?.length) {
          podcast.tags.forEach((tag) => (data.tags as Set<string>).add(tag))
        }
        if (podcast.genres?.length) {
          podcast.genres.forEach((genre) => (data.genres as Set<string>).add(genre))
        }
        if (podcast.language) {
          (data.languages as Set<string>).add(podcast.language)
        }
      }

      // Set podcast count for later comparison
      data.podcastCount = podcastCountFromDatabase
    } else {
      const bookCountFromDatabase = await Database.bookModel.count({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId: libraryId
          }
        }
      })

      const seriesCountFromDatabase = await Database.seriesModel.count({
        where: {
          libraryId: libraryId
        }
      })

      const authorCountFromDatabase = await Database.authorModel.count({
        where: {
          libraryId: libraryId
        }
      })

      // To reduce the cold-start load time, first check if any library items, series,
      // or authors have an "updatedAt" timestamp since the last time the filter
      // data was loaded. If so, we can skip loading all of the data.
      // Because many items could change, just check the count of items instead
      // of actually loading the data twice

      const changedBooks = await Database.bookModel.count({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId: libraryId,
            updatedAt: {
              [Sequelize.Op.gt]: new Date(lastLoadedAt)
            }
          }
        },
        where: {
          updatedAt: {
            [Sequelize.Op.gt]: new Date(lastLoadedAt)
          }
        },
        limit: 1
      })

      const changedSeries = await Database.seriesModel.count({
        where: {
          libraryId: libraryId,
          updatedAt: {
            [Sequelize.Op.gt]: new Date(lastLoadedAt)
          }
        },
        limit: 1
      })

      const changedAuthors = await Database.authorModel.count({
        where: {
          libraryId: libraryId,
          updatedAt: {
            [Sequelize.Op.gt]: new Date(lastLoadedAt)
          }
        },
        limit: 1
      })

      if (changedBooks + changedSeries + changedAuthors === 0) {
        // If nothing has changed, check if the number of authors, series, and books
        // matches the prior check before updating cache creation time
        if (bookCountFromDatabase === Database.libraryFilterData[libraryId]?.bookCount && seriesCountFromDatabase === Database.libraryFilterData[libraryId]?.seriesCount && authorCountFromDatabase === Database.libraryFilterData[libraryId]!.authorCount) {
          Logger.debug(`Filter data for ${libraryId} has not changed, returning cached data and updating cache time after ${((Date.now() - start) / 1000).toFixed(2)}s`)
          Database.libraryFilterData[libraryId]!.loadedAt = Date.now()
          return cachedFilterData!
        }
      }

      // Store the counts for later comparison
      data.bookCount = bookCountFromDatabase
      data.seriesCount = seriesCountFromDatabase
      data.authorCount = authorCountFromDatabase

      // Something has changed in one of the tables, so reload all of the filter data for library
      const books = await Database.bookModel.findAll({
        include: {
          model: Database.libraryItemModel,
          attributes: ['isMissing', 'isInvalid'],
          where: {
            libraryId: libraryId
          }
        },
        attributes: ['tags', 'genres', 'publisher', 'publishedYear', 'narrators', 'language']
      })
      for (const book of books) {
        if (book.libraryItem.isMissing || book.libraryItem.isInvalid) data.numIssues++
        if (book.tags?.length) {
          book.tags.forEach((tag) => (data.tags as Set<string>).add(tag))
        }
        if (book.genres?.length) {
          book.genres.forEach((genre) => (data.genres as Set<string>).add(genre))
        }
        if (book.narrators?.length) {
          book.narrators.forEach((narrator) => (data.narrators as Set<string>).add(narrator))
        }
        if (book.publisher) (data.publishers as Set<string>).add(book.publisher)
        // Check if published year exists and is valid
        if (book.publishedYear && !isNaN(book.publishedYear) && book.publishedYear > 0 && book.publishedYear < 3000) {
          const decade = (Math.floor(book.publishedYear / 10) * 10).toString();
          (data.publishedDecades as Set<string>).add(decade)
        }
        if (book.language) (data.languages as Set<string>).add(book.language)
      }

      const series = await Database.seriesModel.findAll({
        where: {
          libraryId: libraryId
        },
        attributes: ['id', 'name']
      })
      series.forEach((s) => data.series.push({ id: s.id, name: s.name || 'No Title' }))

      const authors = await Database.authorModel.findAll({
        where: {
          libraryId: libraryId
        },
        attributes: ['id', 'name']
      })
      authors.forEach((a) => data.authors.push({ id: a.id, name: a.name }))
    }

    data.authors = naturalSort(data.authors).asc((au: { name: string }) => au.name)
    data.genres = naturalSort([...data.genres]).asc()
    data.tags = naturalSort([...data.tags]).asc()
    data.series = naturalSort(data.series).asc((se: { name: string }) => se.name)
    data.narrators = naturalSort([...data.narrators]).asc()
    data.publishers = naturalSort([...data.publishers]).asc()
    data.publishedDecades = naturalSort([...data.publishedDecades]).asc()
    data.languages = naturalSort([...data.languages]).asc()
    data.loadedAt = Date.now()
    Database.libraryFilterData[libraryId] = data

    Logger.debug(`Loaded filterdata in ${((Date.now() - start) / 1000).toFixed(2)}s`)
    return data
  }
}

export = libraryFilters
