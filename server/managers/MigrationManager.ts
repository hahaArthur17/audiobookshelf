/// <reference path="../types/untypedModules.d.ts" />
import umzugLib = require('../libs/umzug')
// boundary: libs/umzug re-exports with __exportStar, so its inferred module type has no Umzug and no SequelizeStorage (TS2305)
const { Umzug, SequelizeStorage } = umzugLib as typeof umzugLib & UmzugExports
import sequelizeModule = require('sequelize')
// boundary: the sequelize types do not declare the static Sequelize.QueryTypes that lib/sequelize.js sets at runtime (TS2339)
const { Sequelize, DataTypes } = sequelizeModule as typeof sequelizeModule & { Sequelize: { QueryTypes: typeof sequelizeModule.QueryTypes } }
import semver = require('semver')
import path = require('path')
import Module = require('module')
import fs = require('../libs/fsExtra')
import Logger = require('../Logger')

declare const global: typeof globalThis & { configPath?: string }

type SequelizeInstance = sequelizeModule.Sequelize
// libs/fsExtra adds the promisified fs methods in a loop (exports[method] = u(fs[method])), so its inferred type lacks them
type FsWithNodeMethods = typeof fs & { readdir(path: string): Promise<string[]>; readFileSync(path: string, encoding: 'utf8'): string }

// Only the members of libs/umzug that this file uses
type MigrationMeta = { name: string }
type MigrationScript = { name: string; path: string; up: unknown; down: unknown }
interface UmzugOptions {
  migrations: { files: string[]; resolve: (params: { name: string; path: string }) => MigrationScript } | (() => Promise<MigrationMeta[]>)
  context: { queryInterface: sequelizeModule.QueryInterface; logger: typeof Logger }
  storage: object
  logger: typeof Logger
}
interface UmzugInstance {
  options: UmzugOptions
  migrations(): Promise<MigrationMeta[]>
  executed(): Promise<MigrationMeta[]>
  up(options: { migrations: string[]; rerun: 'ALLOW' }): Promise<unknown>
  down(options: { migrations: string[]; rerun: 'ALLOW' }): Promise<unknown>
}
type UmzugExports = {
  Umzug: new (options: UmzugOptions) => UmzugInstance
  SequelizeStorage: new (options: { sequelize: SequelizeInstance }) => object
}

class MigrationManager {
  static MIGRATIONS_META_TABLE = 'migrationsMeta'

  declare sequelize: SequelizeInstance
  declare isDatabaseNew: boolean
  declare configPath: string
  declare migrationsSourceDir: string
  declare initialized: boolean
  declare migrationsDir: string | null
  declare maxVersion: string | null
  declare databaseVersion: string | null
  declare serverVersion: string | null
  declare umzug: UmzugInstance | null

  /**
   * @param {import('../Database').sequelize} sequelize
   * @param {boolean} isDatabaseNew
   * @param {string} [configPath]
   */
  constructor(sequelize: SequelizeInstance, isDatabaseNew: boolean, configPath = global.configPath) {
    if (!sequelize || !(sequelize instanceof Sequelize)) throw new Error('Sequelize instance is required for MigrationManager.')
    this.sequelize = sequelize
    this.isDatabaseNew = isDatabaseNew
    if (!configPath) throw new Error('Config path is required for MigrationManager.')
    this.configPath = configPath
    this.migrationsSourceDir = path.join(__dirname, '..', 'migrations')
    this.initialized = false
    this.migrationsDir = null
    this.maxVersion = null
    this.databaseVersion = null
    this.serverVersion = null
    this.umzug = null
  }

