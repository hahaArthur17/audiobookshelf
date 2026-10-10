const Path = require('path')
const Logger = require('../../Logger')
const fsExtra = require('../../libs/fsExtra')
const fileUtils = require('../fileUtils')
const LibraryFile = require('../../objects/files/LibraryFile')

interface MigrationLibraryFile {
  metadata: { path: string, size: unknown }
}

interface MigrationLibraryItem {
  id: string
  isFile: boolean
  path: string
  media: { getAbsMetadataJson(): unknown }
  libraryFiles: MigrationLibraryFile[]
  mtime?: number
  ctime?: number
  size?: number
  changed(field: string, value: boolean): void
  save(): Promise<unknown>
}

interface MigrationDatabase {
  libraryItemModel: {
    getLibraryItemsIncrement(offset: number, limit: number, where: { isMissing: boolean }): Promise<MigrationLibraryItem[]>
  }
}

/**
 * 
 * @param {import('../../models/LibraryItem')} libraryItem 
 * @returns {Promise<boolean>} false if failed
 */
async function writeMetadataFileForItem(libraryItem: MigrationLibraryItem): Promise<boolean | null> {
  const storeMetadataWithItem = (global as typeof global & { ServerSettings: { storeMetadataWithItem: boolean } }).ServerSettings.storeMetadataWithItem && !libraryItem.isFile
  const metadataPath = storeMetadataWithItem ? libraryItem.path : Path.join(global.MetadataPath, 'items', libraryItem.id)
  const metadataFilepath = fileUtils.filePathToPOSIX(Path.join(metadataPath, 'metadata.json'))
  if ((await fsExtra.pathExists(metadataFilepath))) {
    // Metadata file already exists do nothing
    return null
  }
  Logger.info(`[absMetadataMigration] metadata file not found at "${metadataFilepath}" - creating`)

  if (!storeMetadataWithItem) {
    // Ensure /metadata/items/<lid> dir
    await fsExtra.ensureDir(metadataPath)
  }

  const metadataJson = libraryItem.media.getAbsMetadataJson()

  // Save to file
  const success = await fsExtra.writeFile(metadataFilepath, JSON.stringify(metadataJson, null, 2)).then(() => true).catch((error: unknown) => {
    Logger.error(`[absMetadataMigration] failed to save metadata file at "${metadataFilepath}"`, (error as { message?: unknown }).message || error)
    return false
  })

  if (!success) return false
  if (!storeMetadataWithItem) return true // No need to do anything else

  // Safety check to make sure library file with the same path isnt already there
  libraryItem.libraryFiles = libraryItem.libraryFiles.filter(lf => lf.metadata.path !== metadataFilepath)

  // Put new library file in library item
  const newLibraryFile = new LibraryFile()
  await newLibraryFile.setDataFromPath(metadataFilepath, 'metadata.json')
  libraryItem.libraryFiles.push(newLibraryFile.toJSON())

  // Update library item timestamps and total size
  const libraryItemDirTimestamps = await fileUtils.getFileTimestampsWithIno(libraryItem.path)
  if (libraryItemDirTimestamps) {
    libraryItem.mtime = libraryItemDirTimestamps.mtimeMs
    libraryItem.ctime = libraryItemDirTimestamps.ctimeMs
    let size = 0
    libraryItem.libraryFiles.forEach((lf) => size += (!isNaN(lf.metadata.size as number) ? Number(lf.metadata.size) : 0))
    libraryItem.size = size
  }

  libraryItem.changed('libraryFiles', true)
  return libraryItem.save().then(() => true).catch((error: unknown) => {
    Logger.error(`[absMetadataMigration] failed to save libraryItem "${libraryItem.id}"`, (error as { message?: unknown }).message || error)
    return false
  })
}

/**
 * 
 * @param {import('../../Database')} Database 
 * @param {number} [offset=0]
 * @param {number} [totalCreated=0]
 */
async function runMigration(Database: MigrationDatabase, offset = 0, totalCreated = 0): Promise<number> {
  const libraryItems = await Database.libraryItemModel.getLibraryItemsIncrement(offset, 500, { isMissing: false })
  if (!libraryItems.length) return totalCreated

  let numCreated = 0
  for (const libraryItem of libraryItems) {
    const success = await writeMetadataFileForItem(libraryItem)
    if (success) numCreated++
  }

  if (libraryItems.length < 500) {
    return totalCreated + numCreated
  }
  return runMigration(Database, offset + libraryItems.length, totalCreated + numCreated)
}

/**
 * 
 * @param {import('../../Database')} Database 
 */
module.exports.migrate = async (Database: MigrationDatabase): Promise<void> => {
  Logger.info(`[absMetadataMigration] Starting metadata.json migration`)
  const totalCreated = await runMigration(Database)
  Logger.info(`[absMetadataMigration] Finished metadata.json migration (${totalCreated} files created)`)
}

export = module.exports
