import axios from 'axios'
import Logger from '../Logger'
import type { BookMetadata } from '../types/MetadataContracts'

interface GoogleBooksIdentifier {
  type?: string
  identifier?: string
}

interface GoogleBooksVolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  publisher?: string
  publisherDate?: string
  description?: string
  industryIdentifiers?: GoogleBooksIdentifier[]
  categories?: string[]
  imageLinks?: Record<string, string | undefined>
}

interface GoogleBooksItem {
  id?: string
  volumeInfo?: GoogleBooksVolumeInfo
}

interface GoogleBooksSearchResponse {
  items?: GoogleBooksItem[]
}

class GoogleBooks {
  #responseTimeout = 10000

  constructor() {}

  extractIsbn(industryIdentifiers?: GoogleBooksIdentifier[] | null): string | null {
    if (!industryIdentifiers || !industryIdentifiers.length) return null

    const isbnObj = industryIdentifiers.find((identifier) => identifier.type === 'ISBN_13') || industryIdentifiers.find((identifier) => identifier.type === 'ISBN_10')
    if (isbnObj && isbnObj.identifier) return isbnObj.identifier
    return null
  }

  cleanResult(item: GoogleBooksItem): BookMetadata | null {
    const { id, volumeInfo } = item
    if (!volumeInfo) return null
    const { title, subtitle, authors, publisher, publisherDate, description, industryIdentifiers, categories, imageLinks } = volumeInfo

    let cover: string | null = null
    // Selects the largest cover assuming the largest is the last key in the object
    if (imageLinks && Object.keys(imageLinks).length) {
      const largestCoverKey = Object.keys(imageLinks).pop()
      const largestCover = largestCoverKey === undefined ? undefined : imageLinks[largestCoverKey]
      cover = largestCover?.replace(/^http:/, 'https:') || null
    }

    return {
      id,
      title,
      subtitle: subtitle || null,
      author: authors ? authors.join(', ') : null,
      publisher,
      publishedYear: publisherDate ? publisherDate.split('-')[0] : null,
      description,
      cover,
      genres: categories && Array.isArray(categories) ? [...categories] : null,
      isbn: this.extractIsbn(industryIdentifiers)
    }
  }

  /**
   * Search for a book by title and author
   * @param {string} title
   * @param {string} author
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object[]>}
   **/
  async search(title: string, author: string, timeout = this.#responseTimeout): Promise<Array<BookMetadata | null>> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    title = encodeURIComponent(title)
    let queryString = `q=intitle:${title}`
    if (author) {
      author = encodeURIComponent(author)
      queryString += `+inauthor:${author}`
    }
    const url = `https://www.googleapis.com/books/v1/volumes?${queryString}`
    Logger.debug(`[GoogleBooks] Search url: ${url}`)
    const items = await axios
      .get<GoogleBooksSearchResponse>(url, {
        timeout
      })
      .then((res) => {
        if (!res || !res.data || !res.data.items) return []
        return res.data.items
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        Logger.error('[GoogleBooks] Volume search error', message)
        return []
      })
    return items.map((item) => this.cleanResult(item))
  }
}

module.exports = GoogleBooks
