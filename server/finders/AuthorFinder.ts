import type { AuthorMetadata } from '../types/MetadataContracts'

const fs = require('../libs/fsExtra') as {
  pathExists(path: string): Promise<boolean>
  ensureDir(path: string): Promise<void>
}
const Logger = require('../Logger')
const Path = require('path') as typeof import('path')
const Audnexus = require('../providers/Audnexus') as {
  new (): {
    findAuthorByASIN(asin: string, region?: string): Promise<AuthorMetadata | null>
    findAuthorByName(name: string, region?: string, maxLevenshtein?: number): Promise<AuthorMetadata | null>
  }
}

const { downloadImageFile } = require('../utils/fileUtils') as { downloadImageFile(url: string, path: string): Promise<void> }

interface AuthorSearchOptions {
  maxLevenshtein?: number | string | null
}

type ImageSaveResult = { path: string; error?: never } | { path?: never; error: string }

class AuthorFinder {
  audnexus: InstanceType<typeof Audnexus>

  constructor() {
    this.audnexus = new Audnexus()
  }

  findAuthorByASIN(asin: string, region?: string): Promise<AuthorMetadata | null> | null {
    if (!asin) return null
    return this.audnexus.findAuthorByASIN(asin, region)
  }

  /**
   *
   * @param {string} name
   * @param {string} region
   * @param {Object} [options={}]
   * @returns {Promise<import('../providers/Audnexus').AuthorSearchObj>}
   */
  async findAuthorByName(name: string, region?: string, options: AuthorSearchOptions = {}): Promise<AuthorMetadata | null> {
    if (!name) return null
    const maxLevenshtein = !isNaN(Number(options.maxLevenshtein === undefined ? NaN : options.maxLevenshtein)) ? Number(options.maxLevenshtein) : 3

    const author = await this.audnexus.findAuthorByName(name, region, maxLevenshtein)
    if (!author?.name) {
      return null
    }
    return author
  }

  /**
   * Download author image from url and save in authors folder
   *
   * @param {string} authorId
   * @param {string} url
   * @returns {Promise<{path:string, error:string}>}
   */
  async saveAuthorImage(authorId: string, url: string): Promise<ImageSaveResult> {
    const authorDir = Path.join(global.MetadataPath, 'authors')

    if (!await fs.pathExists(authorDir)) {
      await fs.ensureDir(authorDir)
    }

    const imageExtension = url.toLowerCase().split('.').pop()
    const ext = imageExtension === 'png' ? 'png' : 'jpg'
    const filename = authorId + '.' + ext
    const outputPath = Path.posix.join(authorDir, filename)

    return downloadImageFile(url, outputPath).then(() => {
      return {
        path: outputPath
      }
    }).catch((err: unknown) => {
      const errorMsg = err && typeof err === 'object' && 'message' in err && err.message ? String(err.message) : 'Unknown error'
      Logger.error(`[AuthorFinder] Download image file failed for "${url}"`, errorMsg)
      return {
        error: errorMsg
      }
    })
  }
}
export = new AuthorFinder()
