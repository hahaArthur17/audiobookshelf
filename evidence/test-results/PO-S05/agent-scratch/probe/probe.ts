import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type RegisteredModels = { book: typeof Book }

class Book extends Model {
  declare id: string
  declare title: string
  constructor(values?: CreationAttributes<Book>, options?: BuildOptions) {
    super(values, options)
  }
  static async getOld(id: string) {
    return this.findByPk(id)
  }
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init({ id: { type: DataTypes.UUID, primaryKey: true }, title: DataTypes.STRING }, { sequelize, modelName: 'book' })
  }
}

class Author extends Model {
  declare static readonly sequelize: Sequelize & { models: RegisteredModels }
  declare readonly sequelize: Sequelize & { models: RegisteredModels }
  declare id: string
  constructor(values?: CreationAttributes<Author>, options?: BuildOptions) {
    super(values, options)
  }

  static async titles() {
    const books = await this.sequelize.models.book.findAll()
    return books.map((b) => b.title)
  }
  async oneTitle(id: string) {
    const book = await this.sequelize.models.book.findByPk(id)
    const viaStatic = await this.sequelize.models.book.getOld(id)
    const vague = this.sequelize.models.other
    const c1: Equal<typeof book, Book | null> = true
    const c2: Equal<typeof viaStatic, Book | null> = true
    const c3: Equal<typeof vague, sequelizeModule.ModelCtor<sequelizeModule.Model>> = true
    const n = await this.sequelize.models.other.count()
    return [book?.title, c1, c2, c3, n]
  }
  static async selfQuery() {
    const all = await this.findAll()
    const c4: Equal<typeof all, Author[]> = true
    const t = await this.sequelize.transaction()
    return [all, c4, t]
  }
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init({ id: { type: DataTypes.UUID, primaryKey: true } }, { sequelize, modelName: 'author' })
    const { book } = sequelize.models
    book.hasMany(Author)
    Author.belongsTo(book)
    Book.hasMany(Author)
  }
}

const c5: Equal<Awaited<ReturnType<typeof Author.titles>>, string[]> = true

// Control: without the declarations the same reads must fail (TS18048 on the static, TS2339 on the member)
class Plain extends Model {
  constructor(values?: CreationAttributes<Plain>, options?: BuildOptions) {
    super(values, options)
  }
  static async titles() {
    const books = await this.sequelize.models.book.findAll()
    return books.map((b) => b.title)
  }
  async one(id: string) {
    const book = await this.sequelize.models.book.findByPk(id)
    return book?.title2
  }
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init({}, { sequelize, modelName: 'plain' })
  }
}
export = { Author, Book, Plain, c5 }
