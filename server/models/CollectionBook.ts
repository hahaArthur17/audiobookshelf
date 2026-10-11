import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'

class CollectionBook extends Model {
  declare id: string
  declare order: number
  declare bookId: string
  declare collectionId: string
  declare createdAt: Date
  declare book?: import('./Book') & { libraryItem: import('./LibraryItem') } // only set by a query that includes book; CollectionController passes book with libraryItem to getCollectionBooks(). Not listed in the constructor

  constructor(values?: CreationAttributes<CollectionBook>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {number} */
    this.order
    /** @type {UUIDV4} */
    this.bookId
    /** @type {UUIDV4} */
    this.collectionId
    /** @type {Date} */
    this.createdAt
  }

  static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        order: DataTypes.INTEGER
      },
      {
        sequelize,
        timestamps: true,
        updatedAt: false,
        modelName: 'collectionBook'
      }
    )

    // Super Many-to-Many
    // ref: https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#the-best-of-both-worlds-the-super-many-to-many-relationship
    const { book, collection } = sequelize.models
    book.belongsToMany(collection, { through: CollectionBook })
    collection.belongsToMany(book, { through: CollectionBook })

    book.hasMany(CollectionBook, {
      onDelete: 'CASCADE'
    })
    CollectionBook.belongsTo(book)

    collection.hasMany(CollectionBook, {
      onDelete: 'CASCADE'
    })
    CollectionBook.belongsTo(collection)
  }
}

export = CollectionBook
