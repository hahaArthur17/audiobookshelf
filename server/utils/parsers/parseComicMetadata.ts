interface ComicMetadataXmlValue {
  Series?: string[]
  Number?: string[]
  Summary?: string[]
}

interface ComicMetadataXmlDocument {
  ComicInfo?: ComicMetadataXmlValue | null
}

interface ComicMetadataValue {
  title: string | null
  series: Array<{ name: string; sequence: string | null }>
  description: string | null
}

interface ComicMetadataEbookInput {
  metadata: { path: string }
  ebookFormat: string
}

interface ComicMetadataScanData {
  path: string
  ebookFormat: string
  metadata: ComicMetadataValue | null
  ebookCoverPath?: string
}

interface ComicMetadataArchive {
  open(): Promise<void>
  getFilePaths(): Promise<string[] | null>
  extractToFile(filePath: string, outputFilePath: string): Promise<boolean>
  extractToBuffer(filePath: string): Promise<Uint8Array | null | undefined>
  close(): void
}

interface ComicMetadataLogger {
  debug(message: string): void
  error(message: string, error?: unknown): void
  warn(message: string): void
}

interface ComicMetadataParser {
  parse(comicInfoJson: ComicMetadataXmlDocument | null | undefined): ComicMetadataValue | null
}

interface ComicMetadataGlobals {
  SupportedImageTypes: string[]
}

const ComicMetadataPath: { extname(path: string): string } = require('path')
const ComicMetadataLogger: ComicMetadataLogger = require('../../Logger')
const ComicInfoMetadataParser: ComicMetadataParser = require('./parseComicInfoMetadata')
const ComicMetadataGlobals: ComicMetadataGlobals = require('../globals')
const ComicMetadataXmlToJSON: (xml: string) => Promise<ComicMetadataXmlDocument | null> = require('../index').xmlToJSON
const ComicMetadataArchiveFactory: (path: string) => ComicMetadataArchive = require('../comicBookExtractors.js').createComicBookExtractor

/**
 * Extract cover image from comic return true if success
 *
 * @param {string} comicPath
 * @param {string} comicImageFilepath
 * @param {string} outputCoverPath
 * @returns {Promise<boolean>}
 */
module.exports.extractCoverImage = async function extractCoverImage(comicPath: string, comicImageFilepath: string, outputCoverPath: string): Promise<boolean> {
  let archive: ComicMetadataArchive | null = null
  try {
    archive = ComicMetadataArchiveFactory(comicPath)
    await archive.open()
    return await archive.extractToFile(comicImageFilepath, outputCoverPath)
  } catch (error) {
    ComicMetadataLogger.error(`[parseComicMetadata] Failed to extract image "${comicImageFilepath}" from comicPath "${comicPath}" into "${outputCoverPath}"`, error)
    return false
  } finally {
    // Ensure we free the memory
    archive?.close()
  }
}

/**
 * Parse metadata from comic
 *
 * @param {ComicMetadataEbookInput} ebookFile
 * @returns {Promise<ComicMetadataScanData | null>}
 */
module.exports.parse = async function parse(ebookFile: ComicMetadataEbookInput): Promise<ComicMetadataScanData | null> {
  const comicPath = ebookFile.metadata.path
  ComicMetadataLogger.debug(`[parseComicMetadata] Parsing comic metadata at "${comicPath}"`)
  let archive: ComicMetadataArchive | null = null
  try {
    archive = ComicMetadataArchiveFactory(comicPath)
    await archive.open()

    const filePaths = await archive.getFilePaths().catch((error) => {
      ComicMetadataLogger.error(`[parseComicMetadata] Failed to get file paths from comic at "${comicPath}"`, error)
    })

    // Sort the file paths in a natural order to get the first image
    filePaths!.sort((a, b) => {
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    })

    let metadata: ComicMetadataValue | null = null
    const comicInfoPath = filePaths!.find((filePath) => filePath === 'ComicInfo.xml')
    if (comicInfoPath) {
      const comicInfoData = await archive.extractToBuffer(comicInfoPath)
      if (comicInfoData) {
        const comicInfoStr = new TextDecoder().decode(comicInfoData)
        const comicInfoJson = await ComicMetadataXmlToJSON(comicInfoStr)
        if (comicInfoJson) {
          metadata = ComicInfoMetadataParser.parse(comicInfoJson)
        }
      }
    }

    const payload: ComicMetadataScanData = {
      path: comicPath,
      ebookFormat: ebookFile.ebookFormat,
      metadata
    }

    const firstImagePath = filePaths!.find((filePath) => ComicMetadataGlobals.SupportedImageTypes.includes(ComicMetadataPath.extname(filePath).toLowerCase().slice(1)))
    if (firstImagePath) {
      payload.ebookCoverPath = firstImagePath
    } else {
      ComicMetadataLogger.warn(`[parseComicMetadata] Cover image not found in comic at "${comicPath}"`)
    }

    return payload
  } catch (error) {
    ComicMetadataLogger.error(`[parseComicMetadata] Failed to parse comic metadata at "${comicPath}"`, error)
    return null
  } finally {
    // Ensure we free the memory
    archive?.close()
  }
}
