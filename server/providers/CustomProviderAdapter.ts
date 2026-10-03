import axios from 'axios'
import Database from '../Database'
import Logger from '../Logger'
import htmlSanitizer from '../utils/htmlSanitizer'
import type { BookMetadata } from '../types/MetadataContracts'

interface CustomMetadataProviderRecord {
  url: string
  authHeaderValue?: string | null
}

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
  genres?: unknown
  tags?: unknown
  series?: unknown
  language?: unknown
  duration?: unknown
}

interface CustomProviderSearchResponse {
  matches?: CustomProviderMatch[]
}

interface CustomProviderSeries {
  series: string
  sequence?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'

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
  async search(title: string, author: string, isbn: string, providerSlug: string, mediaType: string, timeout = this.#responseTimeout): Promise<BookMetadata[]> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const providerId = providerSlug.split('custom-')[1]
    const customMetadataProviderModel = Database.customMetadataProviderModel
    const provider: CustomMetadataProviderRecord | null | undefined = await Reflect.apply(
      customMetadataProviderModel.findByPk,
      customMetadataProviderModel,
      [providerId]
    )

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
    const axiosOptions: { timeout: number; headers?: { Authorization: string } } = {
      timeout
    }
    if (provider.authHeaderValue) {
      axiosOptions.headers = {
        Authorization: provider.authHeaderValue
      }
    }

    const matches = await axios
      .get<CustomProviderSearchResponse>(url, axiosOptions)
      .then((res) => {
        if (!res?.data || !Array.isArray(res.data.matches)) return null
        return res.data.matches
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        Logger.error('[CustomMetadataProvider] Search error', message)
        return []
      })

    if (!matches) {
      throw new Error('Custom provider returned malformed response')
    }

    const toStringOrUndefined = (value: unknown): string | undefined => {
      if (typeof value === 'string' || typeof value === 'number') return String(value)
      if (Array.isArray(value)) {
        const values: unknown[] = value
        if (values.every((item) => typeof item === 'string' || typeof item === 'number')) return values.join(',')
      }
      return undefined
    }
    const validateSeriesArray = (series: unknown): CustomProviderSeries[] | undefined => {
      if (!Array.isArray(series) || !series.length) return undefined
      const seriesItems: unknown[] = series
      return seriesItems
        .map((item) => {
          const seriesValue = isRecord(item) ? item.series : undefined
          if (!seriesValue || typeof seriesValue !== 'string') return undefined
          const cleanSeries: CustomProviderSeries = {
            series: seriesValue
          }
          const sequence = isRecord(item) ? item.sequence : undefined
          if (sequence && (typeof sequence === 'string' || typeof sequence === 'number')) {
            cleanSeries.sequence = String(sequence)
          }
          return cleanSeries
        })
        .filter((item): item is CustomProviderSeries => item !== undefined)
    }
    /**
     * Validates and dedupes tags/genres array
     * Can be comma separated string or array of strings
     */
    const validateTagsGenresArray = (tagsGenres: unknown): string[] | undefined => {
      if (!tagsGenres || (typeof tagsGenres !== 'string' && !Array.isArray(tagsGenres))) return undefined

      // If string, split by comma and trim each item
      let values: string[]
      if (typeof tagsGenres === 'string') values = tagsGenres.split(',')
      else {
        const rawValues: unknown[] = tagsGenres
        const stringValues: string[] = []
        for (const item of rawValues) {
          if (typeof item !== 'string') return undefined
          stringValues.push(item)
        }
        values = stringValues
      }

      // Trim and filter out empty strings
      values = values.map((value) => value.trim()).filter(Boolean)
      if (!values.length) return undefined

      // Dedup
      return [...new Set(values)]
    }

    // re-map keys to throw out
    return matches.map((match) => {
      const { title, subtitle, author, narrator, publisher, publishedYear, description, cover, isbn, asin, genres, tags, series, language, duration } = match

      const numericDuration = Number(duration)
      const payload: BookMetadata = {
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
        duration: !isNaN(numericDuration) && duration !== null ? Number(duration) : undefined
      }

      // Remove undefined values
      for (const key of Object.keys(payload) as (keyof BookMetadata)[]) {
        if (payload[key] === undefined) {
          delete payload[key]
        }
      }

      return payload
    })
  }
}

module.exports = CustomProviderAdapter
