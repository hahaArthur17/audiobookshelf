import sequelizeModule = require('sequelize')
const { DataTypes, Model, Op } = sequelizeModule
import type { BuildOptions, CreationAttributes, InstanceDestroyOptions, InstanceUpdateOptions, SaveOptions, Sequelize } from 'sequelize'
import jwt = require('jsonwebtoken')
import type { SignOptions } from 'jsonwebtoken'
import lruCache = require('lru-cache')
const { LRUCache } = lruCache
import Logger = require('../Logger')

type User = import('./User')

/** Permissions stored on an api key: the properties of the JSDoc typedef below, plus every other key that mergePermissionsWithDefault() copies from the request */
interface ApiKeyPermissions {
  [key: string]: unknown // mergePermissionsWithDefault() reads the request's permissions and writes the merged ones by a dynamic key
  download: boolean
  update: boolean
  delete: boolean
  upload: boolean
  createEreader: boolean
  accessAllLibraries: boolean
  accessAllTags: boolean
  accessExplicitContent: boolean
  selectedTagsNotAccessible: boolean
  librariesAccessible: string[]
  itemTagsSelected: string[]
}

/**
 * @typedef {Object} ApiKeyPermissions
 * @property {boolean} download
 * @property {boolean} update
 * @property {boolean} delete
 * @property {boolean} upload
 * @property {boolean} createEreader
 * @property {boolean} accessAllLibraries
 * @property {boolean} accessAllTags
 * @property {boolean} accessExplicitContent
 * @property {boolean} selectedTagsNotAccessible
 * @property {string[]} librariesAccessible
 * @property {string[]} itemTagsSelected
 */

class ApiKeyCache {
  declare cache: lruCache.LRUCache<string, ApiKey>

  constructor() {
    this.cache = new LRUCache({ max: 100 })
  }

  getById(id: string) {
    const apiKey = this.cache.get(id)
    return apiKey
  }

  set(apiKey: ApiKey) {
    apiKey.fromCache = true
    this.cache.set(apiKey.id, apiKey)
  }

  delete(apiKeyId: string) {
    this.cache.delete(apiKeyId)
  }

  maybeInvalidate(apiKey: ApiKey) {
    if (!apiKey.fromCache) this.delete(apiKey.id)
  }
}

const apiKeyCache = new ApiKeyCache()

class ApiKey extends Model {
  declare id: string
  declare name: string
  declare description: string | null // ApiKeyController.create() does not set it
  declare expiresAt: Date | null // null for a key that does not expire
  declare lastUsedAt: Date | null // the server never writes this column
  declare isActive: boolean
  declare permissions: ApiKeyPermissions | null // ApiKeyController.create() does not set it
  declare createdAt: Date
  declare updatedAt: Date
  declare userId: string
  declare createdByUserId: string | null // init() sets onDelete: 'SET NULL' on this foreign key
  declare user: User
  declare fromCache?: boolean // set by ApiKeyCache.set(); not a column and not listed in the constructor

  constructor(values?: CreationAttributes<ApiKey>, options?: BuildOptions) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.name
    /** @type {string} */
    this.description
    /** @type {Date} */
    this.expiresAt
    /** @type {Date} */
    this.lastUsedAt
    /** @type {boolean} */
    this.isActive
    /** @type {ApiKeyPermissions} */
    this.permissions
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
    /** @type {UUIDV4} */
    this.userId
    /** @type {UUIDV4} */
    this.createdByUserId

    // Expanded properties