  /**
   * Init version vars and copy migration files to config dir if necessary
   *
   * @param {string} serverVersion
   */
  async init(serverVersion: string): Promise<void> {
    if (!(await fs.pathExists(this.configPath))) throw new Error(`Config path does not exist: ${this.configPath}`)

    this.migrationsDir = path.join(this.configPath, 'migrations')
    try {
      await fs.ensureDir(this.migrationsDir)
    } catch (error) {
      Logger.error(`[MigrationManager] Failed to create migrations directory at "${this.migrationsDir}": ${(error as Error).message}`) // a catch variable is unknown; libs/fsExtra ensureDir rejects with a Node fs Error
      throw new Error(`[MigrationManager] Failed to create migrations directory at "${this.migrationsDir}"`, { cause: error })
    }

    this.serverVersion = this.extractVersionFromTag(serverVersion)
    if (!this.serverVersion) throw new Error(`Invalid server version: ${serverVersion}. Expected a version tag like v1.2.3.`)

    await this.fetchVersionsFromDatabase()
    if (!this.maxVersion || !this.databaseVersion) throw new Error('Failed to fetch versions from the database.')
    Logger.debug(`[MigrationManager] Database version: ${this.databaseVersion}, Max version: ${this.maxVersion}, Server version: ${this.serverVersion}`)

    if (semver.gt(this.serverVersion, this.maxVersion)) {
      try {
        await this.copyMigrationsToConfigDir()
      } catch (error) {
        throw new Error('Failed to copy migrations to the config directory.', { cause: error })
      }

      try {
        await this.updateMaxVersion()
      } catch (error) {
        throw new Error('Failed to update max version in the database.', { cause: error })
      }
    }

    this.initialized = true
  }

  async runMigrations(): Promise<void> {
    if (!this.initialized) throw new Error('MigrationManager is not initialized. Call init() first.')

    if (this.isDatabaseNew) {
      Logger.info('[MigrationManager] Database is new. Skipping migrations.')
      return
    }

    const versionCompare = semver.compare(this.serverVersion!, this.databaseVersion!) // both start as null and are set by init(): this.initialized (tested above) is only true after init() has set them or thrown
    if (versionCompare == 0) {
      Logger.info('[MigrationManager] Database is already up to date.')
      return
    }

    await this.initUmzug()
    const migrations = await this.umzug!.migrations() // umzug starts as null and is set by initUmzug() on the line above
    const executedMigrations = (await this.umzug!.executed()).map((m) => m.name) // umzug: set by initUmzug() above

    const migrationDirection = versionCompare == 1 ? 'up' : 'down'

    let migrationsToRun: string[] = []
    migrationsToRun = this.findMigrationsToRun(migrations, executedMigrations, migrationDirection)

    // Only proceed with migration if there are migrations to run
    if (migrationsToRun.length > 0) {
      const originalDbPath = path.join(this.configPath, 'absdatabase.sqlite')
      const backupDbPath = path.join(this.configPath, 'absdatabase.backup.sqlite')
      try {
        Logger.info(`[MigrationManager] Migrating database ${migrationDirection} to version ${this.serverVersion}`)
        Logger.info(`[MigrationManager] Migrations to run: ${migrationsToRun.join(', ')}`)
        // Create a backup copy of the SQLite database before starting migrations
        await fs.copy(originalDbPath, backupDbPath)
        Logger.info('Created a backup of the original database.')

        // Run migrations
        await this.umzug![migrationDirection]({ migrations: migrationsToRun, rerun: 'ALLOW' }) // umzug: set by initUmzug() above

        // Clean up the backup
        await fs.remove(backupDbPath)

        Logger.info('[MigrationManager] Migrations successfully applied to the original database.')
      } catch (error) {
        Logger.error('[MigrationManager] Migration failed:', error)

        await this.sequelize.close()

        // Step 3: If migration fails, save the failed original and restore the backup
        const failedDbPath = path.join(this.configPath, 'absdatabase.failed.sqlite')
        await fs.move(originalDbPath, failedDbPath, { overwrite: true })
        Logger.info('[MigrationManager] Saved the failed database as absdatabase.failed.sqlite.')

        await fs.move(backupDbPath, originalDbPath, { overwrite: true })
        Logger.info('[MigrationManager] Restored the original database from the backup.')

        Logger.info('[MigrationManager] Migration failed. Exiting Audiobookshelf with code 1.')
        process.exit(1)
      }
    } else {
      Logger.info('[MigrationManager] No migrations to run.')
    }

    await this.updateDatabaseVersion()
  }

