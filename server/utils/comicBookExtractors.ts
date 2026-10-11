import Path = require('path')
import os = require('os')
import unrar = require('node-unrar-js')
import Logger = require('../Logger')
import fs = require('../libs/fsExtra')
import StreamZip = require('../libs/nodeStreamZip')
import Archive = require('../libs/libarchive/archive')
import fileUtils = require('./fileUtils')
const { isWritable } = fileUtils
import archiverUtils = require('../libs/archiver/archiverUtils')
const { sanitizePath } = archiverUtils

declare const global: typeof globalThis & { MetadataPath: string }

// libs/fsExtra adds readFile, readdir and writeFile in a loop, so its inferred type lacks them (used for one boundary cast per call site)
type FsWithNodeMethods = typeof fs & {
  readFile(path: string): Promise<Buffer>
  readdir(path: string): Promise<string[]>
  writeFile(path: string, data: Uint8Array): Promise<void>
}

/**
 * Sanitize a path from an archive
 *
 * @param {string} filename
 * @returns {string}
 */
function sanitizeArchivePath(filename: string): string {
  const sanitizedPath = Path.normalize(sanitizePath(filename))
  if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '..' || sanitizedPath.startsWith(`..${Path.sep}`) || Path.isAbsolute(sanitizedPath)) {
    throw new Error(`[CbrComicBookExtractor] Unsafe archive path "${filename}"`)
  }
  return sanitizedPath
}

class AbstractComicBookExtractor {
  declare comicPath: string

  constructor(comicPath: string) {
    this.comicPath = comicPath
  }

