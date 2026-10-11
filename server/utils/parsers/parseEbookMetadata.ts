import parseEpubMetadata = require('./parseEpubMetadata')
import parseComicMetadata = require('./parseComicMetadata')

type EBookFileObject = import('../../models/Book').EBookFileObject
type BookMetadataObject = import('../../scanner/BookScanner').BookMetadataObject
type EBookFileScanData = parseEbookMetadata.EBookFileScanData

/**
 * @typedef EBookFileScanData
 * @property {string} path
 * @property {string} ebookFormat
 * @property {string} ebookCoverPath internal image path
 * @property {import('../../scanner/BookScanner').BookMetadataObject} metadata
 */

/**
 * Parse metadata from ebook file
 * 
 * @param {import('../../models/Book').EBookFileObject} ebookFile 
 * @returns {Promise<EBookFileScanData>}
 */
async function parse(ebookFile: EBookFileObject | null | undefined): Promise<EBookFileScanData | null> {
  if (!ebookFile) return null

  if (ebookFile.ebookFormat === 'epub') {
    return parseEpubMetadata.parse(ebookFile)
  } else if (['cbz', 'cbr'].includes(ebookFile.ebookFormat)) {
    return parseComicMetadata.parse(ebookFile)
  }
  return null
}

/**
 * Extract cover from ebook file
 * 
 * @param {EBookFileScanData} ebookFileScanData 
 * @param {string} outputCoverPath 
 * @returns {Promise<boolean>}
 */
async function extractCoverImage(ebookFileScanData: EBookFileScanData | null | undefined, outputCoverPath: string): Promise<boolean> {
  if (!ebookFileScanData?.ebookCoverPath) return false

  if (ebookFileScanData.ebookFormat === 'epub') {
    return parseEpubMetadata.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  } else if (['cbz', 'cbr'].includes(ebookFileScanData.ebookFormat)) {
    return parseComicMetadata.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  }
  return false
}

const parseEbookMetadata = { parse, extractCoverImage }
// Type-only: keeps import('./parseEbookMetadata').EBookFileScanData (used by CoverManager, BookScanner, parseComicMetadata and parseEpubMetadata) resolvable after export =
declare namespace parseEbookMetadata {
  interface EBookFileScanData {
    path: string
    ebookFormat: string
    ebookCoverPath: string // internal image path
    metadata: BookMetadataObject
  }
}
export = parseEbookMetadata