  async initUmzug(umzugStorage = new SequelizeStorage({ sequelize: this.sequelize })) {
    // This check is for dependency injection in tests
    // boundary: libs/fsExtra, see FsWithNodeMethods. migrationsDir starts as null and is set by init() before runMigrations() calls this method
    const files = (await (fs as FsWithNodeMethods).readdir(this.migrationsDir!))
      .filter((file) => {
        // Only include .js files and exclude dot files
        return !file.startsWith('.') && path.extname(file).toLowerCase() === '.js'
      })
      .map((file) => path.join(this.migrationsDir!, file)) // migrationsDir: set by init(), as above

    // Validate migration names
    for (const file of files) {
      const migrationName = path.basename(file, path.extname(file))
      const migrationVersion = this.extractVersionFromTag(migrationName)
      if (!migrationVersion) {
        throw new Error(`Invalid migration file: "${migrationName}". Unable to extract version from filename.`)
      }
    }

    const parent = new Umzug({
      migrations: {
        files,
        resolve: (params) => {
          // make script think it's in migrationsSourceDir
          const migrationPath = params.path
          const migrationName = params.name
          const contents = (fs as FsWithNodeMethods).readFileSync(migrationPath, 'utf8') // boundary: libs/fsExtra, see FsWithNodeMethods
          const fakePath = path.join(this.migrationsSourceDir, path.basename(migrationPath))
          const module = new Module(fakePath)
          module.filename = fakePath
          // boundary (both casts): Node's internal Module._nodeModulePaths and module._compile are not in @types/node
          module.paths = (Module as typeof Module & { _nodeModulePaths(from: string): string[] })._nodeModulePaths(this.migrationsSourceDir)
          ;(module as Module & { _compile(content: string, filename: string): unknown })._compile(contents, fakePath)
          const script = module.exports
          return {
            name: migrationName,
            path: migrationPath,
            up: script.up,
            down: script.down
          }
        }
      },
      context: { queryInterface: this.sequelize.getQueryInterface(), logger: Logger },
      storage: umzugStorage,
      logger: Logger
    })

    // Sort migrations by version
    this.umzug = new Umzug({
      ...parent.options,
      migrations: async () =>
        (await parent.migrations()).sort((a, b) => {
          const versionA = this.extractVersionFromTag(a.name)
          const versionB = this.extractVersionFromTag(b.name)
          return semver.compare(versionA!, versionB!) // the "Validate migration names" loop above throws when a migration file name has no version
        })
    })
  }