  async getBuffer() {
    if (!(await fs.pathExists(this.comicPath))) {
      Logger.error(`[parseComicMetadata] Comic path does not exist "${this.comicPath}"`)
      return null
    }
    try {
      return (fs as FsWithNodeMethods).readFile(this.comicPath) // boundary: libs/fsExtra adds readFile in a loop, so its inferred type lacks it
    } catch (error) {
      Logger.error(`[parseComicMetadata] Failed to read comic at "${this.comicPath}"`, error)
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

  async extractToBuffer(filePath: string): Promise<Uint8Array | null | undefined> {
    throw new Error('Not implemented')
  }

  close(): void {
    throw new Error('Not implemented')
  }
}

class CbrComicBookExtractor extends AbstractComicBookExtractor {
  declare archive: Awaited<ReturnType<typeof unrar.createExtractorFromFile>> | null
  declare tmpDir: string | null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
    this.tmpDir = null
  }

  async open() {
    this.tmpDir = global.MetadataPath ? Path.join(global.MetadataPath, 'tmp') : os.tmpdir()
    await fs.ensureDir(this.tmpDir)
    if (!(await isWritable(this.tmpDir))) throw new Error(`[CbrComicBookExtractor] Temp directory "${this.tmpDir}" is not writable`)
    this.archive = await unrar.createExtractorFromFile({
      filepath: this.comicPath,
      targetPath: this.tmpDir,
      filenameTransform: sanitizeArchivePath
    })
    Logger.debug(`[CbrComicBookExtractor] Opened comic book "${this.comicPath}". Using temp directory "${this.tmpDir}" for extraction.`)
  }

  async getFilePaths() {
    if (!this.archive) return null
    const list = this.archive.getFileList()
    const fileHeaders = [...list.fileHeaders]
    const filePaths = fileHeaders.filter((fh) => !fh.flags.directory).map((fh) => fh.name)
    Logger.debug(`[CbrComicBookExtractor] Found ${filePaths.length} files in comic book "${this.comicPath}"`)
    return filePaths
  }

  async removeEmptyParentDirs(file: string) {
    let dir = Path.dirname(file)
    while (dir !== '.') {
      const fullDirPath = Path.join(this.tmpDir!, dir) // non-null (field): open() sets tmpDir before it sets archive, and the callers return early while archive is null
      const files = await (fs as FsWithNodeMethods).readdir(fullDirPath) // boundary: libs/fsExtra adds readdir in a loop, so its inferred type lacks it
      if (files.length > 0) break
      await fs.remove(fullDirPath)
      dir = Path.dirname(dir)
    }
  }

  getExtractedFilePath(file: string) {
    const sanitizedFile = sanitizeArchivePath(file)
    return {
      filePath: Path.join(this.tmpDir!, sanitizedFile), // non-null (field): open() sets tmpDir before it sets archive, and the callers return early while archive is null
      relativePath: sanitizedFile
    }
  }

  async extractToBuffer(file: string) {
    if (!this.archive) return null
    const extracted = this.archive.extract({ files: [file] })
    const files = [...extracted.files]
    const { filePath, relativePath } = this.getExtractedFilePath(files[0].fileHeader.name)
    const fileData = await (fs as FsWithNodeMethods).readFile(filePath) // boundary: libs/fsExtra adds readFile in a loop, so its inferred type lacks it
    await fs.remove(filePath)
    await this.removeEmptyParentDirs(relativePath)
    Logger.debug(`[CbrComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${fileData.length}`)
    return fileData
  }

  async extractToFile(file: string, outputFilePath: string) {
    if (!this.archive) return false
    const extracted = this.archive.extract({ files: [file] })
    const files = [...extracted.files]
    const { filePath: extractedFilePath, relativePath } = this.getExtractedFilePath(files[0].fileHeader.name)
    await fs.move(extractedFilePath, outputFilePath, { overwrite: true })
    await this.removeEmptyParentDirs(relativePath)
    Logger.debug(`[CbrComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
    return true
  }

  close() {
    Logger.debug(`[CbrComicBookExtractor] Closed comic book "${this.comicPath}"`)
  }
}

class CbzComicBookExtractor extends AbstractComicBookExtractor {
  declare archive: Awaited<ReturnType<typeof Archive.open>> | null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
  }

  async open() {
    const buffer = await this.getBuffer()
    this.archive = await Archive.open(buffer as Parameters<typeof Archive.open>[0]) // boundary: the JSDoc of libs/libarchive (vendored JS) types fileBuffer as a Buffer, but getBuffer() returns null when the file is missing or unreadable (TS2345); see the bug log
    Logger.debug(`[CbzComicBookExtractor] Opened comic book "${this.comicPath}"`)
  }

  async getFilePaths() {
    if (!this.archive) return null
    const list = await this.archive.getFilesArray()
    const fileNames = list.map((fo: { file: { _path: string } }) => fo.file._path)
    Logger.debug(`[CbzComicBookExtractor] Found ${fileNames.length} files in comic book "${this.comicPath}"`)
    return fileNames
  }

  async extractToBuffer(file: string) {
    if (!this.archive) return null
    const extracted = await this.archive.extractSingleFile(file)
    Logger.debug(`[CbzComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${extracted?.fileData.length}`)
    return extracted?.fileData
  }

  async extractToFile(file: string, outputFilePath: string) {
    const data = await this.extractToBuffer(file)
    if (!data) return false
    await (fs as FsWithNodeMethods).writeFile(outputFilePath, data) // boundary: libs/fsExtra adds writeFile in a loop, so its inferred type lacks it
    Logger.debug(`[CbzComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
    return true
  }

  close() {
    this.archive?.close()
    Logger.debug(`[CbzComicBookExtractor] Closed comic book "${this.comicPath}"`)
  }
}

class CbzStreamZipComicBookExtractor extends AbstractComicBookExtractor {
  declare archive: InstanceType<typeof StreamZip.async> | null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
  }

  async open() {
    this.archive = new StreamZip.async({ file: this.comicPath })
    Logger.debug(`[CbzStreamZipComicBookExtractor] Opened comic book "${this.comicPath}"`)
  }

  async getFilePaths() {
    if (!this.archive) return null
    const entries = await this.archive.entries()
    const fileNames = Object.keys(entries).filter((entry) => !entries[entry].isDirectory)
    Logger.debug(`[CbzStreamZipComicBookExtractor] Found ${fileNames.length} files in comic book "${this.comicPath}"`)
    return fileNames
  }

  async extractToBuffer(file: string) {
    if (!this.archive) return null
    const extracted = await this.archive?.entryData(file)
    Logger.debug(`[CbzStreamZipComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${extracted.length}`)
    return extracted
  }

  async extractToFile(file: string, outputFilePath: string) {
    if (!this.archive) return false
    try {
      await this.archive.extract(file, outputFilePath)
      Logger.debug(`[CbzStreamZipComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
      return true
    } catch (error) {
      Logger.error(`[CbzStreamZipComicBookExtractor] Failed to extract file "${file}" to "${outputFilePath}"`, error)
      return false
    }
  }

  close() {
    this.archive
      ?.close()
      .then(() => {
        Logger.debug(`[CbzStreamZipComicBookExtractor] Closed comic book "${this.comicPath}"`)
      })
      .catch((error) => {
        Logger.error(`[CbzStreamZipComicBookExtractor] Failed to close comic book "${this.comicPath}"`, error)
      })
  }
}

function createComicBookExtractor(comicPath: string) {
  const ext = Path.extname(comicPath).toLowerCase()
  if (ext === '.cbr') {
    return new CbrComicBookExtractor(comicPath)
  } else if (ext === '.cbz') {
    return new CbzStreamZipComicBookExtractor(comicPath)
  } else {
    throw new Error(`Unsupported comic book format "${ext}"`)
  }
}
export = { createComicBookExtractor }
