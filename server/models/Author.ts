import sequelizeModule = require('sequelize')
const { DataTypes, Model, where, fn, col } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'
import parseNameString = require('../utils/parsers/parseNameString')

type LibraryItem = import('./LibraryItem')
type BookExpandedWithLibraryItem = import('./Book').BookExpandedWithLibraryItem

class Author extends Model {
  declare id: string
  declare name: string
  declare lastFirst: string
  declare asin: string | null // not set by findOrCreateByNameAndLibrary(), so null until it is edited; the JSDoc says string
  declare description: string | null // see asin
  declare imagePath: string | null // see asin
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date
  declare books?: BookExpandedWithLibraryItem[] // only set by a query that includes book (getAllLibraryItemsForAuthor); not listed in the constructor
  declare static readonly sequelize: Sequelize // set by init() before any query runs (optional in Sequelize's typings)

  constructor(values?: CreationAttributes<Author>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.name
    /** @type {string} */
    this.lastFirst
    /** @type {string} */
    this.asin
    /** @type {string} */
    this.description
    /** @type {string} */
    this.imagePath
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {Date} */
    this.updatedAt
    /** @type {Date} */
    this.createdAt
  }

  /**
   *
   * @param {string} name
   * @returns {string}
   */
  static getLastFirst(name: string) {
    if (!name) return null
    return parseNameString.nameToLastFirst(name)
  }

  /**
   * Check if author exists
   * @param {string} authorId
   * @returns {Promise<boolean>}
   */
  static async checkExistsById(authorId: string) {
    return (await this.count({ where: { id: authorId } })) > 0
  }

  /**
   * Get author by name and libraryId. name case insensitive
   * TODO: Look for authors ignoring punctuation
   *
   * @param {string} authorName
   * @param {string} libraryId
   * @returns {Promise<Author>}
   */
  static async getByNameAndLibrary(authorName: string, libraryId: string) {
    return this.findOne({
      where: [
        where(fn('lower', col('name')), authorName.toLowerCase()),
        {
          libraryId
        }
      ]
    })
  }

  /**
   *
   * @param {string} authorId
   * @returns {Promise<import('./LibraryItem')[]>}
   */
  static async getAllLibraryItemsForAuthor(authorId: string) {
    const author = await this.findByPk(authorId, {
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
      ]
    })

    const libraryItems: LibraryItem[] = []
    if (author?.books) {
      for (const book of author.books) {
        const libraryItem = book.libraryItem
        libraryItem.media = book
        const bookWithOptionalItem: { libraryItem?: LibraryItem } = book // the same object, seen with libraryItem optional: TypeScript only allows delete on an optional property (TS2790)
        delete bookWithOptionalItem.libraryItem
        libraryItems.push(libraryItem)
      }
    }

    return libraryItems
  }

  /**
   *
   * @param {string} name
   * @param {string} libraryId
   * @returns {Promise<{ author: Author, created: boolean }>}
   */
  static async findOrCreateByNameAndLibrary(name: string, libraryId: string) {
    const author = await this.getByNameAndLibrary(name, libraryId)
    if (author) return { author, created: false }
    const newAuthor = await this.create({
      name,
      lastFirst: this.getLastFirst(name),
      libraryId
    })
    return { author: newAuthor, created: true }
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
        name: DataTypes.STRING,
        lastFirst: DataTypes.STRING,
        asin: DataTypes.STRING,
        description: DataTypes.TEXT,
        imagePath: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'author',
        indexes: [
          {
            fields: [
              {
                name: 'name',
                collate: 'NOCASE'
              }
            ]
          },
          // {
          //   fields: [{
          //     name: 'lastFirst',
          //     collate: 'NOCASE'
          //   }]
          // },
          {
            fields: ['libraryId']
          }
        ]
      }
    )

    const { library } = sequelize.models
    library.hasMany(Author, {
      onDelete: 'CASCADE'
    })
    Author.belongsTo(library)
  }

  toOldJSON() {
    return {
      id: this.id,
      asin: this.asin,
      name: this.name,
      description: this.description,
      imagePath: this.imagePath,
      libraryId: this.libraryId,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  /**
   *
   * @param {number} numBooks
   * @returns
   */
  toOldJSONExpanded(numBooks = 0) {
    const oldJson: ReturnType<Author['toOldJSON']> & { numBooks?: number } = this.toOldJSON()
    oldJson.numBooks = numBooks
    return oldJson
  }

  toJSONMinimal() {
    return {
      id: this.id,
      name: this.name
    }
  }
}
export = Author
