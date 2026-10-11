import axiosModule = require('axios')
const axios = axiosModule.default
import type { AxiosRequestConfig } from 'axios'
import Database = require('../Database')
import Logger = require('../Logger')
import htmlSanitizer = require('../utils/htmlSanitizer')

// lib.d.ts types isNaN(number), but the built-in coerces every value and duration is external data. Widens the type for this file only; emits no code.
declare function isNaN(value: unknown): boolean

/** One item of `matches` in a custom provider's search response. External data: search() validates every value */
interface CustomProviderMatch {
  title?: unknown
  subtitle?: unknown
  author?: unknown
  narrator?: unknown
  publisher?: unknown
  publishedYear?: unknown
  description?: unknown
  cover?: unknown
  isbn?: unknown
  asin?: unknown
  genres?: string | string[] | null
  tags?: string | string[] | null
  series?: unknown
  language?: unknown
  duration?: unknown
}

interface CustomProviderSeries {
  series: string
  sequence?: string
}

/** One validated match as search() returns it */
interface CustomProviderResult {
  title?: string
  subtitle?: string
  author?: string
  narrator?: string
  publisher?: string
  publishedYear?: string
  description?: string
  cover?: string
  isbn?: string
  asin?: string
  genres?: string[]
  tags?: string[]
  series?: CustomProviderSeries[]
  language?: string
  duration?: number
  [key: string]: unknown // search() removes the undefined values by key in a for...in loop
}

class CustomProviderAdapter {
  #responseTimeout = 10000

  constructor() {}

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} isbn
   * @param {string} providerSlug
   * @param {string} mediaType
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object[]>}
   */
  async search(title: string, author: string, isbn: string, providerSlug: string, mediaType: string, timeout: number = this.#responseTimeout): Promise<CustomProviderResult[]> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const providerId = providerSlug.split('custom-')[1]
    const provider = await Database.customMetadataProviderModel.findByPk(providerId)

    if (!provider) {
      throw new Error('Custom provider not found for the given id')
    }

    // Setup query params
    const queryObj: Record<string, string> = {
      mediaType,
      query: title
    }
    if (author) {
      queryObj.author = author
    }
    if (isbn) {
      queryObj.isbn = isbn
    }
    const queryString = new URLSearchParams(queryObj).toString()

    const url = `${provider.url}/search?${queryString}`
    Logger.debug(`[CustomMetadataProvider] Search url: ${url}`)

    // Setup headers
    const axiosOptions: AxiosRequestConfig = {
      timeout
    }
    if (provider.authHeaderValue) {
      axiosOptions.headers = {
        Authorization: provider.authHeaderValue
      }
    }

    const matches = await axios
      .get<{ matches?: CustomProviderMatch[] }>(url, axiosOptions)
      .then((res) => {
        if (!res?.data || !Array.isArray(res.data.matches)) return null
        return res.data.matches
      })
      .catch((error: Error) => {
        Logger.error('[CustomMetadataProvider] Search error', error.message)
        return []
      })

    if (!matches) {
      throw new Error('Custom provider returned malformed response')
    }

    const toStringOrUndefined = (value: unknown): string | undefined => {
      if (typeof value === 'string' || typeof value === 'number') return String(value)
      if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) return value.join(',')
      return undefined
    }
    const validateSeriesArray = (series: unknown): CustomProviderSeries[] | undefined => {
      if (!Array.isArray(series) || !series.length) return undefined
      return series
        .map((s: { series?: unknown; sequence?: unknown } | null | undefined) => {
          if (!s?.series || typeof s.series !== 'string') return undefined
          const _series: CustomProviderSeries = {
            series: s.series
          }
          if (s.sequence && (typeof s.sequence === 'string' || typeof s.sequence === 'number')) {
            _series.sequence = String(s.sequence)
          }
          return _series
        })
        .filter((s) => s !== undefined)
    }
    /**
     * Validates and dedupes tags/genres array
     * Can be comma separated string or array of strings
     * @param {string|string[]} tagsGenres
     * @returns {string[]}
     */
    const validateTagsGenresArray = (tagsGenres: string | string[] | null | undefined): string[] | undefined => {
      if (!tagsGenres || (typeof tagsGenres !== 'string' && !Array.isArray(tagsGenres))) return undefined

      // If string, split by comma and trim each item
      if (typeof tagsGenres === 'string') tagsGenres = tagsGenres.split(',')
      // If array, ensure all items are strings
      else if (!tagsGenres.every((t) => typeof t === 'string')) return undefined

      // Trim and filter out empty strings
      tagsGenres = tagsGenres.map((t) => t.trim()).filter(Boolean)
      if (!tagsGenres.length) return undefined

      // Dedup
      return [...new Set(tagsGenres)]
    }

    // re-map keys to throw out
    return matches.map((match) => {
      const { title, subtitle, author, narrator, publisher, publishedYear, description, cover, isbn, asin, genres, tags, series, language, duration } = match

      const payload: CustomProviderResult = {
        title: toStringOrUndefined(title),
        subtitle: toStringOrUndefined(subtitle),
        author: toStringOrUndefined(author),
        narrator: toStringOrUndefined(narrator),
        publisher: toStringOrUndefined(publisher),
        publishedYear: toStringOrUndefined(publishedYear),
        description: description && typeof description === 'string' ? htmlSanitizer.sanitize(description) : undefined,
        cover: toStringOrUndefined(cover),
        isbn: toStringOrUndefined(isbn),
        asin: toStringOrUndefined(asin),
        genres: validateTagsGenresArray(genres),
        tags: validateTagsGenresArray(tags),
        series: validateSeriesArray(series),
        language: toStringOrUndefined(language),
        duration: !isNaN(duration) && duration !== null ? Number(duration) : undefined
      }

      // Remove undefined values
      for (const key in payload) {
        if (payload[key] === undefined) {
          delete payload[key]
        }
      }

      return payload
    })
  }
}

export = CustomProviderAdapter
