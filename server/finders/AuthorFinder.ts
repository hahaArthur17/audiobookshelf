import fs = require('../libs/fsExtra')
import Logger = require('../Logger')
import Path = require('path')
import Audnexus = require('../providers/Audnexus')

import fileUtils = require('../utils/fileUtils')
const { downloadImageFile } = fileUtils

// lib.d.ts types isNaN(number), but the built-in coerces every value and these option fields can be undefined. Widens the type for this file only; emits no code.
declare function isNaN(value: unknown): boolean

// file-local: Node's typings have no MetadataPath on global (set in Server.js:68). Emits no code.
declare const global: typeof globalThis & { MetadataPath: string }

type AuthorSearchObj = import('../providers/Audnexus').AuthorSearchObj

interface AuthorSearchOptions {
  maxLevenshtein?: number
}

interface SavedAuthorImage {
  path: string
}

interface AuthorImageError {
  error: string
}

class AuthorFinder {
  declare audnexus: Audnexus

  constructor() {
    this.audnexus = new Audnexus()
  }

  findAuthorByASIN(asin: string | null | undefined, region: string): Promise<AuthorSearchObj | null> | null {
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
  async findAuthorByName(name: string | null | undefined, region?: string, options: AuthorSearchOptions = {}): Promise<AuthorSearchObj | null> {
    if (!name) return null
    const maxLevenshtein = !isNaN(options.maxLevenshtein) ? Number(options.maxLevenshtein) : 3

    const author = await this.audnexus.findAuthorByName(name, region as string, maxLevenshtein)
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
  async saveAuthorImage(authorId: string, url: string): Promise<SavedAuthorImage | AuthorImageError> {
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
    }).catch((err: Error) => {
      let errorMsg = err.message || 'Unknown error'
      Logger.error(`[AuthorFinder] Download image file failed for "${url}"`, errorMsg)
      return {
        error: errorMsg
      }
    })
  }
}
export = new AuthorFinder()