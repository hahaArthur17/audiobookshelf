import axios from 'axios'
import Logger from '../Logger'
import type { BookMetadata } from '../types/MetadataContracts'

const { isValidASIN } = require('../utils/index') as { isValidASIN(value: string): boolean }

interface AudibleSeries {
  name: string
  position?: string
}

interface AudibleGenre {
  type: string
  name: string
}

interface AudibleProduct {
  title?: string
  subtitle?: string
  asin?: string
  authors?: Array<{ name: string }> | null
  narrators?: Array<{ name: string }> | null
  publisherName?: string
  summary?: string | null
  releaseDate?: string | null
  image?: string | null
  genres?: AudibleGenre[] | null
  seriesPrimary?: AudibleSeries | null
  seriesSecondary?: AudibleSeries | null
  language?: string | null
  runtimeLengthMin?: number | string | null
  formatType?: string
  isbn?: string | null
  region?: string | null
  rating?: number | null
  isAdult?: boolean
}

interface AudibleCatalogResponse {
  products?: Array<{ asin?: string }> | null
}

function getErrorMessage(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined
}

class Audible {
  #responseTimeout = 10000
  regionMap: Record<string, string>

  constructor() {
    this.regionMap = {
      us: '.com',
      ca: '.ca',
      uk: '.co.uk',
      au: '.com.au',
      fr: '.fr',
      de: '.de',
      jp: '.co.jp',
      it: '.it',
      in: '.in',
      es: '.es'
    }
  }

  /**
   * Audible will sometimes send sequences with "Book 1" or "2, Dramatized Adaptation"
   * @see https://github.com/advplyr/audiobookshelf/issues/2380
   * @see https://github.com/advplyr/audiobookshelf/issues/1339
   */
  cleanSeriesSequence(seriesName: string, sequence: string): string {
    if (!sequence) return ''
    // Match any number with an optional decimal (e.g. 1, 1.5 or .5).
    const numberFound = sequence.match(/\.\d+|\d+(?:\.\d+)?/)
    const updatedSequence = numberFound ? numberFound[0] : sequence
    if (sequence !== updatedSequence) {
      Logger.debug(`[Audible] Series "${seriesName}" sequence was cleaned from "${sequence}" to "${updatedSequence}"`)
    }
    return updatedSequence
  }

  cleanResult(item: AudibleProduct): BookMetadata {
    const { title, subtitle, asin, authors, narrators, publisherName, summary, releaseDate, image, genres, seriesPrimary, seriesSecondary, language, runtimeLengthMin, formatType, isbn } = item

    const series: Array<{ series: string; sequence?: string }> = []
    if (seriesPrimary) {
      series.push({
        series: seriesPrimary.name,
        sequence: this.cleanSeriesSequence(seriesPrimary.name, seriesPrimary.position || '')
      })
    }
    if (seriesSecondary) {
      series.push({
        series: seriesSecondary.name,
        sequence: this.cleanSeriesSequence(seriesSecondary.name, seriesSecondary.position || '')
      })
    }

    let genresCleaned: string[] = []
    let tagsCleaned: string[] = []

    if (genres && Array.isArray(genres)) {
      genresCleaned = [...new Set(genres.filter((genre) => genre.type == 'genre').map((genre) => genre.name))]
      tagsCleaned = [...new Set(genres.filter((genre) => genre.type == 'tag').map((genre) => genre.name))]
    }

    return {
      title,
      subtitle: subtitle || null,
      author: authors ? authors.map(({ name }) => name).join(', ') : null,
      narrator: narrators ? narrators.map(({ name }) => name).join(', ') : null,
      publisher: publisherName,
      publishedYear: releaseDate ? releaseDate.split('-')[0] : null,
      description: summary || null,
      cover: image,
      asin,
      isbn,
      genres: genresCleaned.length ? genresCleaned : null,
      tags: tagsCleaned.length ? tagsCleaned : null,
      series: series.length ? series : null,
      language: language ? language.charAt(0).toUpperCase() + language.slice(1) : null,
      duration: runtimeLengthMin && !isNaN(Number(runtimeLengthMin)) ? Number(runtimeLengthMin) : 0,
      region: item.region || null,
      rating: item.rating || null,
      abridged: formatType === 'abridged',
      explicit: !!item.isAdult
    }
  }

  asinSearch(asin?: string | null, region = '', timeout = this.#responseTimeout): Promise<AudibleProduct | null> | null {
    if (!asin) return null
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    asin = encodeURIComponent(asin.toUpperCase())
    const regionQuery = region ? `?region=${region}` : ''
    const url = `https://api.audnex.us/books/${asin}${regionQuery}`
    Logger.debug(`[Audible] ASIN url: ${url}`)
    return axios
      .get<AudibleProduct>(url, { timeout })
      .then((res) => {
        if (!res?.data?.asin) return null
        return res.data
      })
      .catch((error: unknown) => {
        Logger.error('[Audible] ASIN search error', getErrorMessage(error))
        return null
      })
  }

  async search(title: string, author: string, asin: string, region: string, timeout = this.#responseTimeout): Promise<BookMetadata[]> {
    if (region && !this.regionMap[region]) {
      Logger.error(`[Audible] search: Invalid region ${region}`)
      region = ''
    }
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    let items: Array<AudibleProduct | null> | null = []
    if (asin && isValidASIN(asin.toUpperCase())) {
      const item = await this.asinSearch(asin, region, timeout)
      if (item) items.push(item)
    }

    if (!items.length && isValidASIN(title.toUpperCase())) {
      const item = await this.asinSearch(title, region, timeout)
      if (item) items.push(item)
    }

    if (!items.length) {
      const queryObj: Record<string, string> = {
        num_results: '10',
        products_sort_by: 'Relevance',
        title
      }
      if (author) queryObj.author = author
      const queryString = new URLSearchParams(queryObj).toString()
      const tld = region ? this.regionMap[region] : '.com'
      const url = `https://api.audible${tld}/1.0/catalog/products?${queryString}`
      Logger.debug(`[Audible] Search url: ${url}`)
      items = await axios
        .get<AudibleCatalogResponse>(url, { timeout })
        .then((res) => {
          if (!res?.data?.products) return null
          return Promise.all(res.data.products.map((result) => this.asinSearch(result.asin, region, timeout)))
        })
        .catch((error: unknown) => {
          Logger.error('[Audible] query search error', getErrorMessage(error))
          return []
        })
    }
    return items!.filter((item): item is AudibleProduct => Boolean(item)).map((item) => this.cleanResult(item)) || []
  }
}

module.exports = Audible