  async fetchVersionsFromDatabase(): Promise<void> {
    await this.checkOrCreateMigrationsMetaTable()

    const [{ version }] = await this.sequelize.query<{ version: string }>("SELECT value as version FROM :migrationsMeta WHERE key = 'version'", {
      replacements: { migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
      type: Sequelize.QueryTypes.SELECT
    })
    this.databaseVersion = version

    const [{ maxVersion }] = await this.sequelize.query<{ maxVersion: string }>("SELECT value as maxVersion FROM :migrationsMeta WHERE key = 'maxVersion'", {
      replacements: { migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
      type: Sequelize.QueryTypes.SELECT
    })
    this.maxVersion = maxVersion
  }

  async checkOrCreateMigrationsMetaTable(): Promise<void> {
    const queryInterface = this.sequelize.getQueryInterface()
    let migrationsMetaTableExists = await queryInterface.tableExists(MigrationManager.MIGRATIONS_META_TABLE)

    // If the table exists, check that the `version` and `maxVersion` rows exist
    if (migrationsMetaTableExists) {
      const [{ count }] = await this.sequelize.query<{ count: number }>("SELECT COUNT(*) as count FROM :migrationsMeta WHERE key IN ('version', 'maxVersion')", {
        replacements: { migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: Sequelize.QueryTypes.SELECT
      })
      if (count < 2) {
        Logger.warn(`[MigrationManager] migrationsMeta table exists but is missing 'version' or 'maxVersion' row. Dropping it...`)
        await queryInterface.dropTable(MigrationManager.MIGRATIONS_META_TABLE)
        migrationsMetaTableExists = false
      }
    }

    if (this.isDatabaseNew && migrationsMetaTableExists) {
      Logger.warn(`[MigrationManager] migrationsMeta table already exists. Dropping it...`)
      // This can happen if database was initialized with force: true
      await queryInterface.dropTable(MigrationManager.MIGRATIONS_META_TABLE)
      migrationsMetaTableExists = false
    }

    if (!migrationsMetaTableExists) {
      await queryInterface.createTable(MigrationManager.MIGRATIONS_META_TABLE, {
        key: {
          type: DataTypes.STRING,
          allowNull: false
        },
        value: {
          type: DataTypes.STRING,
          allowNull: false
        }
      })
      await this.sequelize.query("INSERT INTO :migrationsMeta (key, value) VALUES ('version', :version), ('maxVersion', '0.0.0')", {
        replacements: { version: this.isDatabaseNew ? this.serverVersion : '0.0.0', migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: Sequelize.QueryTypes.INSERT
      })
      Logger.debug(`[MigrationManager] Created migrationsMeta table: "${MigrationManager.MIGRATIONS_META_TABLE}"`)
    }
  }

  extractVersionFromTag(tag: string): string | null {
    if (!tag) return null
    const versionMatch = tag.match(/^v?(\d+\.\d+\.\d+)/)
    return versionMatch ? versionMatch[1] : null
  }

  async copyMigrationsToConfigDir(): Promise<void> {
    if (!(await fs.pathExists(this.migrationsSourceDir))) return

    const files = await (fs as FsWithNodeMethods).readdir(this.migrationsSourceDir) // boundary: libs/fsExtra, see FsWithNodeMethods
    await Promise.all(
      files
        .filter((file) => path.extname(file) === '.js')
        .map(async (file) => {
          const sourceFile = path.join(this.migrationsSourceDir, file)
          const targetFile = path.join(this.migrationsDir!, file) // migrationsDir starts as null and is set by init() before it calls this method
          await fs.copy(sourceFile, targetFile) // Asynchronously copy the files
        })
    )
    Logger.debug(`[MigrationManager] Copied migrations to the config directory: "${this.migrationsDir}"`)
  }

  /**
   *
   * @param {{ name: string }[]} migrations
   * @param {string[]} executedMigrations - names of executed migrations
   * @param {string} direction - 'up' or 'down'
   * @returns {string[]} - names of migrations to run
   */
  findMigrationsToRun(migrations: MigrationMeta[], executedMigrations: string[], direction: string): string[] {
    const migrationsToRun = migrations
      .filter((migration) => {
        const migrationVersion = this.extractVersionFromTag(migration.name)
        // migrationVersion: initUmzug() throws when a migration file name has no version. databaseVersion and serverVersion start as null and are set by init() (runMigrations() tests this.initialized)
        if (direction === 'up') {
          return semver.gt(migrationVersion!, this.databaseVersion!) && semver.lte(migrationVersion!, this.serverVersion!) && !executedMigrations.includes(migration.name)
        } else {
          // A down migration should be run even if the associated up migration wasn't executed before
          return semver.lte(migrationVersion!, this.databaseVersion!) && semver.gt(migrationVersion!, this.serverVersion!) // same reasons as in the 'up' branch
        }
      })
      .map((migration) => migration.name)
    if (direction === 'down') {
      return migrationsToRun.reverse()
    } else {
      return migrationsToRun
    }
  }

  async updateMaxVersion(): Promise<void> {
    try {
      await this.sequelize.query("UPDATE :migrationsMeta SET value = :maxVersion WHERE key = 'maxVersion'", {
        replacements: { maxVersion: this.serverVersion, migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: Sequelize.QueryTypes.UPDATE
      })
    } catch (error) {
      throw new Error('Failed to update maxVersion in the migrationsMeta table.', { cause: error })
    }
    this.maxVersion = this.serverVersion
  }

  async updateDatabaseVersion(): Promise<void> {
    try {
      await this.sequelize.query("UPDATE :migrationsMeta SET value = :version WHERE key = 'version'", {
        replacements: { version: this.serverVersion, migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: Sequelize.QueryTypes.UPDATE
      })
    } catch (error) {
      throw new Error('Failed to update version in the migrationsMeta table.', { cause: error })
    }
    this.databaseVersion = this.serverVersion
  }
}

export = MigrationManager
