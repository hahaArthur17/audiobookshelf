const Sequelize = require('sequelize') as typeof import('sequelize')

interface LibraryItemRow {
  id: string
  mediaId: string
  mediaType: string
  size: number
  media: { title: string }
}

interface LibraryItemMediaRow {
  title: string
  libraryItem: LibraryItemRow
  [key: string]: unknown
}

interface ModelWithLibraryItems {
  findAll(options: object): Promise<LibraryItemMediaRow[]>
}

interface LibraryItemModel {
  findAll(options: object): Promise<LibraryItemRow[]>
}

interface DatabaseModule {
  bookModel: ModelWithLibraryItems
  podcastModel: ModelWithLibraryItems
  libraryItemModel: LibraryItemModel
  authorModel: unknown
  bookAuthorModel: unknown
  seriesModel: unknown
  podcastEpisodeModel: unknown
}

interface SearchLibrary {
  id: string
  isBook: boolean
}

interface BookSearchResult {
  book: object[]
  narrators: object[]
  tags: object[]
  genres: object[]
  series: object[]
  authors: object[]
}

interface PodcastSearchResult {
  podcast: object[]
  tags: object[]
  genres: object[]
  episodes: object[]
}

type SearchResult = BookSearchResult | PodcastSearchResult

interface BookFilters {
  search(user: unknown, library: SearchLibrary, query: string, limit: number | string, offset: number): Promise<BookSearchResult>
}

interface PodcastFilters {
  search(user: unknown, library: SearchLibrary, query: string, limit: number | string, offset: number): Promise<PodcastSearchResult>
}

interface LibraryItemFiltersModule {
  getAllLibraryItemsWithTags(tags: string[]): Promise<LibraryItemRow[]>
  getAllLibraryItemsWithGenres(genres: string[]): Promise<LibraryItemRow[]>
  getAllLibraryItemsWithNarrators(narrators: string[], libraryId: string): Promise<LibraryItemRow[]>
  search(user: unknown, library: SearchLibrary, query: string, limit: number | string): Promise<SearchResult>
  getLargestItems(libraryId: string, limit: number): Promise<Array<{ id: string; title: string; size: number }>>
}

const Database = require('../../Database') as DatabaseModule
const libraryItemsBookFilters = require('./libraryItemsBookFilters') as BookFilters
const libraryItemsPodcastFilters = require('./libraryItemsPodcastFilters') as PodcastFilters

const libraryItemFilters = {
  /**
   * Get all library items that have tags
   * @param {string[]} tags
   * @returns {Promise<import('../../models/LibraryItem')[]>}
   */
  async getAllLibraryItemsWithTags(tags: string[]): Promise<LibraryItemRow[]> {
    const libraryItems: LibraryItemRow[] = []
    const booksWithTag = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        tags
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
      ],
      order: [
        [Database.authorModel, Database.bookAuthorModel, 'createdAt', 'ASC'],
        [Database.seriesModel, 'bookSeries', 'createdAt', 'ASC']
      ]
    })
    for (const book of booksWithTag) {
      const libraryItem = book.libraryItem
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }
    const podcastsWithTag = await Database.podcastModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        tags
      },
      include: [
        {
          model: Database.libraryItemModel
        },
        {
          model: Database.podcastEpisodeModel
        }
      ]
    })
    for (const podcast of podcastsWithTag) {
      const libraryItem = podcast.libraryItem
      libraryItem.media = podcast
      libraryItems.push(libraryItem)
    }
    return libraryItems
  },

  /**
   * Get all library items that have genres
   * @param {string[]} genres
   * @returns {Promise<import('../../models/LibraryItem')[]>}
   */
  async getAllLibraryItemsWithGenres(genres: string[]): Promise<LibraryItemRow[]> {
    const libraryItems: LibraryItemRow[] = []
    const booksWithGenre = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        genres
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
    })
    for (const book of booksWithGenre) {
      const libraryItem = book.libraryItem
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }
    const podcastsWithGenre = await Database.podcastModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        genres
      },
      include: [
        {
          model: Database.libraryItemModel
        },
        {
          model: Database.podcastEpisodeModel
        }
      ]
    })
    for (const podcast of podcastsWithGenre) {
      const libraryItem = podcast.libraryItem
      libraryItem.media = podcast
      libraryItems.push(libraryItem)
    }
    return libraryItems
  },

  /**
   * Get all library items that have narrators
   * @param {string[]} narrators
   * @param {string} libraryId
   * @returns {Promise<import('../../models/LibraryItem')[]>}
   */
  async getAllLibraryItemsWithNarrators(narrators: string[], libraryId: string): Promise<LibraryItemRow[]> {
    const libraryItems: LibraryItemRow[] = []
    const booksWithGenre = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(narrators) WHERE json_valid(narrators) AND json_each.value IN (:narrators))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        narrators
      },
      include: [
        {
          model: Database.libraryItemModel,
          where: { libraryId }
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
    })
    for (const book of booksWithGenre) {
      const libraryItem = book.libraryItem
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }
    return libraryItems
  },

  /**
   * Search library items
   * @param {import('../../models/User')} user
   * @param {import('../../models/Library')} library
   * @param {string} query
   * @param {number} limit
   * @returns {{book:object[], narrators:object[], authors:object[], tags:object[], series:object[], podcast:object[]}}
   */
  search(user: unknown, library: SearchLibrary, query: string, limit: number | string): Promise<SearchResult> {
    if (library.isBook) {
      return libraryItemsBookFilters.search(user, library, query, limit, 0)
    } else {
      return libraryItemsPodcastFilters.search(user, library, query, limit, 0)
    }
  },

  /**
   * Get largest items in library
   * @param {string} libraryId
   * @param {number} limit
   * @returns {Promise<{ id:string, title:string, size:number }[]>}
   */
  async getLargestItems(libraryId: string, limit: number): Promise<Array<{ id: string; title: string; size: number }>> {
    const libraryItems = await Database.libraryItemModel.findAll({
      attributes: ['id', 'mediaId', 'mediaType', 'size'],
      where: {
        libraryId
      },
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title']
        },
        {
          model: Database.podcastModel,
          attributes: ['id', 'title']
        }
      ],
      order: [['size', 'DESC']],
      limit
    })
    return libraryItems.map((libraryItem) => {
      return {
        id: libraryItem.id,
        title: libraryItem.media.title,
        size: libraryItem.size
      }
    })
  }
}

export = libraryItemFilters
