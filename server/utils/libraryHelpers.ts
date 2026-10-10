type SortKey = unknown

interface SortDescriptor<T> {
  asc?: (item: T) => SortKey
  desc?: (item: T) => SortKey
}

interface NaturalSortMethods<T> {
  asc(selector?: (item: T) => SortKey): T[]
  by(sorters: SortDescriptor<T>[]): T[]
}

interface FastSortModule {
  createNewSortInstance(options: { comparer: Intl.Collator['compare'] }): <T>(items: T[]) => NaturalSortMethods<T>
}

type Sequence = string | number | null | undefined

interface BookSeriesLink {
  id: string
  name: string
  bookSeries: { sequence: Sequence }
}

interface OldLibraryItemJson {
  id: string
  sequence?: Sequence
  filterSeriesSequence?: Sequence
  media: {
    duration?: number | null
    metadata: { series?: unknown; [key: string]: unknown }
    [key: string]: unknown
  }
  collapsedSeries?: Record<string, unknown>
  [key: string]: unknown
}

interface LibraryItem {
  id: string
  mediaType: string
  media: BookMedia
  collapsedSeries?: CollapsedSeries
  authorNamesFirstLast?: string | null
  authorNamesLastFirst?: string | null
  toOldJSONMinified(): OldLibraryItemJson
  [key: string]: unknown
}

interface BookMedia {
  title: string
  titleIgnorePrefix: string
  duration?: number | null
  series?: BookSeriesLink[]
  [key: string]: unknown
}

interface CollapsedSeries {
  id: string
  name: string
  nameIgnorePrefix: string
  nameIgnorePrefixSort: string
  type: string
  books: OldLibraryItemJson[]
  totalDuration: number
}

interface SequenceRange {
  start: string | number
  end: string | number
  isNumber: boolean
}

interface ExpandedBook extends BookMedia {
  id: string
  libraryItem?: LibraryItem
  series?: BookSeriesLink[]
}

interface SeriesWithBooks {
  books: ExpandedBook[]
}

interface SeriesModel {
  findByPk(id: string, options: Record<string, unknown>): Promise<SeriesWithBooks | null>
}

interface LibraryHelpersDatabase {
  seriesModel: SeriesModel
  bookModel: unknown
  libraryItemModel: unknown
  authorModel: unknown
  serverSettings: { sortingIgnorePrefix: boolean }
}

interface LibraryHelpersLogger {
  warn(message: string): void
}

interface LibraryHelpersModule {
  getSeriesFromBooks(libraryItems: LibraryItem[], filterSeries: string | null | undefined, hideSingleBookSeries: boolean): CollapsedSeries[]
  collapseBookSeries(libraryItems: LibraryItem[], filterSeries: string | null | undefined, hideSingleBookSeries: boolean): LibraryItem[]
  handleCollapseSubseries(payload: CollapseSubseriesPayload, seriesId: string, user: CollapseSubseriesUser, library: CollapseSubseriesLibrary): Promise<OldLibraryItemJson[]>
}

interface CollapseSubseriesPayload {
  sortBy?: string
  sortDesc?: boolean
  total?: number
  page: string | number
  limit: string | number
}

interface CollapseSubseriesUser {
  checkCanAccessLibraryItem(libraryItem: LibraryItem): boolean
}

interface CollapseSubseriesLibrary {
  settings: { hideSingleBookSeries: boolean }
}

const { createNewSortInstance } = require('../libs/fastSort') as FastSortModule
const Database = require('../Database') as LibraryHelpersDatabase
const LibraryLogger = require('../Logger') as LibraryHelpersLogger
const { getTitlePrefixAtEnd, isNullOrNaN, getTitleIgnorePrefix } = require('../utils/index') as {
  getTitlePrefixAtEnd(title: string): string
  isNullOrNaN(value: number | null | undefined): boolean
  getTitleIgnorePrefix(title: string): string
}
const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

const VALID_COLLAPSE_SUBSERIES_SORTS = new Set<string>(['addedAt', 'size', 'birthtimeMs', 'mtimeMs', 'media.duration', 'media.metadata.publishedYear', 'media.metadata.authorName', 'media.metadata.authorNameLF', 'media.metadata.title', 'sequence', 'progress', 'progress.createdAt', 'progress.finishedAt', 'random'])

