import axios from 'axios'
import type { BookMetadata, ProviderError, OpenLibrarySearchResult } from '../types/MetadataContracts'

interface OpenLibrarySearchDoc {
  key: string
  title?: string
  author_name?: string[]
  first_publish_year?: number | string
  cover_edition_key?: string
}

interface OpenLibrarySearchResponse {
  docs: OpenLibrarySearchDoc[]
}

interface OpenLibraryWorkResponse {
  covers?: number[]
  first_publish_date?: string
  description?: string | { value?: string } | null
}

interface OpenLibraryWorksData {
  id?: string
  key?: string
  covers?: string[]
  first_publish_date?: string
  description?: string | null
  errorCode?: number
  errorMsg?: string
}

interface OpenLibraryBookRecord {
  [key: string]: unknown
}

class OpenLibrary {
  #responseTimeout = 10000
  baseUrl: string

  constructor() {
    this.baseUrl = 'https://openlibrary.org'
  }

  async get<T>(uri: string, timeout = this.#responseTimeout): Promise<T | null> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout
    try {
      const res = await axios.get<T>(`${this.baseUrl}/${uri}`, { timeout })
      return res.data
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Failed', message)
      return null
    }
  }

  async isbnLookup(isbn: string): Promise<OpenLibraryBookRecord | ProviderError> {
    const lookupData = await this.get<OpenLibraryBookRecord>(`/isbn/${isbn}`)
    if (!lookupData) {
      return { errorCode: 404 }
    }
    return lookupData
  }

  async getWorksData(worksKey: string): Promise<OpenLibraryWorksData> {
    const worksData = await this.get<OpenLibraryWorkResponse>(`${worksKey}.json`)
    if (!worksData) {
      return {
        errorMsg: 'Works Data Request failed',
        errorCode: 500
      }
    }
    if (!worksData.covers) worksData.covers = []
    const coverImages = worksData.covers.filter((c) => c > 0).map((c) => `https://covers.openlibrary.org/b/id/${c}-L.jpg`)
    let description: string | null = null
    if (worksData.description) {
      if (typeof worksData.description === 'string') {
        description = worksData.description
      } else {
        description = worksData.description.value || null
      }
    }
    return {
      id: worksKey.split('/').pop(),
      key: worksKey,
      covers: coverImages,
      first_publish_date: worksData.first_publish_date,
      description: description
    }
  }

  parsePublishYear(doc: OpenLibrarySearchDoc, worksData: OpenLibraryWorksData): string | null {
    if (doc.first_publish_year && !isNaN(Number(doc.first_publish_year))) return String(doc.first_publish_year)
    if (worksData.first_publish_date) {
      const year = worksData.first_publish_date.split('-')[0]
      if (!isNaN(Number(year))) return String(year)
    }
    return null
  }

  async cleanSearchDoc(doc: OpenLibrarySearchDoc): Promise<BookMetadata> {
    const worksData = await this.getWorksData(doc.key)
    return {
      title: doc.title,
      author: doc.author_name ? doc.author_name.join(', ') : null,
      publishedYear: this.parsePublishYear(doc, worksData),
      edition: doc.cover_edition_key,
      cover: doc.cover_edition_key ? `https://covers.openlibrary.org/b/OLID/${doc.cover_edition_key}-L.jpg` : null,
      ...worksData
    }
  }

  async search(query: Record<string, string | number | boolean | Array<string | number>>): Promise<OpenLibrarySearchResult> {
    const queryString = Object.keys(query)
      .map((key) => key + '=' + `${query[key]}`)
      .join('&')
    const lookupData = await this.get<OpenLibrarySearchResponse>(`/search.json?${queryString}`)
    if (!lookupData) {
      return { errorCode: 404 }
    }
    const searchDocs = await Promise.all(lookupData.docs.map((doc) => this.cleanSearchDoc(doc)))
    return searchDocs
  }

  async searchTitle(title: string, timeout = this.#responseTimeout): Promise<OpenLibrarySearchResult> {
    title = encodeURIComponent(title)
    const lookupData = await this.get<OpenLibrarySearchResponse>(`/search.json?title=${title}`, timeout)
    if (!lookupData) {
      return { errorCode: 404 }
    }
    const searchDocs = await Promise.all(lookupData.docs.map((doc) => this.cleanSearchDoc(doc)))
    return searchDocs
  }
}

module.exports = OpenLibrary
