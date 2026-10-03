import axios from 'axios'
import Throttle from 'p-throttle'
import Logger from '../Logger'

const { levenshteinDistance, isValidASIN } = require('../utils/index') as {
  levenshteinDistance(first: string, second: string): number
  isValidASIN(value: string | undefined): boolean
}

/** Author payloads returned by Audnexus and enriched for nearest-name lookup. */
export interface AuthorSearchObj {
  asin: string
  description?: string | null
  image?: string | null
  name: string
  levenshteinDistance?: number
}

interface AuthorLookupEntry {
  asin: string
  name: string
  levenshteinDistance?: number
}

interface RateLimitResponse {
  status?: unknown
  headers?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getRateLimitResponse(error: unknown): RateLimitResponse | undefined {
  if (!isRecord(error) || !isRecord(error.response)) return undefined
  const response = error.response
  const headers = isRecord(response.headers) ? response.headers : undefined
  return { status: response.status, headers }
}

function getErrorMessage(error: unknown): unknown {
  return isRecord(error) ? error.message : undefined
}

class Audnexus {
  static _instance: Audnexus | null = null

  baseUrl!: string
  limiter!: ReturnType<typeof Throttle>

  constructor() {
    // Ensures Audnexus class is a singleton.
    if (Audnexus._instance) {
      return Audnexus._instance
    }

    this.baseUrl = 'https://api.audnex.us'

    // Rate limit is 100 requests per minute.
    // @see https://github.com/laxamentumtech/audnexus#-deployment-
    this.limiter = Throttle({
      // Setting the limit to 1 allows for a short pause between requests that is imperceptible to the end user.
      // A larger limit will grab blocks faster and then wait for the allotted time before fetching another batch.
      limit: 1,
      strict: true,
      interval: 150
    })

    Audnexus._instance = this
  }

  authorASINsRequest(name: string, region?: string): Promise<AuthorLookupEntry[]> {
    const searchParams = new URLSearchParams()
    searchParams.set('name', name)

    if (region) searchParams.set('region', region)

    const authorRequestUrl = `${this.baseUrl}/authors?${searchParams.toString()}`
    Logger.info(`[Audnexus] Searching for author "${authorRequestUrl}"`)

    return this._processRequest(this.limiter(() => axios.get<AuthorLookupEntry[]>(authorRequestUrl)))
      .then((res) => res.data || [])
      .catch((error: unknown) => {
        Logger.error(`[Audnexus] Author ASIN request failed for ${name}`, getErrorMessage(error))
        return []
      })
  }

  authorRequest(asin?: string | null, region?: string): Promise<AuthorSearchObj | null> | null {
    if (!isValidASIN(asin?.toUpperCase?.())) {
      Logger.error(`[Audnexus] Invalid ASIN ${asin}`)
      return null
    }

    const encodedAsin = encodeURIComponent(asin!.toUpperCase())

    const authorRequestUrl = new URL(`${this.baseUrl}/authors/${encodedAsin}`)
    if (region) authorRequestUrl.searchParams.set('region', region)

    Logger.info(`[Audnexus] Searching for author "${authorRequestUrl}"`)

    return this._processRequest(this.limiter(() => axios.get<AuthorSearchObj | null>(authorRequestUrl.toString())))
      .then((res) => res.data)
      .catch((error: unknown) => {
        Logger.error(`[Audnexus] Author request failed for ${encodedAsin}`, getErrorMessage(error))
        return null
      })
  }

  async findAuthorByASIN(asin: string, region?: string): Promise<AuthorSearchObj | null> {
    const author = await this.authorRequest(asin, region)

    return author
      ? {
          asin: author.asin,
          description: author.description,
          image: author.image || null,
          name: author.name
        }
      : null
  }

  async findAuthorByName(name: string, region?: string, maxLevenshtein = 3): Promise<AuthorSearchObj | null> {
    Logger.debug(`[Audnexus] Looking up author by name ${name}`)
    const authorAsinObjs = await this.authorASINsRequest(name, region)

    let closestMatch: (AuthorLookupEntry & { levenshteinDistance: number }) | null = null
    for (const authorAsinObj of authorAsinObjs) {
      const match = Object.assign(authorAsinObj, { levenshteinDistance: levenshteinDistance(authorAsinObj.name, name) })
      if (!closestMatch || closestMatch.levenshteinDistance > match.levenshteinDistance) {
        closestMatch = match
      }
    }

    if (!closestMatch || closestMatch.levenshteinDistance > maxLevenshtein) {
      return null
    }

    const author = await this.authorRequest(closestMatch.asin, region)
    if (!author) {
      return null
    }

    return {
      asin: author.asin,
      description: author.description,
      image: author.image || null,
      name: author.name
    }
  }

  getChaptersByASIN(asin: string, region?: string): Promise<unknown | null> {
    Logger.debug(`[Audnexus] Get chapters for ASIN ${asin}/${region}`)

    const encodedAsin = encodeURIComponent(asin.toUpperCase())
    const chaptersRequestUrl = new URL(`${this.baseUrl}/books/${encodedAsin}/chapters`)
    if (region) chaptersRequestUrl.searchParams.set('region', region)

    return this._processRequest(this.limiter(() => axios.get<unknown>(chaptersRequestUrl.toString())))
      .then((res) => res.data)
      .catch((error: unknown) => {
        Logger.error(`[Audnexus] Chapter ASIN request failed for ${encodedAsin}/${region}`, getErrorMessage(error))
        return null
      })
  }

  /** Process a throttled request and retry indefinitely after HTTP 429. */
  async _processRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request()
    } catch (error: unknown) {
      const response = getRateLimitResponse(error)
      if (response?.status === 429) {
        const retryAfterHeader = response.headers?.['retry-after']
        const retryAfter = parseInt(String(retryAfterHeader), 10) || 5

        Logger.warn(`[Audnexus] Rate limit exceeded. Retrying in ${retryAfter} seconds.`)
        await new Promise<void>((resolve) => setTimeout(resolve, retryAfter * 1000))

        return this._processRequest(request)
      }

      throw error
    }
  }
}

module.exports = Audnexus
