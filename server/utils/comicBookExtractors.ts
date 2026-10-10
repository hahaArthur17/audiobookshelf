interface ComicExtractorPathModule {
  extname(path: string): string
  normalize(path: string): string
  readonly sep: string
  isAbsolute(path: string): boolean
  dirname(path: string): string
  join(...paths: string[]): string
}

interface ComicExtractorFileSystem {
  pathExists(path: string): Promise<boolean>
  readFile(path: string): Promise<Buffer>
  ensureDir(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  move(source: string, destination: string, options: { overwrite: boolean }): Promise<void>
  writeFile(path: string, data: Buffer): Promise<void>
}

interface ComicExtractorLogger {
  debug(message: string): void
  error(message: string, error?: unknown): void
}

interface ComicExtractorRarFileHeader {
  name: string
  flags: { directory: boolean }
}

interface ComicExtractorRarArchive {
  getFileList(): { fileHeaders: Iterable<ComicExtractorRarFileHeader> }
  extract(options: { files: string[] }): { files: Iterable<{ fileHeader: { name: string } }> }
}

interface ComicExtractorUnrarLibrary {
  createExtractorFromFile(options: {
    filepath: string
    targetPath: string
    filenameTransform: (filename: string) => string
  }): Promise<ComicExtractorRarArchive>
}

interface ComicExtractorLibarchiveFile {
  file: { _path: string }
}

interface ComicExtractorLibarchiveResult {
  fileData: Buffer
}

interface ComicExtractorLibarchive {
  getFilesArray(): Promise<ComicExtractorLibarchiveFile[]>
  extractSingleFile(filePath: string): Promise<ComicExtractorLibarchiveResult | null | undefined>
  close(): void
}

interface ComicExtractorLibarchiveLibrary {
  open(fileData: Buffer | null): Promise<ComicExtractorLibarchive>
}

interface ComicExtractorStreamZipArchive {
  entries(): Promise<Record<string, { isDirectory: boolean }>>
  entryData(filePath: string): Promise<Buffer>
  extract(filePath: string, outputFilePath: string): Promise<unknown>
  close(): Promise<unknown>
}

interface ComicExtractorStreamZipLibrary {
  async: new (options: { file: string }) => ComicExtractorStreamZipArchive
}

interface ComicExtractorFactoryResult {
  comicPath: string
  getBuffer(): Promise<Buffer | null>
  open(): Promise<void>
  getFilePaths(): Promise<string[] | null>
  extractToFile(filePath: string, outputFilePath: string): Promise<boolean>
  extractToBuffer(filePath: string): Promise<Buffer | null | undefined>
  close(): void
}

const ComicExtractorPath: ComicExtractorPathModule = require('path')
const ComicExtractorOs: { tmpdir(): string } = require('os')
const ComicExtractorUnrar: ComicExtractorUnrarLibrary = require('node-unrar-js')
const ComicExtractorLogger: ComicExtractorLogger = require('../Logger')
const ComicExtractorFs: ComicExtractorFileSystem = require('../libs/fsExtra')
const ComicExtractorStreamZip: ComicExtractorStreamZipLibrary = require('../libs/nodeStreamZip')
const ComicExtractorLibarchive: ComicExtractorLibarchiveLibrary = require('../libs/libarchive/archive')
const { isWritable: ComicExtractorIsWritable }: { isWritable(directory: string): Promise<boolean> } = require('./fileUtils')
const { sanitizePath: ComicExtractorSanitizePath }: { sanitizePath(filename: string): string } = require('../libs/archiver/archiverUtils')

/**
 * Sanitize a path from an archive
 *
 * @param {string} filename
 * @returns {string}
 */
function sanitizeArchivePath(filename: string): string {
  const sanitizedPath = ComicExtractorPath.normalize(ComicExtractorSanitizePath(filename))
  if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '..' || sanitizedPath.startsWith(`..${ComicExtractorPath.sep}`) || ComicExtractorPath.isAbsolute(sanitizedPath)) {
    throw new Error(`[CbrComicBookExtractor] Unsafe archive path "${filename}"`)
  }
  return sanitizedPath
}

class AbstractComicBookExtractor implements ComicExtractorFactoryResult {
  declare comicPath: string

