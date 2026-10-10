import axiosModule = require('axios')
const axios = axiosModule.default

// lib.d.ts types isNaN(number), but the built-in coerces every value and parsePublishYear() calls it with the year part of a date string. Widens the type for this file only; emits no code.
declare function isNaN(value: unknown): boolean

// The three interfaces below describe OpenLibrary's JSON, limited to the fields that are read here. It is external data: the server does not validate it.

/** A doc in a search.json response */
interface OpenLibrarySearchDoc {
  key: string
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_edition_key?: string
}

interface OpenLibrarySearchResponse {
  docs: OpenLibrarySearchDoc[]
}

/** A works record (<works key>.json) */
interface OpenLibraryWorksResponse {
  covers?: number[]
  description?: string | { value?: string }
  first_publish_date?: string
}

/** Returned in place of data when a request to OpenLibrary fails */
interface OpenLibraryRequestError {
  errorCode: 404
}

/** Returned by getWorksData() when the works request fails. cleanSearchDoc() spreads it into the search hit just like a successful result. */
interface OpenLibraryWorksError {
  errorMsg: string
  errorCode: 500
  first_publish_date?: undefined // read by parsePublishYear() without checking for the error first
}

interface OpenLibraryWorksData {
  /** Last segment of the works key. split() never returns an empty array, hence the non-null assertion in getWorksData(). */
  id: string
  key: string
  covers: string[]
  first_publish_date: string | undefined
  description: string | null
}

/** A search hit: fields from the search doc, with the works data (or the works error) spread over them */
type OpenLibrarySearchResult = {
  title: string
  author: string | null
  publishedYear: string | null
  edition: string | undefined
  cover: string | null
} & (OpenLibraryWorksData | OpenLibraryWorksError)

class OpenLibrary {
  #responseTimeout = 10000

  declare baseUrl: string

  constructor() {
    this.baseUrl = 'https://openlibrary.org'
  }

  /**
   *
   * @template T the shape the caller expects back; the response is not checked against it
   * @param {string} uri
   * @param {number} timeout
   * @returns {Promise<Object>}
   */
  get<T>(uri: string, timeout: number = this.#responseTimeout): Promise<T | null> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout
    return axios
      .get<T>(`${this.baseUrl}/${uri}`, {
        timeout
      })
      .then((res) => {
        return res.data
      })
      .catch((error) => {
        console.error('Failed', error.message)
        return null
      })
  }

  async isbnLookup(isbn: string): Promise<Record<string, unknown> | OpenLibraryRequestError> {
    var lookupData = await this.get<Record<string, unknown>>(`/isbn/${isbn}`)
    if (!lookupData) {
      return {
        errorCode: 404
      }
    }
    return lookupData
  }

  async getWorksData(worksKey: string): Promise<OpenLibraryWorksData | OpenLibraryWorksError> {
    var worksData = await this.get<OpenLibraryWorksResponse>(`${worksKey}.json`)
    if (!worksData) {
      return {
        errorMsg: 'Works Data Request failed',
        errorCode: 500
      }
    }
    if (!worksData.covers) worksData.covers = []
    var coverImages = worksData.covers.filter((c) => c > 0).map((c) => `https://covers.openlibrary.org/b/id/${c}-L.jpg`)
    var description: string | null = null
    if (worksData.description) {
      if (typeof worksData.description === 'string') {
        description = worksData.description
      } else {
        description = worksData.description.value || null
      }
    }
    return {
      id: worksKey.split('/').pop()!,
      key: worksKey,
      covers: coverImages,
      first_publish_date: worksData.first_publish_date,
      description: description
    }
  }

  parsePublishYear(doc: OpenLibrarySearchDoc, worksData: OpenLibraryWorksData | OpenLibraryWorksError): string | null {
    if (doc.first_publish_year && !isNaN(doc.first_publish_year)) return String(doc.first_publish_year)
    if (worksData.first_publish_date) {
      var year = worksData.first_publish_date.split('-')[0]
      if (!isNaN(year)) return String(year)
    }
    return null
  }

  async cleanSearchDoc(doc: OpenLibrarySearchDoc): Promise<OpenLibrarySearchResult> {
    var worksData = await this.getWorksData(doc.key)
    return {
      title: doc.title,
      author: doc.author_name ? doc.author_name.join(', ') : null,
      publishedYear: this.parsePublishYear(doc, worksData),
      edition: doc.cover_edition_key,
      cover: doc.cover_edition_key ? `https://covers.openlibrary.org/b/OLID/${doc.cover_edition_key}-L.jpg` : null,
      ...worksData
    }
  }

  async search(query: Record<string, string | number | boolean>): Promise<OpenLibrarySearchResult[] | OpenLibraryRequestError> {
    var queryString = Object.keys(query)
      .map((key) => key + '=' + query[key])
      .join('&')
    var lookupData = await this.get<OpenLibrarySearchResponse>(`/search.json?${queryString}`)
    if (!lookupData) {
      return {
        errorCode: 404
      }
    }
    var searchDocs = await Promise.all(lookupData.docs.map((d) => this.cleanSearchDoc(d)))
    return searchDocs
  }

  /**
   *
   * @param {string} title
   * @param {number} timeout
   * @returns {Promise<Object[]>}
   */
  async searchTitle(title: string, timeout: number = this.#responseTimeout): Promise<OpenLibrarySearchResult[] | OpenLibraryRequestError> {
    title = encodeURIComponent(title)
    var lookupData = await this.get<OpenLibrarySearchResponse>(`/search.json?title=${title}`, timeout)
    if (!lookupData) {
      return {
        errorCode: 404
      }
    }
    var searchDocs = await Promise.all(lookupData.docs.map((d) => this.cleanSearchDoc(d)))
    return searchDocs
  }
}
export = OpenLibrary
