import sequelizeModule = require('sequelize')
const { DataTypes, Model, where, fn, col, literal } = sequelizeModule
import type { BelongsToManyGetAssociationsMixinOptions, BuildOptions, CreationAttributes, Order, Sequelize } from 'sequelize'

import utils = require('../utils/index')
const { getTitlePrefixAtEnd, getTitleIgnorePrefix }: { getTitlePrefixAtEnd: (title: string) => string; getTitleIgnorePrefix: (title: string) => string } = utils

type BookExpandedWithLibraryItem = import('./Book').BookExpandedWithLibraryItem
type BookSeries = import('./BookSeries')
type Literal = ReturnType<typeof literal>

class Series extends Model {
  declare id: string
  declare name: string
  declare nameIgnorePrefix: string
  declare description: string | null // not set by findOrCreateByNameAndLibrary(), so null until it is edited; the JSDoc says string
  declare libraryId: string
  declare createdAt: Date
  declare updatedAt: Date
  declare books: BookExpandedWithLibraryItem[]
  declare bookSeries: BookSeries // the join row; only set when the series is loaded through a book (book.series) or attached by Book.updateSeriesFromRequest(). Not listed in the constructor
  declare getBooks: (options?: Omit<BelongsToManyGetAssociationsMixinOptions, 'order'> & { order?: Order | [Literal][] }) => Promise<BookExpandedWithLibraryItem[]> // mixin added by book.belongsToMany(series) in BookSeries.init(); only called with the includes of getBooksExpandedWithLibraryItem(), hence the expanded result. order also takes a one-element item ([literal]): Sequelize accepts it at runtime, but its Order type does not describe it

  constructor(values?: CreationAttributes<Series>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.name
    /** @type {string} */
    this.nameIgnorePrefix
    /** @type {string} */
    this.description
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt

    // Expanded properties

    /** @type {import('./Book').BookExpandedWithLibraryItem[]} - only set when expanded */
    this.books
  }

  /**
   * Check if series exists
   * @param {string} seriesId
   * @returns {Promise<boolean>}
   */
  static async checkExistsById(seriesId: string) {
    return (await this.count({ where: { id: seriesId } })) > 0
  }

  /**
   * Get series by name and libraryId. name case insensitive
   *
   * @param {string} seriesName
   * @param {string} libraryId
   * @returns {Promise<Series>}
   */
  static async getByNameAndLibrary(seriesName: string, libraryId: string) {
    return this.findOne({
      where: [
        where(fn('lower', col('name')), seriesName.toLowerCase()),
        {
          libraryId
        }
      ]
    })
  }

  /**
   *
   * @param {string} seriesId
   * @returns {Promise<Series>}
   */
  static async getExpandedById(seriesId: string) {
    const series = await this.findByPk(seriesId)
    if (!series) return null
    series.books = await series.getBooksExpandedWithLibraryItem()
    return series
  }

  /**
   *
   * @param {string} seriesName
   * @param {string} libraryId
   * @returns {Promise<Series>}
   */
  static async findOrCreateByNameAndLibrary(seriesName: string, libraryId: string) {
    const series = await this.getByNameAndLibrary(seriesName, libraryId)
    if (series) return series
    return this.create({
      name: seriesName,
      nameIgnorePrefix: getTitleIgnorePrefix(seriesName),
      libraryId
    })
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
        nameIgnorePrefix: DataTypes.STRING,
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'series',
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
          //     name: 'nameIgnorePrefix',
          //     collate: 'NOCASE'
          //   }]
          // },
          {
            // unique constraint on name and libraryId
            fields: ['name', 'libraryId'],
            unique: true,
            name: 'unique_series_name_per_library'
          },
          {
            fields: ['libraryId']
          }
        ]
      }
    )

    const { library } = sequelize.models
    library.hasMany(Series, {
      onDelete: 'CASCADE'
    })
    Series.belongsTo(library)
  }

  /**
   * Get all books in collection expanded with library item
   *
   * @returns {Promise<import('./Book').BookExpandedWithLibraryItem[]>}
   */
  getBooksExpandedWithLibraryItem() {
    return this.getBooks({
      joinTableAttributes: ['sequence'],
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
      order: [[literal('CAST(`bookSeries.sequence` AS FLOAT) ASC NULLS LAST')]]
    })
  }

  toOldJSON() {
    return {
      id: this.id,
      name: this.name,
      nameIgnorePrefix: getTitlePrefixAtEnd(this.name),
      description: this.description,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
      libraryId: this.libraryId
    }
  }

  toJSONMinimal(sequence: string | null) {
    return {
      id: this.id,
      name: this.name,
      sequence
    }
  }
}

export = Series
