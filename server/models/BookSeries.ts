import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'

class BookSeries extends Model {
  declare id: string
  declare sequence: string | null // nullable column in init(); Book.updateSeriesFromRequest() stores null when the request has no sequence
  declare bookId: string
  declare seriesId: string
  declare createdAt: Date

  constructor(values?: CreationAttributes<BookSeries>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.sequence
    /** @type {UUIDV4} */
    this.bookId
    /** @type {UUIDV4} */
    this.seriesId
    /** @type {Date} */
    this.createdAt
  }

  static removeByIds(seriesId: string | null = null, bookId: string | null = null) {
    const where: { seriesId?: string; bookId?: string } = {}
    if (seriesId) where.seriesId = seriesId
    if (bookId) where.bookId = bookId
    return this.destroy({
      where
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
        sequence: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'bookSeries',
        timestamps: true,
        updatedAt: false,
        indexes: [
          {
            name: 'bookSeries_seriesId',
            fields: ['seriesId']
          },
          {
            name: 'book_series_series_book',
            fields: ['seriesId', 'bookId']
          }
        ]
      }
    )

    // Super Many-to-Many
    // ref: https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#the-best-of-both-worlds-the-super-many-to-many-relationship
    const { book, series } = sequelize.models
    book.belongsToMany(series, { through: BookSeries })
    series.belongsToMany(book, { through: BookSeries })

    book.hasMany(BookSeries, {
      onDelete: 'CASCADE'
    })
    BookSeries.belongsTo(book)

    series.hasMany(BookSeries, {
      onDelete: 'CASCADE'
    })
    BookSeries.belongsTo(series)
  }
}

export = BookSeries
