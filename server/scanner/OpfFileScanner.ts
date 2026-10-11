import parseOpfMetadata = require('../utils/parsers/parseOpfMetadata')
const { parseOpfMetadataXML } = parseOpfMetadata
import fileUtils = require('../utils/fileUtils')
const { readTextFile } = fileUtils

type LibraryFileObject = import('../models/LibraryItem').LibraryFileObject

interface BookMetadataPayload {
  [key: string]: unknown // scanBookOpfFile() assigns the parsed fields onto BookScanner's metadata object by a dynamic key
}

interface OpfMetadataPayload {
  [key: string]: unknown // scanBookOpfFile() reads the fields that parseOpfMetadataXML() returns by a dynamic key
  tags: string[]
  genres: string[]
  authors?: string[]
  narrators?: string[]
  series?: { name: string; sequence: string | null }[]
}

class OpfFileScanner {
  constructor() {}

  /**
   * Parse metadata from .opf file found in library scan and update bookMetadata
   *
   * @param {import('../models/LibraryItem').LibraryFileObject} opfLibraryFileObj
   * @param {Object} bookMetadata
   */
  async scanBookOpfFile(opfLibraryFileObj: LibraryFileObject, bookMetadata: BookMetadataPayload): Promise<void> {
    const xmlText = await readTextFile(opfLibraryFileObj.metadata.path)
    const opfMetadata: OpfMetadataPayload | null = xmlText ? await parseOpfMetadataXML(xmlText) : null
    if (opfMetadata) {
      for (const key in opfMetadata) {
        if (key === 'tags') {
          // Add tags only if tags are empty
          if (opfMetadata.tags.length) {
            bookMetadata.tags = opfMetadata.tags
          }
        } else if (key === 'genres') {
          // Add genres only if genres are empty
          if (opfMetadata.genres.length) {
            bookMetadata.genres = opfMetadata.genres
          }
        } else if (key === 'authors') {
          if (opfMetadata.authors?.length) {
            bookMetadata.authors = opfMetadata.authors
          }
        } else if (key === 'narrators') {
          if (opfMetadata.narrators?.length) {
            bookMetadata.narrators = opfMetadata.narrators
          }
        } else if (key === 'series') {
          if (opfMetadata.series?.length) {
            bookMetadata.series = opfMetadata.series
          }
        } else if (opfMetadata[key] && key !== 'sequence') {
          bookMetadata[key] = opfMetadata[key]
        }
      }
    }
  }
}
export = new OpfFileScanner()