    /** @type {import('./User').User} */
    this.user
  }

  /**
   * Same properties as User.getDefaultPermissions
   * @returns {ApiKeyPermissions}
   */
  static getDefaultPermissions(): ApiKeyPermissions {
    return {
      download: true,
      update: true,
      delete: true,
      upload: true,
      createEreader: true,
      accessAllLibraries: true,
      accessAllTags: true,
      accessExplicitContent: true,
      selectedTagsNotAccessible: false, // Inverts itemTagsSelected
      librariesAccessible: [],
      itemTagsSelected: []
    }
  }

  /**
   * Merge permissions from request with default permissions
   * @param {ApiKeyPermissions} reqPermissions
   * @returns {ApiKeyPermissions}
   */
  static mergePermissionsWithDefault(reqPermissions: ApiKeyPermissions | null | undefined): ApiKeyPermissions {
    const permissions = this.getDefaultPermissions()

    if (!reqPermissions || typeof reqPermissions !== 'object') {
      Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permissions: ${reqPermissions}`)
      return permissions
    }

    for (const key in reqPermissions) {
      if (reqPermissions[key] === undefined) {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission key: ${key}`)
        continue
      }

      if (key === 'librariesAccessible' || key === 'itemTagsSelected') {
        if (!Array.isArray(reqPermissions[key]) || reqPermissions[key].some((value) => typeof value !== 'string')) {
          Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid ${key} value: ${reqPermissions[key]}`)
          continue
        }

        permissions[key] = reqPermissions[key]
      } else if (typeof reqPermissions[key] !== 'boolean') {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission value for key ${key}. Should be boolean`)
        continue
      }

      permissions[key] = reqPermissions[key]
    }

    return permissions
  }

  /**
   * Deactivate expired api keys
   * @returns {Promise<number>} Number of api keys affected
   */
  static async deactivateExpiredApiKeys() {
    const [affectedCount] = await ApiKey.update(
      {
        isActive: false
      },
      {
        where: {
          isActive: true,
          expiresAt: {
            [Op.lt]: new Date()
          }
        }
      }
    )
    return affectedCount
  }

  /**
   * Generate a new api key
   * @param {string} tokenSecret
   * @param {string} keyId
   * @param {string} name
   * @param {number} [expiresIn] - Seconds until the api key expires or undefined for no expiration
   * @returns {Promise<string>}
   */
  static async generateApiKey(tokenSecret: string, keyId: string, name: string, expiresIn?: number) {
    const options: SignOptions = {}
    if (expiresIn && !isNaN(expiresIn) && expiresIn > 0) {
      options.expiresIn = expiresIn
    }

    return new Promise<string | null | undefined>((resolve) => {
      jwt.sign(
        {
          keyId,
          name,
          type: 'api'
        },
        tokenSecret,
        options,
        (err, token) => {
          if (err) {
            Logger.error(`[ApiKey] Error generating API key: ${err}`)
            resolve(null)
          } else {
            resolve(token)
          }
        }
      )
    })
  }

  /**
   * Get an api key by id, from cache or database
   * @param {string} apiKeyId
   * @returns {Promise<ApiKey | null>}
   */
  static async getById(apiKeyId: string) {
    if (!apiKeyId) return null

    const cachedApiKey = apiKeyCache.getById(apiKeyId)
    if (cachedApiKey) return cachedApiKey

    const apiKey = await ApiKey.findByPk(apiKeyId)
    if (!apiKey) return null

    apiKeyCache.set(apiKey)
    return apiKey
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
        name: {
          type: DataTypes.STRING,
          allowNull: false
        },
        description: DataTypes.TEXT,
        expiresAt: DataTypes.DATE,
        lastUsedAt: DataTypes.DATE,
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        permissions: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'apiKey'
      }
    )

    const { user } = sequelize.models
    user.hasMany(ApiKey, {
      onDelete: 'CASCADE'
    })
    ApiKey.belongsTo(user)

    user.hasMany(ApiKey, {
      foreignKey: 'createdByUserId',
      onDelete: 'SET NULL'
    })
    ApiKey.belongsTo(user, { as: 'createdByUser', foreignKey: 'createdByUserId' })
  }

  async update(values: Record<string, unknown>, options?: InstanceUpdateOptions) {
    apiKeyCache.maybeInvalidate(this)
    return await super.update(values, options)
  }

  async save(options?: SaveOptions) {
    apiKeyCache.maybeInvalidate(this)
    return await super.save(options)
  }

  async destroy(options?: InstanceDestroyOptions) {
    apiKeyCache.delete(this.id)
    await super.destroy(options)
  }
}

export = ApiKey