const libraryHelpers: LibraryHelpersModule = {
  /**
   *
   * @param {import('../models/LibraryItem')[]} libraryItems
   * @param {*} filterSeries
   * @param {*} hideSingleBookSeries
   * @returns
   */
  getSeriesFromBooks(libraryItems, filterSeries, hideSingleBookSeries) {
    const _series: Record<string, CollapsedSeries> = {}
    const seriesToFilterOut: Record<string, boolean> = {}
    libraryItems.forEach((libraryItem) => {
      // get all book series for item that is not already filtered out
      const allBookSeries = (libraryItem.media.series || []).filter((se) => !seriesToFilterOut[se.id])
      if (!allBookSeries.length) return

      allBookSeries.forEach((bookSeries) => {
        const abJson = libraryItem.toOldJSONMinified()
        abJson.sequence = bookSeries.bookSeries.sequence
        if (filterSeries) {
          const series = libraryItem.media.series!.find((se) => se.id === filterSeries)
          abJson.filterSeriesSequence = series!.bookSeries.sequence
        }
        if (!_series[bookSeries.id]) {
          _series[bookSeries.id] = {
            id: bookSeries.id,
            name: bookSeries.name,
            nameIgnorePrefix: getTitlePrefixAtEnd(bookSeries.name),
            nameIgnorePrefixSort: getTitleIgnorePrefix(bookSeries.name),
            type: 'series',
            books: [abJson],
            totalDuration: isNullOrNaN(abJson.media.duration) ? 0 : Number(abJson.media.duration)
          }
        } else {
          _series[bookSeries.id].books.push(abJson)
          _series[bookSeries.id].totalDuration += isNullOrNaN(abJson.media.duration) ? 0 : Number(abJson.media.duration)
        }
      })
    })

    let seriesItems: CollapsedSeries[] = Object.values(_series)

    // Library setting to hide series with only 1 book
    if (hideSingleBookSeries) {
      seriesItems = seriesItems.filter((se) => se.books.length > 1)
    }

    return seriesItems.map((series) => {
      series.books = naturalSort(series.books).asc((li) => li.sequence)
      return series
    })
  },

  /**
   *
   * @param {import('../models/LibraryItem')[]} libraryItems
   * @param {string} filterSeries - series id
   * @param {boolean} hideSingleBookSeries
   * @returns
   */
  collapseBookSeries(libraryItems, filterSeries, hideSingleBookSeries) {
    // Get series from the library items. If this list is being collapsed after filtering for a series,
    // don't collapse that series, only books that are in other series.
    const seriesObjects = this.getSeriesFromBooks(libraryItems, filterSeries, hideSingleBookSeries).filter((s) => s.id != filterSeries)

    const filteredLibraryItems: LibraryItem[] = []

    libraryItems.forEach((li) => {
      if (li.mediaType != 'book') return

      // Handle when this is the first book in a series
      seriesObjects
        .filter((s) => s.books[0].id == li.id)
        .forEach((series) => {
          // Clone the library item as we need to attach data to it, but don't
          // want to change the global copy of the library item
          filteredLibraryItems.push(Object.assign(Object.create(Object.getPrototypeOf(li)), li, { collapsedSeries: series }))
        })

      // Only included books not contained in series
      if (!seriesObjects.some((s) => s.books.some((b) => b.id == li.id))) filteredLibraryItems.push(li)
    })

    return filteredLibraryItems
  },

  /**
   *
   * @param {*} payload
   * @param {string} seriesId
   * @param {import('../models/User')} user
   * @param {import('../models/Library')} library
   * @returns {Object[]}
   */
  async handleCollapseSubseries(payload, seriesId, user, library) {
    if (payload.sortBy && !VALID_COLLAPSE_SUBSERIES_SORTS.has(payload.sortBy)) {
      LibraryLogger.warn(`[libraryHelpers] Invalid "sort" query string "${payload.sortBy}"`)
      payload.sortBy = undefined
    }

    const seriesWithBooks = await Database.seriesModel.findByPk(seriesId, {
      include: {
        model: Database.bookModel,
        through: {
          attributes: ['sequence']
        },
        include: [
          {
            model: Database.libraryItemModel
          },
          {
            model: Database.authorModel,
            through: {
              attributes: []
            }
          },
          {
            model: Database.seriesModel,
            through: {
              attributes: ['sequence']
            }
          }
        ]
      }
    })
    if (!seriesWithBooks) {
      payload.total = 0
      return []
    }

    const books = seriesWithBooks.books
    payload.total = books.length

    let libraryItems = books
      .map((book) => {
        const libraryItem = book.libraryItem!
        delete book.libraryItem
        libraryItem.media = book
        return libraryItem
      })
      .filter((li) => {
        return user.checkCanAccessLibraryItem(li)
      })

    const collapsedItems = this.collapseBookSeries(libraryItems, seriesId, library.settings.hideSingleBookSeries)
    if (!(collapsedItems.length == 1 && collapsedItems[0].collapsedSeries)) {
      libraryItems = collapsedItems
      payload.total = libraryItems.length
    }

    const sortingIgnorePrefix = Database.serverSettings.sortingIgnorePrefix

    let sortArray: SortDescriptor<LibraryItem>[] = []
    const direction = payload.sortDesc ? 'desc' : 'asc'
    if (!payload.sortBy || payload.sortBy === 'sequence') {
      sortArray = [
        {
          [direction]: (li: LibraryItem) => {
            const series = li.media.series!.find((se) => se.id === seriesId)
            return series!.bookSeries.sequence
          }
        },
        {
          // If no series sequence then fallback to sorting by title (or collapsed series name for sub-series)
          [direction]: (li: LibraryItem) => {
            if (sortingIgnorePrefix) {
              return li.collapsedSeries?.nameIgnorePrefix || li.media.titleIgnorePrefix
            } else {
              return li.collapsedSeries?.name || li.media.title
            }
          }
        }
      ]
    } else {
      // If series are collapsed and not sorting by title or sequence,
      // sort all collapsed series to the end in alphabetical order
      if (payload.sortBy !== 'media.metadata.title') {
        sortArray.push({
          asc: (li: LibraryItem) => {
            if (li.collapsedSeries) {
              return sortingIgnorePrefix ? li.collapsedSeries.nameIgnorePrefix : li.collapsedSeries.name
            } else {
              return ''
            }
          }
        })
      }
      sortArray.push({
        [direction]: (li: LibraryItem) => {
          if (payload.sortBy === 'media.metadata.title') {
            if (sortingIgnorePrefix) {
              return li.collapsedSeries?.nameIgnorePrefix || li.media.titleIgnorePrefix
            } else {
              return li.collapsedSeries?.name || li.media.title
            }
          } else {
            if (payload.sortBy === 'media.metadata.authorName') return li.authorNamesFirstLast ?? ''
            if (payload.sortBy === 'media.metadata.authorNameLF') return li.authorNamesLastFirst ?? ''
            return (payload.sortBy as string).split('.').reduce<unknown>((a, b) => (a as Record<string, unknown> | null | undefined)?.[b], li) ?? ''
          }
        }
      })
    }

    libraryItems = naturalSort(libraryItems).by(sortArray)

    if (payload.limit) {
      const startIndex = (payload.page as number) * (payload.limit as number)
      libraryItems = libraryItems.slice(startIndex, startIndex + (payload.limit as number))
    }

    return Promise.all(
      libraryItems.map(async (li) => {
        const filteredSeries = li.media.series!.find((se) => se.id === seriesId)
        const json = li.toOldJSONMinified()
        json.media.metadata.series = {
          id: filteredSeries!.id,
          name: filteredSeries!.name,
          sequence: filteredSeries!.bookSeries.sequence
        }

        if (li.collapsedSeries) {
          json.collapsedSeries = {
            id: li.collapsedSeries.id,
            name: li.collapsedSeries.name,
            nameIgnorePrefix: li.collapsedSeries.nameIgnorePrefix,
            libraryItemIds: li.collapsedSeries.books.map((b) => b.id),
            numBooks: li.collapsedSeries.books.length
          }

          // If collapsing by series and filtering by a series, generate the list of sequences the collapsed
          // series represents in the filtered series
          json.collapsedSeries.seriesSequenceList = naturalSort(li.collapsedSeries.books.filter((b): b is OldLibraryItemJson & { filterSeriesSequence: string | number } => !!b.filterSeriesSequence).map((b) => b.filterSeriesSequence))
            .asc()
            .reduce<SequenceRange[]>((ranges, currentSequence) => {
              let lastRange = ranges.at(-1)
              let isNumber = /^(\d+|\d+\.\d*|\d*\.\d+)$/.test(currentSequence as string)
              if (isNumber) currentSequence = parseFloat(currentSequence as string)

              if (lastRange && isNumber && lastRange.isNumber && (lastRange.end as number) + 1 == currentSequence) {
                lastRange.end = currentSequence
              } else {
                ranges.push({ start: currentSequence, end: currentSequence, isNumber: isNumber })
              }

              return ranges
            }, [])
            .map((r) => (r.start == r.end ? r.start : `${r.start}-${r.end}`))
            .join(', ')
        }

        return json
      })
    )
  }
}

export = libraryHelpers
