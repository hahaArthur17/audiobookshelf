// Scratch probe, outside the repo. Does the pattern still work if the constructor parameters are REQUIRED?
import sequelizeModule = require('D:/SEM-2/574/Project/audiobookshelf-po/node_modules/sequelize')
const { DataTypes, Model } = sequelizeModule
type Sequelize = sequelizeModule.Sequelize

class RequiredCtor extends Model {
  constructor(values: sequelizeModule.CreationAttributes<RequiredCtor>, options: sequelizeModule.BuildOptions) {
    super(values, options)
  }
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init({ k: DataTypes.STRING }, { sequelize, modelName: 'required' })
  }
  static all() {
    return this.findAll()
  }
}

class OptionalCtor extends Model {
  constructor(values?: sequelizeModule.CreationAttributes<OptionalCtor>, options?: sequelizeModule.BuildOptions) {
    super(values, options)
  }
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init({ k: DataTypes.STRING }, { sequelize, modelName: 'optional' })
  }
  static all() {
    return this.findAll()
  }
}
