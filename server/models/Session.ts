import sequelizeModule = require('sequelize')
const { DataTypes, Model, Op } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'

type User = import('./User')

class Session extends Model {
  declare id: string
  declare ipAddress: string
  declare userAgent: string
  declare createdAt: Date
  declare updatedAt: Date
  declare userId: string
  declare expiresAt: Date
  declare lastRefreshToken: string | null // init() sets allowNull: true
  declare lastRefreshTokenExpiresAt: Date | null // init() sets allowNull: true
  declare user: User
  declare refreshToken: string // a column in init(), set by createSession(), but not listed in the constructor

  constructor(values?: CreationAttributes<Session>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.ipAddress
    /** @type {string} */
    this.userAgent
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
    /** @type {UUIDV4} */
    this.userId
    /** @type {Date} */
    this.expiresAt
    /** @type {string} */
    this.lastRefreshToken
    /** @type {Date} */
    this.lastRefreshTokenExpiresAt

    // Expanded properties

    /** @type {import('./User').User} */
    this.user
  }

  static async createSession(userId: string, ipAddress: string, userAgent: string, refreshToken: string, expiresAt: Date) {
    const session = await Session.create({ userId, ipAddress, userAgent, refreshToken, expiresAt })
    return session
  }

  /**
   * Clean up expired sessions from the database
   * @returns {Promise<number>} Number of sessions deleted
   */
  static async cleanupExpiredSessions() {
    const deletedCount = await Session.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        }
      }
    })
    return deletedCount
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
        ipAddress: DataTypes.STRING,
        userAgent: DataTypes.STRING,
        refreshToken: {
          type: DataTypes.STRING,
          allowNull: false
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        lastRefreshToken: {
          type: DataTypes.STRING,
          allowNull: true
        },
        lastRefreshTokenExpiresAt: {
          type: DataTypes.DATE,
          allowNull: true
        }
      },
      {
        sequelize,
        modelName: 'session'
      }
    )

    const { user } = sequelize.models
    user.hasMany(Session, {
      onDelete: 'CASCADE',
      foreignKey: {
        allowNull: false
      }
    })
    Session.belongsTo(user)
  }
}

export = Session
