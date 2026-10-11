import sequelizeModule = require('sequelize')
const { DataTypes, Model, Sequelize } = sequelizeModule
import type { BelongsToManyGetAssociationsMixin, BuildOptions, CreationAttributes, HasManyGetAssociationsMixin } from 'sequelize'

type User = import('./User')
type LibraryItem = import('./LibraryItem')
type Feed = import('./Feed')
type BookExpandedWithLibraryItem = import('./Book').BookExpandedWithLibraryItem
type CollectionBook = import('./CollectionBook')

/** Return of toOldJSON(). toOldJSONExpanded() replaces the library item ids in books with expanded library items, and the callers that include 'rssfeed' add rssFeed */
type OldCollectionJson = {
  id: string
  libraryId: string
  name: string
  description: string | null
  books: string[] | ReturnType<LibraryItem['toOldJSONExpanded']>[]
  lastUpdate: number
  createdAt: number
  rssFeed?: ReturnType<Feed['toOldJSON']>
}

class Collection extends Model {
  declare id: string
  declare name: string
  declare description: string | null // null when the collection was saved without one (Feed.getFeedObjForCollection() tests it); the JSDoc says string
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date
  declare books: BookExpandedWithLibraryItem[]
  declare feeds?: Feed[] // only set by a query that includes feed (getOldCollectionsJsonExpanded with 'rssfeed'); not listed in the constructor
  declare getBooks: BelongsToManyGetAssociationsMixin<BookExpandedWithLibraryItem> // mixin added by collection.belongsToMany(book) in CollectionBook.init(); the one call here includes libraryItem, authors and series
  declare getFeeds: HasManyGetAssociationsMixin<Feed> // mixin added by collection.hasMany(Feed) in Feed.init()
  declare getCollectionBooks: HasManyGetAssociationsMixin<CollectionBook> // mixin added by collection.hasMany(CollectionBook) in CollectionBook.init()
  declare static readonly sequelize: sequelizeModule.Sequelize // set by init() before any query runs (optional in Sequelize's typings). Written with the module name because Sequelize is a runtime value in this file

  constructor(values?: CreationAttributes<Collection>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.name
    /** @type {string} */
    this.description
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {Date} */
    this.updatedAt
    /** @type {Date} */
    this.createdAt

    // Expanded properties

    /** @type {import('./Book').BookExpandedWithLibraryItem[]} - only set when expanded */
    this.books
  }

