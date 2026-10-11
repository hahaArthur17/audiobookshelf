import Path = require('path')
import fs = require('../libs/fsExtra')
import stream = require('stream')
import Logger = require('../Logger')
import ffmpegHelpers = require('../utils/ffmpegHelpers')
const { resizeImage } = ffmpegHelpers
import fileUtils = require('../utils/fileUtils')
const { encodeUriPath } = fileUtils
import utils = require('../utils/index')
const { isUUID } = utils
import Database = require('../Database')
import type { Response } from 'express'
import type { ReadStream } from 'fs'

declare const global: typeof globalThis & { MetadataPath: string; XAccel?: string }

// libs/fsExtra adds the promisified fs methods in a loop (exports[method] = u(fs[method])), so its inferred type lacks them
type FsWithNodeMethods = typeof fs & { createReadStream(path: string): ReadStream; readdir(path: string): Promise<string[]>; unlink(path: string): Promise<void> }
// width and height may be null: the controllers pass the result of clampPositiveInt(), and both handlers fall back to a default
type CacheImageOptions = { format?: string; width?: number | null; height?: number | null }

function isValidCacheDimension(dimension: number): boolean {
  return Number.isSafeInteger(dimension) && dimension > 0
}

class CacheManager {
  declare CachePath: string | null
  declare CoverCachePath: string | null
  declare ImageCachePath: string | null
  declare ItemCachePath: string | null

  constructor() {
    this.CachePath = null
    this.CoverCachePath = null
    this.ImageCachePath = null
    this.ItemCachePath = null
  }

  /**
   * Create cache directory paths if they dont exist
   */
  async ensureCachePaths(): Promise<void> {
    // Creates cache paths if necessary and sets owner and permissions
    this.CachePath = Path.join(global.MetadataPath, 'cache')
    this.CoverCachePath = Path.join(this.CachePath, 'covers')
    this.ImageCachePath = Path.join(this.CachePath, 'images')
    this.ItemCachePath = Path.join(this.CachePath, 'items')

    try {
      await fs.ensureDir(this.CachePath)
      await fs.ensureDir(this.CoverCachePath)
      await fs.ensureDir(this.ImageCachePath)
      await fs.ensureDir(this.ItemCachePath)
    } catch (error) {
      Logger.error(`[CacheManager] Failed to create cache directories at "${this.CachePath}": ${(error as Error).message}`) // a catch variable is unknown; libs/fsExtra ensureDir rejects with a Node fs Error
      throw new Error(`[CacheManager] Failed to create cache directories at "${this.CachePath}"`, { cause: error })
    }
  }

  async handleCoverCache(res: Response, libraryItemId: string, options: CacheImageOptions = {}) {
    const format = options.format || 'webp'
    const width = options.width || 400
    const height = options.height || null

    if (!['webp', 'jpeg', 'png'].includes(format) || !isUUID(libraryItemId) || !isValidCacheDimension(width) || (height !== null && !isValidCacheDimension(height))) {
      return res.sendStatus(400)
    }
    res.type(`image/${format}`)

    const cachePath = Path.join(this.CoverCachePath!, `${libraryItemId}_${width}${height ? `x${height}` : ''}`) + '.' + format // CoverCachePath starts as null and is set by ensureCachePaths(), which Server.init() awaits before requests are served

    // Cache exists
    if (await fs.pathExists(cachePath)) {
      if (global.XAccel) {
        const encodedURI = encodeUriPath(global.XAccel + cachePath)
        Logger.debug(`Use X-Accel to serve static file ${encodedURI}`)
        return res.status(204).header({ 'X-Accel-Redirect': encodedURI }).send()
      }

      const r = (fs as FsWithNodeMethods).createReadStream(cachePath) // boundary: libs/fsExtra, see FsWithNodeMethods
      const ps = new stream.PassThrough()
      stream.pipeline(r, ps, (err) => {
        if (err) {
          console.log(err)
          return res.sendStatus(500)
        }
      })
      return ps.pipe(res)
    }

    // Cached cover does not exist, generate it
    const coverPath = await Database.libraryItemModel.getCoverPath(libraryItemId)
    if (!coverPath || !(await fs.pathExists(coverPath))) {
      return res.sendStatus(404)
    }

    const writtenFile = await resizeImage(coverPath, cachePath, width, height)
    if (!writtenFile) return res.sendStatus(500)

    if (global.XAccel) {
      const encodedURI = encodeUriPath(global.XAccel + writtenFile)
      Logger.debug(`Use X-Accel to serve static file ${encodedURI}`)
      return res.status(204).header({ 'X-Accel-Redirect': encodedURI }).send()
    }

    var readStream = (fs as FsWithNodeMethods).createReadStream(writtenFile) // boundary: libs/fsExtra, see FsWithNodeMethods
    readStream.pipe(res)
  }

