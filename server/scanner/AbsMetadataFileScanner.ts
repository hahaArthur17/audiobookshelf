import Path = require('path')
import fsExtra = require('../libs/fsExtra')
import fileUtils = require('../utils/fileUtils')
const { readTextFile } = fileUtils
import constants = require('../utils/constants')
const { LogLevel } = constants
import abmetadataGenerator = require('../utils/generators/abmetadataGenerator')

declare const global: typeof globalThis & { MetadataPath: string }

type LibraryScan = import('./LibraryScan')
type ScanLogger = import('./ScanLogger')
type LibraryItemScanData = import('./LibraryItemScanData')

interface MediaMetadataPayload {
  [key: string]: unknown // both methods assign the fields of metadata.json onto the scanner's metadata object by a dynamic key
}

interface AbMetadataPayload {
  [key: string]: unknown // both methods read the fields that abmetadataGenerator.parseJson() returns by a dynamic key
  authors?: string[]
  genres?: string[]
  tags?: string[]
  chapters?: object[]
}

class AbsMetadataFileScanner {
  constructor() {}

  /**
   * Check for metadata.json file and set book metadata
   *
   * @param {import('./LibraryScan')} libraryScan
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {Object} bookMetadata
   * @param {string} [existingLibraryItemId]
   */
  async scanBookMetadataFile(libraryScan: LibraryScan | ScanLogger, libraryItemData: LibraryItemScanData, bookMetadata: MediaMetadataPayload, existingLibraryItemId: string | null = null): Promise<void> {
    const metadataLibraryFile = libraryItemData.metadataJsonLibraryFile
    let metadataText = metadataLibraryFile ? await readTextFile(metadataLibraryFile.metadata.path) : null
    let metadataFilePath = metadataLibraryFile?.metadata.path

    // When metadata file is not stored with library item then check in the /metadata/items folder for it
    if (!metadataText && existingLibraryItemId) {
      let metadataPath = Path.join(global.MetadataPath, 'items', existingLibraryItemId)

      metadataFilePath = Path.join(metadataPath, 'metadata.json')
      if (await fsExtra.pathExists(metadataFilePath)) {
        metadataText = await readTextFile(metadataFilePath)
      }
    }

    if (metadataText) {
      libraryScan.addLog(LogLevel.INFO, `Found metadata file "${metadataFilePath}"`)
      const abMetadata = (abmetadataGenerator.parseJson(metadataText, 'book') as AbMetadataPayload | null) || {} // boundary: abmetadataGenerator (JavaScript) documents its result only as Object

      for (const key in abMetadata) {
        // TODO: When to override with null or empty arrays?
        if (abMetadata[key] === undefined || abMetadata[key] === null) continue
        if (key === 'authors' && !abMetadata.authors?.length) continue
        if (key === 'genres' && !abMetadata.genres?.length) continue
        if (key === 'tags' && !abMetadata.tags?.length) continue
        if (key === 'chapters' && !abMetadata.chapters?.length) continue

        bookMetadata[key] = abMetadata[key]
      }
    }
  }

  /**
   * Check for metadata.json file and set podcast metadata
   *
   * @param {import('./LibraryScan')} libraryScan
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {Object} podcastMetadata
   * @param {string} [existingLibraryItemId]
   */
  async scanPodcastMetadataFile(libraryScan: LibraryScan | ScanLogger, libraryItemData: LibraryItemScanData, podcastMetadata: MediaMetadataPayload, existingLibraryItemId: string | null = null): Promise<void> {
    const metadataLibraryFile = libraryItemData.metadataJsonLibraryFile
    let metadataText = metadataLibraryFile ? await readTextFile(metadataLibraryFile.metadata.path) : null
    let metadataFilePath = metadataLibraryFile?.metadata.path

    // When metadata file is not stored with library item then check in the /metadata/items folder for it
    if (!metadataText && existingLibraryItemId) {
      let metadataPath = Path.join(global.MetadataPath, 'items', existingLibraryItemId)

      metadataFilePath = Path.join(metadataPath, 'metadata.json')
      if (await fsExtra.pathExists(metadataFilePath)) {
        metadataText = await readTextFile(metadataFilePath)
      }
    }

    if (metadataText) {
      libraryScan.addLog(LogLevel.INFO, `Found metadata file "${metadataFilePath}"`)
      const abMetadata = (abmetadataGenerator.parseJson(metadataText, 'podcast') as AbMetadataPayload | null) || {} // boundary: abmetadataGenerator (JavaScript) documents its result only as Object
      for (const key in abMetadata) {
        if (abMetadata[key] === undefined || abMetadata[key] === null) continue
        if (key === 'tags' && !abMetadata.tags?.length) continue

        podcastMetadata[key] = abMetadata[key]
      }
    }
  }
}
export = new AbsMetadataFileScanner()