  constructor(comicPath: string) {
    this.comicPath = comicPath
  }

  async getBuffer(): Promise<Buffer | null> {
    if (!(await ComicExtractorFs.pathExists(this.comicPath))) {
      ComicExtractorLogger.error(`[parseComicMetadata] Comic path does not exist "${this.comicPath}"`)
      return null
    }
    try {
      return ComicExtractorFs.readFile(this.comicPath)
    } catch (error) {
      ComicExtractorLogger.error(`[parseComicMetadata] Failed to read comic at "${this.comicPath}"`, error)
      return null
    }
  }

  async open(): Promise<void> {
    throw new Error('Not implemented')
  }

  async getFilePaths(): Promise<string[] | null> {
    throw new Error('Not implemented')
  }

  async extractToFile(filePath: string, outputFilePath: string): Promise<boolean> {
    throw new Error('Not implemented')
  }

  async extractToBuffer(filePath: string): Promise<Buffer | null | undefined> {
    throw new Error('Not implemented')
  }

  close(): void {
    throw new Error('Not implemented')
  }
}

class CbrComicBookExtractor extends AbstractComicBookExtractor {
  declare archive: ComicExtractorRarArchive | null
  declare tmpDir: string | null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
    this.tmpDir = null
  }

  async open(): Promise<void> {
    this.tmpDir = global.MetadataPath ? ComicExtractorPath.join(global.MetadataPath, 'tmp') : ComicExtractorOs.tmpdir()
    await ComicExtractorFs.ensureDir(this.tmpDir)
    if (!(await ComicExtractorIsWritable(this.tmpDir))) throw new Error(`[CbrComicBookExtractor] Temp directory "${this.tmpDir}" is not writable`)
    this.archive = await ComicExtractorUnrar.createExtractorFromFile({
      filepath: this.comicPath,
      targetPath: this.tmpDir,
      filenameTransform: sanitizeArchivePath
    })
    ComicExtractorLogger.debug(`[CbrComicBookExtractor] Opened comic book "${this.comicPath}". Using temp directory "${this.tmpDir}" for extraction.`)
  }

  async getFilePaths(): Promise<string[] | null> {
    if (!this.archive) return null
    const list = this.archive.getFileList()
    const fileHeaders = [...list.fileHeaders]
    const filePaths = fileHeaders.filter((fh) => !fh.flags.directory).map((fh) => fh.name)
    ComicExtractorLogger.debug(`[CbrComicBookExtractor] Found ${filePaths.length} files in comic book "${this.comicPath}"`)
    return filePaths
  }

  async removeEmptyParentDirs(file: string): Promise<void> {
    let dir = ComicExtractorPath.dirname(file)
    while (dir !== '.') {
      const fullDirPath = ComicExtractorPath.join(this.tmpDir as string, dir)
      const files = await ComicExtractorFs.readdir(fullDirPath)
      if (files.length > 0) break
      await ComicExtractorFs.remove(fullDirPath)
      dir = ComicExtractorPath.dirname(dir)
    }
  }

  getExtractedFilePath(file: string): { filePath: string; relativePath: string } {
    const sanitizedFile = sanitizeArchivePath(file)
    return {
      filePath: ComicExtractorPath.join(this.tmpDir as string, sanitizedFile),
      relativePath: sanitizedFile
    }
  }

  async extractToBuffer(file: string): Promise<Buffer | null> {
    if (!this.archive) return null
    const extracted = this.archive.extract({ files: [file] })
    const files = [...extracted.files]
    const { filePath, relativePath } = this.getExtractedFilePath(files[0].fileHeader.name)
    const fileData = await ComicExtractorFs.readFile(filePath)
    await ComicExtractorFs.remove(filePath)
    await this.removeEmptyParentDirs(relativePath)
    ComicExtractorLogger.debug(`[CbrComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${fileData.length}`)
    return fileData
  }

  async extractToFile(file: string, outputFilePath: string): Promise<boolean> {
    if (!this.archive) return false
    const extracted = this.archive.extract({ files: [file] })
    const files = [...extracted.files]
    const { filePath: extractedFilePath, relativePath } = this.getExtractedFilePath(files[0].fileHeader.name)
    await ComicExtractorFs.move(extractedFilePath, outputFilePath, { overwrite: true })
    await this.removeEmptyParentDirs(relativePath)
    ComicExtractorLogger.debug(`[CbrComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
    return true
  }

  close(): void {
    ComicExtractorLogger.debug(`[CbrComicBookExtractor] Closed comic book "${this.comicPath}"`)
  }
}

class CbzComicBookExtractor extends AbstractComicBookExtractor {
  declare archive: ComicExtractorLibarchive | null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
  }

  async open(): Promise<void> {
    const buffer = await this.getBuffer()
    this.archive = await ComicExtractorLibarchive.open(buffer)
    ComicExtractorLogger.debug(`[CbzComicBookExtractor] Opened comic book "${this.comicPath}"`)
  }

  async getFilePaths(): Promise<string[] | null> {
    if (!this.archive) return null
    const list = await this.archive.getFilesArray()
    const fileNames = list.map((fo) => fo.file._path)
    ComicExtractorLogger.debug(`[CbzComicBookExtractor] Found ${fileNames.length} files in comic book "${this.comicPath}"`)
    return fileNames
  }

  async extractToBuffer(file: string): Promise<Buffer | null | undefined> {
    if (!this.archive) return null
    const extracted = await this.archive.extractSingleFile(file)
    ComicExtractorLogger.debug(`[CbzComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${extracted?.fileData.length}`)
    return extracted?.fileData
  }

  async extractToFile(file: string, outputFilePath: string): Promise<boolean> {
    const data = await this.extractToBuffer(file)
    if (!data) return false
    await ComicExtractorFs.writeFile(outputFilePath, data)
    ComicExtractorLogger.debug(`[CbzComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
    return true
  }

  close(): void {
    this.archive?.close()
    ComicExtractorLogger.debug(`[CbzComicBookExtractor] Closed comic book "${this.comicPath}"`)
  }
}

class CbzStreamZipComicBookExtractor extends AbstractComicBookExtractor {
  declare archive: ComicExtractorStreamZipArchive | null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
  }

  async open(): Promise<void> {
    this.archive = new ComicExtractorStreamZip.async({ file: this.comicPath })
    ComicExtractorLogger.debug(`[CbzStreamZipComicBookExtractor] Opened comic book "${this.comicPath}"`)
  }

  async getFilePaths(): Promise<string[] | null> {
    if (!this.archive) return null
    const entries = await this.archive.entries()
    const fileNames = Object.keys(entries).filter((entry) => !entries[entry].isDirectory)
    ComicExtractorLogger.debug(`[CbzStreamZipComicBookExtractor] Found ${fileNames.length} files in comic book "${this.comicPath}"`)
    return fileNames
  }

  async extractToBuffer(file: string): Promise<Buffer | null> {
    if (!this.archive) return null
    const extracted = await this.archive?.entryData(file)
    ComicExtractorLogger.debug(`[CbzStreamZipComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${extracted.length}`)
    return extracted
  }

  async extractToFile(file: string, outputFilePath: string): Promise<boolean> {
    if (!this.archive) return false
    try {
      await this.archive.extract(file, outputFilePath)
      ComicExtractorLogger.debug(`[CbzStreamZipComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
      return true
    } catch (error) {
      ComicExtractorLogger.error(`[CbzStreamZipComicBookExtractor] Failed to extract file "${file}" to "${outputFilePath}"`, error)
      return false
    }
  }

  close(): void {
    this.archive
      ?.close()
      .then(() => {
        ComicExtractorLogger.debug(`[CbzStreamZipComicBookExtractor] Closed comic book "${this.comicPath}"`)
      })
      .catch((error) => {
        ComicExtractorLogger.error(`[CbzStreamZipComicBookExtractor] Failed to close comic book "${this.comicPath}"`, error)
      })
  }
}

function createComicBookExtractor(comicPath: string): ComicExtractorFactoryResult {
  const ext = ComicExtractorPath.extname(comicPath).toLowerCase()
  if (ext === '.cbr') {
    return new CbrComicBookExtractor(comicPath)
  } else if (ext === '.cbz') {
    return new CbzStreamZipComicBookExtractor(comicPath)
  } else {
    throw new Error(`Unsupported comic book format "${ext}"`)
  }
}
module.exports = { createComicBookExtractor }
