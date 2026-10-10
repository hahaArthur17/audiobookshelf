interface EpubMetadataValue {
  title: string | null
  subtitle: string | null
  authors: string[]
  narrators: string[]
  publishedYear: string | null
  publisher: string | null
  isbn: string | null
  asin: string | null
  description: string | null
  genres: string[]
  language: string | null
  series: Array<{ name: string; sequence: string | null }>
  tags: string[]
}

interface EpubFileScanData {
  path: string
  ebookFormat: string
  metadata: EpubMetadataValue | null
  ebookCoverPath?: string
}

interface EpubBookFileInput {
  metadata: { path: string }
  ebookFormat: string
}

interface EpubArchiveEntryData {
  toString(encoding: 'utf8'): string
}

interface EpubArchive {
  entryData(filepath: string): Promise<EpubArchiveEntryData>
  extract(filepath: string, outputPath: string): Promise<unknown>
  close(): Promise<unknown>
}

interface EpubArchiveLibrary {
  async: new (options: { file: string }) => EpubArchive
}

interface EpubLogger {
  debug(message: string): void
  error(message: string, error?: unknown): void
  warn(message: string): void
}

interface EpubOpfMetadataParser {
  parseOpfMetadataJson(json: unknown): EpubMetadataValue | null
}

type EpubXmlToJson = (xml: string) => Promise<unknown | null>

interface EpubXmlAttributes {
  [key: string]: string | undefined
}

interface EpubXmlNode {
  $?: EpubXmlAttributes
  meta?: EpubXmlNode[]
  [key: string]: unknown
}

interface EpubContainerDocument {
  container?: {
    rootfiles?: Array<{
      rootfile?: Array<{ $?: { 'full-path'?: string } }>
    }>
  }
}

interface EpubManifestItem {
  $?: {
    id?: string
    properties?: string
    'media-type'?: string
    href?: string
  }
}

interface EpubPackageDocument {
  package?: {
    metadata?: EpubXmlNode | EpubXmlNode[]
    manifest?: Array<{ item?: EpubManifestItem[] }>
  }
}

const EpubPath: { dirname(path: string): string; posix: { join(...paths: string[]): string } } = require('path')
const EpubLogger: EpubLogger = require('../../Logger')
const EpubStreamZip: EpubArchiveLibrary = require('../../libs/nodeStreamZip')
const EpubOpfParser: EpubOpfMetadataParser = require('./parseOpfMetadata')
const { xmlToJSON: EpubXmlToJSON }: { xmlToJSON: EpubXmlToJson } = require('../index')

/**
 * Extract file from epub and return string content
 *
 * @param {string} epubPath
 * @param {string} filepath
 * @returns {Promise<string>}
 */
const EpubExtractFileFromEpub = async function extractFileFromEpub(epubPath: string, filepath: string): Promise<string | undefined> {
  const zip = new EpubStreamZip.async({ file: epubPath })
  const data = await zip.entryData(filepath).catch((error) => {
    EpubLogger.error(`[parseEpubMetadata] Failed to extract ${filepath} from epub at "${epubPath}"`, error)
  })
  const filedata = data?.toString('utf8')
  await zip.close().catch((error) => {
    EpubLogger.error(`[parseEpubMetadata] Failed to close zip`, error)
  })

  return filedata
}

/**
 * Extract an XML file from epub and return JSON
 *
 * @param {string} epubPath
 * @param {string} xmlFilepath
 * @returns {Promise<Object>}
 */
const EpubExtractXmlToJson = async function extractXmlToJson(epubPath: string, xmlFilepath: string): Promise<unknown | null> {
  const filedata = await EpubExtractFileFromEpub(epubPath, xmlFilepath)
  if (!filedata) return null
  return EpubXmlToJSON(filedata)
}

/**
 * Extract cover image from epub return true if success
 *
 * @param {string} epubPath
 * @param {string} epubImageFilepath
 * @param {string} outputCoverPath
 * @returns {Promise<boolean>}
 */