  /**
   * Get all toOldJSONExpanded, items filtered for user permissions
   *
   * @param {import('./User')} user
   * @param {string} [libraryId]
   * @param {string[]} [include]
   * @async
   */
  static async getOldCollectionsJsonExpanded(user: User | null, libraryId?: string, include?: string[]) {
    let collectionWhere = null
    if (libraryId) {
      collectionWhere = {
        libraryId
      }
    }

    // Optionally include rssfeed for collection
    const collectionIncludes = []
    if (include?.includes('rssfeed')) {
      collectionIncludes.push({
        model: this.sequelize.models.feed
      })
    }

    const collections = await this.findAll({
      ...(collectionWhere && { where: collectionWhere }), // where is left out when there is no libraryId: Sequelize's typings reject where: null, which it treats like no where
      include: [
        {
          model: this.sequelize.models.book,
          include: [
            {
              model: this.sequelize.models.libraryItem
            },
            {
              model: this.sequelize.models.author,
              through: {
                attributes: []
              }
            },
            {
              model: this.sequelize.models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        },
        ...collectionIncludes
      ],
      order: [[this.sequelize.models.book, this.sequelize.models.collectionBook, 'order', 'ASC']]
    })
    // TODO: Handle user permission restrictions on initial query
    return collections
      .map((c) => {
        // Filter books using user permissions
        const books =
          c.books?.filter((b) => {
            if (user) {
              if (b.tags?.length && !user.checkCanAccessLibraryItemWithTags(b.tags)) {
                return false
              }
              if (b.explicit === true && !user.canAccessExplicitContent) {
                return false
              }
            }
            return true
          }) || []

        // Users with restricted permissions will not see this collection
        if (!books.length && c.books.length) {
          return null
        }

        c.books = books

        const collectionExpanded = c.toOldJSONExpanded()

        // Map feed if found
        if (c.feeds?.length) {
          collectionExpanded.rssFeed = c.feeds[0].toOldJSON()
        }

        return collectionExpanded
      })
      .filter((c) => c)
  }

  /**
   *
   * @param {string} collectionId
   * @returns {Promise<Collection>}
   */
  static async getExpandedById(collectionId: string) {
    return this.findByPk(collectionId, {
      include: [
        {
          model: this.sequelize.models.book,
          include: [
            {
              model: this.sequelize.models.libraryItem
            },
            {
              model: this.sequelize.models.author,
              through: {
                attributes: []
              }
            },
            {
              model: this.sequelize.models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        }
      ],
      order: [[this.sequelize.models.book, this.sequelize.models.collectionBook, 'order', 'ASC']]
    })
  }

  /**
   * Remove all collections belonging to library
   * @param {string} libraryId
   * @returns {Promise<number>} number of collections destroyed
   */
  static async removeAllForLibrary(libraryId: string) {
    if (!libraryId) return 0
    return this.destroy({
      where: {
        libraryId
      }
    })
  }

  static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces
  static init(sequelize: sequelizeModule.Sequelize): void
  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize: sequelizeModule.Sequelize): void {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'collection'
      }
    )

    const { library } = sequelize.models

    library.hasMany(Collection)
    Collection.belongsTo(library)
  }

  /**
   * Get all books in collection expanded with library item
   *
   * @returns {Promise<import('./Book').BookExpandedWithLibraryItem[]>}
   */
  getBooksExpandedWithLibraryItem() {
    return this.getBooks({
      include: [
        {
          model: this.sequelize.models.libraryItem
        },
        {
          model: this.sequelize.models.author,
          through: {
            attributes: []
          }
        },
        {
          model: this.sequelize.models.series,
          through: {
            attributes: ['sequence']
          }
        }
      ],
      order: [Sequelize.literal('`collectionBook.order` ASC')]
    })
  }

  /**
   * Get toOldJSONExpanded, items filtered for user permissions
   *
   * @param {import('./User')|null} user
   * @param {string[]} [include]
   * @async
   */
  async getOldJsonExpanded(user: User | null, include?: string[]) {
    this.books = await this.getBooksExpandedWithLibraryItem()

    // Filter books using user permissions
    // TODO: Handle user permission restrictions on initial query
    if (user) {
      const books = this.books.filter((b) => {
        if (b.tags?.length && !user.checkCanAccessLibraryItemWithTags(b.tags)) {
          return false
        }
        if (b.explicit === true && !user.canAccessExplicitContent) {
          return false
        }
        return true
      })

      // Users with restricted permissions will not see this collection
      if (!books.length && this.books.length) {
        return null
      }

      this.books = books
    }

    const collectionExpanded = this.toOldJSONExpanded()

    if (include?.includes('rssfeed')) {
      const feeds = await this.getFeeds()
      if (feeds?.length) {
        collectionExpanded.rssFeed = feeds[0].toOldJSON()
      }
    }

    return collectionExpanded
  }

  /**
   *
   * @param {string[]} [libraryItemIds=[]]
   * @returns
   */
  toOldJSON(libraryItemIds: string[] = []): OldCollectionJson {
    return {
      id: this.id,
      libraryId: this.libraryId,
      name: this.name,
      description: this.description,
      books: [...libraryItemIds],
      lastUpdate: this.updatedAt.valueOf(),
      createdAt: this.createdAt.valueOf()
    }
  }

  toOldJSONExpanded() {
    if (!this.books) {
      throw new Error('Books are required to expand Collection')
    }

    const json = this.toOldJSON()
    json.books = this.books.map((book) => {
      const libraryItem = book.libraryItem
      const bookWithOptionalItem: { libraryItem?: LibraryItem } = book // the same object, seen with libraryItem optional: TypeScript only allows delete on an optional property (TS2790)
      delete bookWithOptionalItem.libraryItem
      libraryItem.media = book
      return libraryItem.toOldJSONExpanded()
    })

    return json
  }
}

export = Collection
