import type { AuthorMetadata } from '../types/MetadataContracts'

const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const Path = require('path')
const Audnexus = require('../providers/Audnexus')
const { downloadImageFile } = require('../utils/fileUtils')

interface AuthorFinderOptions {
  maxLevenshtein?: unknown
}

type SaveAuthorImageResult = { path: string } | { error: string }

class AuthorFinder {
  private audnexus: InstanceType<typeof Audnexus>

  constructor() {
    this.audnexus = new Audnexus()
  }

  findAuthorByASIN(asin: string | null | undefined, region?: string): Promise<AuthorMetadata | null> | null {
    if (!asin) return null
    return this.audnexus.findAuthorByASIN(asin, region)
  }

  async findAuthorByName(
    name: string,
    region?: string,
    options: AuthorFinderOptions = {}
  ): Promise<AuthorMetadata | null> {
    if (!name) return null

    const configuredMaxLevenshtein = Number(options.maxLevenshtein)
    const maxLevenshtein = Number.isNaN(configuredMaxLevenshtein) ? 3 : configuredMaxLevenshtein

    const author = await this.audnexus.findAuthorByName(name, region, maxLevenshtein)
    if (!author?.name) {
      return null
    }
    return author
  }

  /** Download an author image and save it in the authors folder. */
  async saveAuthorImage(authorId: string, url: string): Promise<SaveAuthorImageResult> {
    const metadataPath = (globalThis as typeof globalThis & { MetadataPath: string }).MetadataPath
    const authorDir = Path.join(metadataPath, 'authors')

    if (!await fs.pathExists(authorDir)) {
      await fs.ensureDir(authorDir)
    }

    const imageExtension = url.toLowerCase().split('.').pop()
    const ext = imageExtension === 'png' ? 'png' : 'jpg'
    const filename = authorId + '.' + ext
    const outputPath = Path.posix.join(authorDir, filename)

    return downloadImageFile(url, outputPath).then((): SaveAuthorImageResult => {
      return { path: outputPath }
    }).catch((error: unknown): SaveAuthorImageResult => {
      const errorMsg = getErrorMessage(error)
      Logger.error(`[AuthorFinder] Download image file failed for "${url}"`, errorMsg)
      return { error: errorMsg }
    })
  }
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message || 'Unknown error'
  }
  return 'Unknown error'
}

module.exports = new AuthorFinder()