  purgeCoverCache(libraryItemId: string) {
    return this.purgeEntityCache(libraryItemId, this.CoverCachePath)
  }

  purgeImageCache(entityId: string) {
    return this.purgeEntityCache(entityId, this.ImageCachePath)
  }

  async purgeEntityCache(entityId: string, cachePath: string | null): Promise<boolean[]> {
    if (!entityId || !cachePath) return []
    return Promise.all(
      (await (fs as FsWithNodeMethods).readdir(cachePath)).reduce<(false | Promise<boolean>)[]>((promises, file) => { // boundary: libs/fsExtra, see FsWithNodeMethods
        if (file.startsWith(entityId)) {
          Logger.debug(`[CacheManager] Going to purge ${file}`)
          promises.push(this.removeCache(Path.join(cachePath, file)))
        }
        return promises
      }, [])
    )
  }

  removeCache(path: string): false | Promise<boolean> {
    if (!path) return false
    return fs.pathExists(path).then((exists: boolean) => {
      if (!exists) return false
      return (fs as FsWithNodeMethods) // boundary: libs/fsExtra, see FsWithNodeMethods
        .unlink(path)
        .then(() => true)
        .catch((err) => {
          Logger.error(`[CacheManager] Failed to remove cache "${path}"`, err)
          return false
        })
    })
  }

  async purgeAll(): Promise<void> {
    Logger.info(`[CacheManager] Purging all cache at "${this.CachePath}"`)
    if (await fs.pathExists(this.CachePath)) {
      // boundary: libs/fsExtra wraps remove with universalify, whose inferred return type is Promise | undefined (undefined only when a callback is passed)
      await (fs.remove(this.CachePath) as Promise<void>).catch((error) => {
        Logger.error(`[CacheManager] Failed to remove cache dir "${this.CachePath}"`, error)
      })
    }
    await this.ensureCachePaths()
  }

  async purgeItems(): Promise<void> {
    Logger.info(`[CacheManager] Purging items cache at "${this.ItemCachePath}"`)
    if (await fs.pathExists(this.ItemCachePath)) {
      // boundary: libs/fsExtra remove, same as in purgeAll()
      await (fs.remove(this.ItemCachePath) as Promise<void>).catch((error) => {
        Logger.error(`[CacheManager] Failed to remove items cache dir "${this.ItemCachePath}"`, error)
      })
    }
    await this.ensureCachePaths()
  }

  /**
   *
   * @param {import('express').Response} res
   * @param {String} authorId
   * @param {{ format?: string, width?: number, height?: number }} options
   * @returns
   */
  async handleAuthorCache(res: Response, authorId: string, options: CacheImageOptions = {}) {
    const format = options.format || 'webp'
    const width = options.width || 400
    const height = options.height || null

    if (!['webp', 'jpeg', 'png'].includes(format) || !isUUID(authorId) || !isValidCacheDimension(width) || (height !== null && !isValidCacheDimension(height))) {
      return res.sendStatus(400)
    }
    res.type(`image/${format}`)

    var cachePath = Path.join(this.ImageCachePath!, `${authorId}_${width}${height ? `x${height}` : ''}`) + '.' + format // ImageCachePath starts as null and is set by ensureCachePaths(), which Server.init() awaits before requests are served

    // Cache exists
    if (await fs.pathExists(cachePath)) {
      const r = (fs as FsWithNodeMethods).createReadStream(cachePath) // boundary: libs/fsExtra, see FsWithNodeMethods
      const ps = new stream.PassThrough()
      stream.pipeline(r, ps, (err) => {
        if (err) {
          console.log(err)
          return res.sendStatus(500)
        }
      })
      return ps.pipe(res)
    }

    const author = await Database.authorModel.findByPk(authorId)
    if (!author || !author.imagePath || !(await fs.pathExists(author.imagePath))) {
      return res.sendStatus(404)
    }

    let writtenFile = await resizeImage(author.imagePath, cachePath, width, height)
    if (!writtenFile) return res.sendStatus(500)

    var readStream = (fs as FsWithNodeMethods).createReadStream(writtenFile) // boundary: libs/fsExtra, see FsWithNodeMethods
    readStream.pipe(res)
  }
}
export = new CacheManager()
