interface FileUtilsStats {
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  ino: number
  isFile(): boolean
  isDirectory(): boolean
}

interface FileUtilsBigIntStats {
  size: bigint
  mtimeMs: bigint
  ctimeMs: bigint
  birthtimeMs: bigint
  ino: bigint
  isFile(): boolean
  isDirectory(): boolean
}

interface FileUtilsWritableStream {
  on(event: 'finish', listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
  close(): void
}

interface FileUtilsReadableStream {
  pipe(destination: FileUtilsWritableStream): unknown
  on(event: 'data', listener: (chunk: { length: number }) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  close(): void
}

interface FileUtilsFileSystem {
  stat(path: string): Promise<FileUtilsStats>
  stat(path: string, options: { bigint: true }): Promise<FileUtilsBigIntStats>
  lstat(path: string): Promise<FileUtilsStats>
  readFile(path: string): Promise<unknown>
  writeFile(path: string, data: string): Promise<unknown>
  remove(path: string): Promise<unknown>
  readdir(path: string): Promise<string[]>
  pathExists(path: string): Promise<boolean>
  createReadStream(path: string): FileUtilsReadableStream
  createWriteStream(path: string, options?: { flags?: string }): FileUtilsWritableStream
}

interface FileUtilsLogger {
  debug(...values: unknown[]): void
  error(...values: unknown[]): void
  info(...values: unknown[]): void
  warn(...values: unknown[]): void
}

interface FileUtilsAxiosConfig {
  url: string
  method: string
  responseType: string
  headers: Record<string, string>
  timeout: number
  httpAgent: unknown
  httpsAgent: unknown
}

interface FileUtilsAxiosResponse {
  headers: Record<string, string | undefined>
  data: FileUtilsReadableStream
}

interface FileUtilsAxios {
  (config: FileUtilsAxiosConfig): Promise<FileUtilsAxiosResponse>
}

interface FileUtilsRecursiveEntry {
  name: string
  path: string
  fullname: string
  extension: string
  deep: number
  error?: unknown
}

interface FileUtilsRecursiveList extends Array<FileUtilsRecursiveEntry> {
  error?: unknown
}

interface FileUtilsRecursiveListError {
  error: unknown
  path: string
}

interface FileUtilsRecursiveOptions {
  mode: unknown
  recursive: boolean
  stats: boolean
  ignoreFolders: boolean
  extensions: boolean
  deep: boolean
  realPath: boolean
  normalizePath: boolean
}

interface FileUtilsRecursiveReaddirModule {
  LIST: unknown
  list(path: string, options: FileUtilsRecursiveOptions): Promise<FileUtilsRecursiveList | FileUtilsRecursiveListError>
}

interface FileUtilsCommonJsExports {
  shouldIgnoreFile(path: string): string | null
  downloadFile(url: string, filepath: string, contentTypeFilter?: ((contentType: unknown) => unknown) | null): Promise<unknown>
  filePathToPOSIX(path: string | null | undefined): string | null | undefined
}

interface FileUtilsPathNormalizer {
  (path: string): string
  (path: null | undefined): null | undefined
  (path: string | null | undefined): string | null | undefined
}

interface FileUtilsGlobalProperties {
  isWin: boolean
  DisableSsrfRequestFilter?: (url: string) => boolean
}

type FileUtilsGlobal = typeof global & FileUtilsGlobalProperties

interface FileUtilsPathItem {
  name: string
  path: string
  reldirpath: string
  fullpath: string
  extension: string
  deep: number
}

interface FileUtilsDirectory {
  path: string | null | undefined
  dirname: string
  level: number
}

type FileUtilsPath = typeof import('path')
type FileUtilsExec = (command: string, callback: (error: Error | null, stdout: string, stderr: string) => void) => unknown
type FileUtilsSsrfFilter = (url: string) => unknown

const FileUtilsAxios: FileUtilsAxios = require('axios')
const FileUtilsPath: FileUtilsPath = require('path')
const FileUtilsSsrfFilter: FileUtilsSsrfFilter = require('ssrf-req-filter')
const FileUtilsExec: FileUtilsExec = require('child_process').exec
const FileUtilsFs: FileUtilsFileSystem = require('../libs/fsExtra')
const FileUtilsRecursiveReaddir: FileUtilsRecursiveReaddirModule = require('../libs/recursiveReaddirAsync')
const FileUtilsLogger: FileUtilsLogger = require('../Logger')
const { AudioMimeType: FileUtilsAudioMimeType }: { AudioMimeType: Record<string, string> } = require('./constants')

// Capture CommonJS's module-level `this` so arrow exports retain that receiver.
const FileUtilsCommonJsThis: typeof globalThis & FileUtilsCommonJsExports = this as typeof globalThis & FileUtilsCommonJsExports

// CommonJS initializes `this` in this file to the initial exports object. Arrow
// exports close over that same object, including when later borrowed with call.
{

/**
 * Make sure folder separator is POSIX for Windows file paths. e.g. "C:\Users\Abs" becomes "C:/Users/Abs"
 *
 * @param {String} path - Ugly file path
 * @return {String} Pretty posix file path
 */
const filePathToPOSIX = ((path: string | null | undefined): string | null | undefined => {
  if (!(global as FileUtilsGlobal).isWin || !path) return path
  return path.startsWith('\\\\') ? '\\\\' + path.slice(2).replace(/\\/g, '/') : path.replace(/\\/g, '/')
}) as FileUtilsPathNormalizer
module.exports.filePathToPOSIX = filePathToPOSIX

/**
 * Check path is a child of or equal to another path
 *
 * @param {string} parentPath
 * @param {string} childPath
 * @returns {boolean}
 */
function isSameOrSubPath(parentPath: string, childPath: string): boolean {
  parentPath = filePathToPOSIX(parentPath) as string
  childPath = filePathToPOSIX(childPath) as string
  if (parentPath === childPath) return true
  const relativePath = FileUtilsPath.relative(parentPath, childPath)
  return (
    relativePath === '' || // Same path (e.g. parentPath = '/a/b/', childPath = '/a/b')
    (!relativePath.startsWith('..') && !FileUtilsPath.isAbsolute(relativePath)) // Sub path
  )
}
module.exports.isSameOrSubPath = isSameOrSubPath

function getFileStat(path: string): Promise<FileUtilsStats> | null {
  try {
    return FileUtilsFs.stat(path)
  } catch (err) {
    FileUtilsLogger.error('[fileUtils] Failed to stat', err)
    return null
  }
}

async function getFileTimestampsWithIno(path: string): Promise<{ size: number; mtimeMs: number; ctimeMs: number; birthtimeMs: number; ino: string } | false> {
  try {
    var stat = await FileUtilsFs.stat(path, { bigint: true })
    return {
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      ctimeMs: Number(stat.ctimeMs),
      birthtimeMs: Number(stat.birthtimeMs),
      ino: String(stat.ino)
    }
  } catch (err) {
    FileUtilsLogger.error(`[fileUtils] Failed to getFileTimestampsWithIno for path "${path}"`, err)
    return false
  }
}
module.exports.getFileTimestampsWithIno = getFileTimestampsWithIno

/**
 * Get file size
 *
 * @param {string} path
 * @returns {Promise<number>}
 */
module.exports.getFileSize = async (path: string): Promise<number> => {
  return (await getFileStat(path))?.size || 0
}

/**
 * Get file mtimeMs
 *
 * @param {string} path
 * @returns {Promise<number>} epoch timestamp
 */
module.exports.getFileMTimeMs = async (path: string): Promise<number> => {
  try {
    return (await getFileStat(path))?.mtimeMs || 0
  } catch (err) {
    FileUtilsLogger.error(`[fileUtils] Failed to getFileMtimeMs`, err)
    return 0
  }
}

/**
 *
 * @param {string} filepath
 * @returns {boolean}
 */
async function checkPathIsFile(filepath: string): Promise<boolean> {
  try {
    const stat = await FileUtilsFs.stat(filepath)
    return stat.isFile()
  } catch (err) {
    return false
  }
}
module.exports.checkPathIsFile = checkPathIsFile

function getIno(path: string): Promise<string | null> {
  return FileUtilsFs
    .stat(path, { bigint: true })
    .then((data) => String(data.ino))
    .catch((err) => {
      FileUtilsLogger.warn(`[Utils] Failed to get ino for path "${path}"`, err)
      return null
    })
}
module.exports.getIno = getIno

/**
 * Read contents of file
 * @param {string} path
 * @returns {string}
 */
async function readTextFile(path: string): Promise<string> {
  try {
    var data = await FileUtilsFs.readFile(path)
    return String(data)
  } catch (error) {
    FileUtilsLogger.error(`[FileUtils] ReadTextFile error ${error}`)
    return ''
  }
}
module.exports.readTextFile = readTextFile

/**
 * Check if file or directory should be ignored. Returns a string of the reason to ignore, or null if not ignored
 *
 * @param {string} path
 * @returns {string}
 */
module.exports.shouldIgnoreFile = (path: string): string | null => {
  // Check if directory or file name starts with "."
  if (FileUtilsPath.basename(path).startsWith('.')) {
    return 'dotfile'
  }
  if (path.split('/').find((p) => p.startsWith('.'))) {
    return 'dotpath'
  }

  // If these strings exist anywhere in the filename or directory name, ignore. Vendor specific hidden directories
  const includeAnywhereIgnore = ['@eaDir']
  const filteredInclude = includeAnywhereIgnore.filter((str) => path.includes(str))
  if (filteredInclude.length) {
    return `${filteredInclude[0]} directory`
  }

  const extensionIgnores = ['.part', '.tmp', '.crdownload', '.download', '.bak', '.old', '.temp', '.tempfile', '.tempfile~']

  // Check extension
  if (extensionIgnores.includes(FileUtilsPath.extname(path).toLowerCase())) {
    // Return the extension that is ignored
    return `${FileUtilsPath.extname(path)} file`
  }

  // Should not ignore this file or directory
  return null
}

/**
 * @typedef FilePathItem
 * @property {string} name - file name e.g. "audiofile.m4b"
 * @property {string} path - fullpath excluding folder e.g. "Author/Book/audiofile.m4b"
 * @property {string} reldirpath - path excluding file name e.g. "Author/Book"
 * @property {string} fullpath - full path e.g. "/audiobooks/Author/Book/audiofile.m4b"
 * @property {string} extension - file extension e.g. ".m4b"
 * @property {number} deep - depth of file in directory (0 is file in folder root)
 */

/**
 * Get array of files inside dir
 * @param {string} path
 * @param {string} [relPathToReplace]
 * @returns {FilePathItem[]}
 */
module.exports.recurseFiles = async (path: string, relPathToReplace: string | null = null): Promise<FileUtilsPathItem[]> => {
  path = filePathToPOSIX(path) as string
  if (!path.endsWith('/')) path = path + '/'

  if (relPathToReplace) {
    relPathToReplace = filePathToPOSIX(relPathToReplace) as string
    if (!relPathToReplace.endsWith('/')) relPathToReplace += '/'
  } else {
    relPathToReplace = path
  }

  const options = {
    mode: FileUtilsRecursiveReaddir.LIST,
    recursive: true,
    stats: false,
    ignoreFolders: true,
    extensions: true,
    deep: true,
    realPath: true,
    normalizePath: false
  }
  let list = await FileUtilsRecursiveReaddir.list(path, options)
  if (list.error) {
    FileUtilsLogger.error('[fileUtils] Recurse files error', list.error)
    return []
  }

  const directoriesToIgnore: string[] = []

  // The recursive helper returns an array when it has no error.
  const pathItems: FileUtilsPathItem[] = (list as FileUtilsRecursiveList)
    .filter((item) => {
      if (item.error) {
        FileUtilsLogger.error(`[fileUtils] Recurse files file "${item.fullname}" has error`, item.error)
        return false
      }

      item.fullname = filePathToPOSIX(item.fullname) as string
      item.path = filePathToPOSIX(item.path) as string
      const relpath = item.fullname.replace(relPathToReplace, '')
      let reldirname = FileUtilsPath.dirname(relpath)
      if (reldirname === '.') reldirname = ''
      const dirname = FileUtilsPath.dirname(item.fullname)

      // Directory has a file named ".ignore" flag directory and ignore
      if (item.name === '.ignore' && reldirname && reldirname !== '.' && !directoriesToIgnore.includes(dirname)) {
        FileUtilsLogger.debug(`[fileUtils] .ignore found - ignoring directory "${reldirname}"`)
        directoriesToIgnore.push(dirname)
        return false
      }

      // Check for ignored extensions or directories
      const shouldIgnore = FileUtilsCommonJsThis.shouldIgnoreFile(relpath)
      if (shouldIgnore) {
        FileUtilsLogger.debug(`[fileUtils] Ignoring ${shouldIgnore} - "${relpath}"`)
        return false
      }

      return true
    })
    .filter((item) => {
      // Filter out items in ignore directories
      if (directoriesToIgnore.some((dir) => item.fullname.startsWith(dir + '/'))) {
        FileUtilsLogger.debug(`[fileUtils] Ignoring path in dir with .ignore "${item.fullname}"`)
        return false
      }
      return true
    })
    .map((item) => {
      var isInRoot = item.path + '/' === relPathToReplace
      return {
        name: item.name,
        path: item.fullname.replace(relPathToReplace, ''),
        reldirpath: isInRoot ? '' : item.path.replace(relPathToReplace, ''),
        fullpath: item.fullname,
        extension: item.extension,
        deep: item.deep
      }
    })

  // Sort from least deep to most
  pathItems.sort((a, b) => a.deep - b.deep)

  return pathItems
}

/**
 *
 * @param {import('../Watcher').PendingFileUpdate} fileUpdate
 * @returns {FilePathItem}
 */
module.exports.getFilePathItemFromFileUpdate = (fileUpdate: { relPath: string; path: string }): FileUtilsPathItem => {
  let relPath = fileUpdate.relPath
  if (relPath.startsWith('/')) relPath = relPath.slice(1)

  const dirname = FileUtilsPath.dirname(relPath)
  return {
    name: FileUtilsPath.basename(relPath),
    path: relPath,
    reldirpath: dirname === '.' ? '' : dirname,
    fullpath: fileUpdate.path,
    extension: FileUtilsPath.extname(relPath),
    deep: relPath.split('/').length - 1
  }
}

/**
 * Download file from web to local file system
 * Uses SSRF filter to prevent internal URLs
 *
 * @param {string} url
 * @param {string} filepath path to download the file to
 * @param {Function} [contentTypeFilter] validate content type before writing
 * @returns {Promise}
 */
module.exports.downloadFile = (url: string, filepath: string, contentTypeFilter: ((contentType: unknown) => unknown) | null = null): Promise<void> => {
  return new Promise<void>(async (resolve, reject) => {
    FileUtilsLogger.debug(`[fileUtils] Downloading file to ${filepath}`)
    FileUtilsAxios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': 'audiobookshelf (+https://audiobookshelf.org)'
      },
      timeout: 30000,
      httpAgent: (global as FileUtilsGlobal).DisableSsrfRequestFilter?.(url) ? null : FileUtilsSsrfFilter(url),
      httpsAgent: (global as FileUtilsGlobal).DisableSsrfRequestFilter?.(url) ? null : FileUtilsSsrfFilter(url)
    })
      .then((response: FileUtilsAxiosResponse) => {
        // Validate content type
        if (contentTypeFilter && !contentTypeFilter?.(response.headers?.['content-type'])) {
          return reject(new Error(`Invalid content type "${response.headers?.['content-type'] || ''}"`))
        }

        const totalSize = parseInt(response.headers['content-length'] as string, 10)
        let downloadedSize = 0

        // Write to filepath
        const writer = FileUtilsFs.createWriteStream(filepath)
        response.data.pipe(writer)

        let lastProgress = 0
        response.data.on('data', (chunk: { length: number }) => {
          downloadedSize += chunk.length
          const progress = totalSize ? Math.round((downloadedSize / totalSize) * 100) : 0
          if (progress >= lastProgress + 5) {
            FileUtilsLogger.debug(`[fileUtils] File "${FileUtilsPath.basename(filepath)}" download progress: ${progress}% (${downloadedSize}/${totalSize} bytes)`)
            lastProgress = progress
          }
        })

        writer.on('finish', resolve)
        writer.on('error', reject)
      })
      .catch((err) => {
        FileUtilsLogger.error(`[fileUtils] Failed to download file "${filepath}"`, err)
        reject(err)
      })
  })
}

/**
 * Download image file from web to local file system
 * Response header must have content-type of image/ (excluding svg)
 *
 * @param {string} url
 * @param {string} filepath
 * @returns {Promise}
 */
module.exports.downloadImageFile = (url: string, filepath: string): Promise<unknown> => {
  const contentTypeFilter = (contentType: unknown) => {
    return (contentType as string | null | undefined)?.startsWith('image/') && contentType !== 'image/svg+xml'
  }
  return FileUtilsCommonJsThis.downloadFile(url, filepath, contentTypeFilter)
}

module.exports.sanitizeFilename = (filename: string, colonReplacement = ' - '): string | false => {
  if (typeof filename !== 'string') {
    return false
  }

  // Normalize the string first to ensure consistent byte calculations
  filename = filename.normalize('NFC')

  // Most file systems use number of bytes for max filename
  //   to support most filesystems we will use max of 255 bytes in utf-16
  //   Ref: https://doc.owncloud.com/server/next/admin_manual/troubleshooting/path_filename_length.html
  //   Issue: https://github.com/advplyr/audiobookshelf/issues/1261
  const MAX_FILENAME_BYTES = 255

  const replacement = ''
  const illegalRe = /[\/\?<>\\:\*\|"]/g
  const controlRe = /[\x00-\x1f\x80-\x9f]/g
  const reservedRe = /^\.+$/
  const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
  const windowsTrailingRe = /[\. ]+$/
  const lineBreaks = /[\n\r]/g

  let sanitized = filename
    .replace(':', colonReplacement) // Replace first occurrence of a colon
    .replace(illegalRe, replacement)
    .replace(controlRe, replacement)
    .replace(reservedRe, replacement)
    .replace(lineBreaks, replacement)
    .replace(windowsReservedRe, replacement)
    .replace(windowsTrailingRe, replacement)
    .replace(/\s+/g, ' ') // Replace consecutive spaces with a single space

  // Check if basename is too many bytes
  const ext = FileUtilsPath.extname(sanitized) // separate out file extension
  const basename = FileUtilsPath.basename(sanitized, ext)
  const extByteLength = Buffer.byteLength(ext, 'utf16le')

  const basenameByteLength = Buffer.byteLength(basename, 'utf16le')
  if (basenameByteLength + extByteLength > MAX_FILENAME_BYTES) {
    FileUtilsLogger.debug(`[fileUtils] Filename "${filename}" is too long (${basenameByteLength + extByteLength} bytes), trimming basename to ${MAX_FILENAME_BYTES - extByteLength} bytes.`)

    const MaxBytesForBasename = MAX_FILENAME_BYTES - extByteLength
    let totalBytes = 0
    let trimmedBasename = ''

    // Add chars until max bytes is reached
    for (const char of basename) {
      totalBytes += Buffer.byteLength(char, 'utf16le')
      if (totalBytes > MaxBytesForBasename) break
      else trimmedBasename += char
    }

    trimmedBasename = trimmedBasename.trim()
    sanitized = trimmedBasename + ext
  }

  if (filename !== sanitized) {
    FileUtilsLogger.debug(`[fileUtils] Sanitized filename "${filename}" to "${sanitized}" (${Buffer.byteLength(sanitized, 'utf16le')} bytes)`)
  }

  return sanitized
}

// Returns null if extname is not in our defined list of audio extnames
module.exports.getAudioMimeTypeFromExtname = (extname: unknown): string | null => {
  if (!extname || !(extname as { length?: unknown }).length) return null
  const formatUpper = (extname as { slice(start: number): string }).slice(1).toUpperCase()
  if (FileUtilsAudioMimeType[formatUpper]) return FileUtilsAudioMimeType[formatUpper]
  return null
}

module.exports.removeFile = (path: unknown): false | Promise<boolean> => {
  if (!path) return false
  return FileUtilsFs
    .remove(path as string)
    .then(() => true)
    .catch((error) => {
      FileUtilsLogger.error(`[fileUtils] Failed remove file "${path}"`, error)
      return false
    })
}

module.exports.encodeUriPath = (path: string): string => {
  const uri = new URL('/', 'file://')
  // we assign the path here to assure that URL control characters like # are
  // actually interpreted as part of the URL path
  uri.pathname = path
  return uri.pathname
}

/**
 * Check if directory is writable.
 * This method is necessary because fs.access(directory, fs.constants.W_OK) does not work on Windows
 *
 * @param {string} directory
 * @returns {Promise<boolean>}
 */
module.exports.isWritable = async (directory: string): Promise<boolean> => {
  try {
    const accessTestFile = FileUtilsPath.join(directory, 'accessTest')
    await FileUtilsFs.writeFile(accessTestFile, '')
    await FileUtilsFs.remove(accessTestFile)
    return true
  } catch (err) {
    FileUtilsLogger.info(`[fileUtils] Directory is not writable "${directory}"`, err)
    return false
  }
}

/**
 * Get Windows drives as array e.g. ["C:/", "F:/"]
 *
 * @returns {Promise<string[]>}
 */
module.exports.getWindowsDrives = async (): Promise<string[]> => {
  if (!(global as FileUtilsGlobal).isWin) {
    return []
  }
  return new Promise((resolve, reject) => {
    FileUtilsExec('powershell -Command "(Get-PSDrive -PSProvider FileSystem).Name"', async (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      let drives = stdout
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line)
      const validDrives: string[] = []
      for (const drive of drives) {
        let drivepath = drive + ':/'
        if (await FileUtilsFs.pathExists(drivepath)) {
          validDrives.push(drivepath)
        } else {
          FileUtilsLogger.error(`Invalid drive ${drivepath}`)
        }
      }
      resolve(validDrives)
    })
  })
}

/**
 * Get array of directory paths in a directory
 *
 * @param {string} dirPath
 * @param {number} level
 * @returns {Promise<{ path:string, dirname:string, level:number }[]>}
 */
module.exports.getDirectoriesInPath = async (dirPath: string, level: number): Promise<FileUtilsDirectory[]> => {
  try {
    const paths = await FileUtilsFs.readdir(dirPath)
    let dirs = await Promise.all(
      paths.map(async (dirname) => {
        const fullPath = FileUtilsPath.join(dirPath, dirname)

        const lstat = await FileUtilsFs.lstat(fullPath).catch((error) => {
          FileUtilsLogger.debug(`Failed to lstat "${fullPath}"`, error)
          return null
        })
        if (!lstat?.isDirectory()) return null

        return {
          path: FileUtilsCommonJsThis.filePathToPOSIX(fullPath),
          dirname,
          level
        }
      })
    )
    dirs = dirs.filter((d) => d)
    return dirs as FileUtilsDirectory[]
  } catch (error) {
    FileUtilsLogger.error('Failed to readdir', dirPath, error)
    return []
  }
}

/**
 * Copies a file from the source path to an existing destination path, preserving the destination's permissions.
 *
 * @param {string} srcPath - The path of the source file.
 * @param {string} destPath - The path of the existing destination file.
 * @returns {Promise<void>} A promise that resolves when the file has been successfully copied.
 * @throws {Error} If there is an error reading the source file or writing the destination file.
 */
async function copyToExisting(srcPath: string, destPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Create a readable stream from the source file
    const readStream = FileUtilsFs.createReadStream(srcPath)

    // Create a writable stream to the destination file
    const writeStream = FileUtilsFs.createWriteStream(destPath, { flags: 'w' })

    // Pipe the read stream to the write stream
    readStream.pipe(writeStream)

    // Handle the end of the stream
    writeStream.on('finish', () => {
      FileUtilsLogger.debug(`[copyToExisting] Successfully copied file from ${srcPath} to ${destPath}`)
      resolve()
    })

    // Handle errors
    readStream.on('error', (error) => {
      FileUtilsLogger.error(`[copyToExisting] Error reading from source file ${srcPath}: ${error.message}`)
      readStream.close()
      writeStream.close()
      reject(error)
    })

    writeStream.on('error', (error) => {
      FileUtilsLogger.error(`[copyToExisting] Error writing to destination file ${destPath}: ${error.message}`)
      readStream.close()
      writeStream.close()
      reject(error)
    })
  })
}
module.exports.copyToExisting = copyToExisting
}