const EpubExtractCoverImage = async function extractCoverImage(epubPath: string, epubImageFilepath: string, outputCoverPath: string): Promise<boolean> {
  const zip = new EpubStreamZip.async({ file: epubPath })

  const success = await zip
    .extract(epubImageFilepath, outputCoverPath)
    .then(() => true)
    .catch((error) => {
      EpubLogger.error(`[parseEpubMetadata] Failed to extract image ${epubImageFilepath} from epub at "${epubPath}"`, error)
      return false
    })

  await zip.close().catch((error) => {
    EpubLogger.error(`[parseEpubMetadata] Failed to close zip`, error)
  })

  return success
}
module.exports.extractCoverImage = EpubExtractCoverImage

/**
 * Parse metadata from epub
 *
 * @param {import('../../models/Book').EBookFileObject} ebookFile
 * @returns {Promise<import('./parseEbookMetadata').EBookFileScanData>}
 */
const EpubParse = async function parse(ebookFile: EpubBookFileInput): Promise<EpubFileScanData | null> {
  const epubPath = ebookFile.metadata.path
  EpubLogger.debug(`Parsing metadata from epub at "${epubPath}"`)
  // Entrypoint of the epub that contains the filepath to the package document (opf file)
  const containerJson = await EpubExtractXmlToJson(epubPath, 'META-INF/container.xml')
  if (!containerJson) {
    return null
  }

  // Get package document opf filepath from container.xml
  const packageDocPath = (containerJson as EpubContainerDocument).container?.rootfiles?.[0]?.rootfile?.[0]?.$?.['full-path']
  if (!packageDocPath) {
    EpubLogger.error(`Failed to get package doc path in Container.xml`, JSON.stringify(containerJson, null, 2))
    return null
  }

  // Extract package document to JSON
  const packageJson = await EpubExtractXmlToJson(epubPath, packageDocPath)
  if (!packageJson) {
    return null
  }

  // Parse metadata from package document opf file
  const opfMetadata = EpubOpfParser.parseOpfMetadataJson(structuredClone(packageJson))
  if (!opfMetadata) {
    EpubLogger.error(`Unable to parse metadata in package doc with json`, JSON.stringify(packageJson, null, 2))
    return null
  }

  const payload: EpubFileScanData = {
    path: epubPath,
    ebookFormat: 'epub',
    metadata: opfMetadata
  }

  // Attempt to find filepath to cover image:
  // Metadata may include <meta name="cover" content="id"/> where content is the id of the cover image in the manifest
  //  Otherwise find image in the manifest with cover-image property set
  //  As a fallback the first image in the manifest is used as the cover image
  let packageMetadata = (packageJson as EpubPackageDocument).package?.metadata
  if (Array.isArray(packageMetadata)) {
    packageMetadata = packageMetadata[0]
  }
  const metaCoverId = packageMetadata?.meta?.find?.((metaNode) => metaNode.$?.name === 'cover')?.$?.content

  let manifestFirstImage: EpubManifestItem | null | undefined = null
  if (metaCoverId) {
    manifestFirstImage = (packageJson as EpubPackageDocument).package?.manifest?.[0]?.item?.find((item) => item.$?.id === metaCoverId)
  }
  if (!manifestFirstImage) {
    manifestFirstImage = (packageJson as EpubPackageDocument).package?.manifest?.[0]?.item?.find((item) => item.$?.['properties']?.split(' ')?.includes('cover-image'))
  }
  if (!manifestFirstImage) {
    manifestFirstImage = (packageJson as EpubPackageDocument).package?.manifest?.[0]?.item?.find((item) => item.$?.['media-type']?.startsWith('image/'))
  }

  const coverImagePath = manifestFirstImage?.$?.href
  if (coverImagePath) {
    const packageDirname = EpubPath.dirname(packageDocPath)
    payload.ebookCoverPath = EpubPath.posix.join(packageDirname, coverImagePath)
  } else {
    EpubLogger.warn(`Cover image not found in manifest for epub at "${epubPath}"`)
  }

  return payload
}
module.exports.parse = EpubParse
