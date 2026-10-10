interface EbookMetadataInput {
  metadata: { path: string }
  ebookFormat: string
}

export interface EBookFileScanData {
  path: string
  ebookFormat: string
  ebookCoverPath?: string
  metadata: object | null
}

interface EbookMetadataParser {
  parse(ebookFile: EbookMetadataInput): Promise<EBookFileScanData | null>
  extractCoverImage(epubPath: string, imagePath: string, outputCoverPath: string): Promise<boolean>
}

interface ComicMetadataParserForEbooks {
  parse(ebookFile: EbookMetadataInput): Promise<EBookFileScanData | null>
  extractCoverImage(comicPath: string, imagePath: string, outputCoverPath: string): Promise<boolean>
}

const EbookEpubMetadataParser: EbookMetadataParser = require('./parseEpubMetadata')
const EbookComicMetadataParser: ComicMetadataParserForEbooks = require('./parseComicMetadata')

/**
 * Parse metadata from ebook file
 *
 * @param {EbookMetadataInput | null | undefined} ebookFile
 * @returns {Promise<EBookFileScanData | null>}
 */
const EbookParse = async function parse(ebookFile: EbookMetadataInput | null | undefined): Promise<EBookFileScanData | null> {
  if (!ebookFile) return null

  if (ebookFile.ebookFormat === 'epub') {
    return EbookEpubMetadataParser.parse(ebookFile)
  } else if (['cbz', 'cbr'].includes(ebookFile.ebookFormat)) {
    return EbookComicMetadataParser.parse(ebookFile)
  }
  return null
}
/**
 * Extract cover from ebook file
 *
 * @param {EBookFileScanData | null | undefined} ebookFileScanData
 * @param {string} outputCoverPath
 * @returns {Promise<boolean>}
 */
const EbookExtractCoverImage = async function extractCoverImage(ebookFileScanData: EBookFileScanData | null | undefined, outputCoverPath: string): Promise<boolean> {
  if (!ebookFileScanData?.ebookCoverPath) return false

  if (ebookFileScanData.ebookFormat === 'epub') {
    return EbookEpubMetadataParser.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  } else if (['cbz', 'cbr'].includes(ebookFileScanData.ebookFormat)) {
    return EbookComicMetadataParser.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  }
  return false
}

module.exports = {
  parse: EbookParse,
  extractCoverImage: EbookExtractCoverImage
}
