import axios from 'axios'
import Logger from '../Logger'
import htmlSanitizer from '../utils/htmlSanitizer'
import type { BookMetadata } from '../types/MetadataContracts'

interface iTunesSearchParams {
  term: string
  country?: string
  media?: string
  entity?: string
  lang?: string
  limit?: number
}

interface iTunesPodcastOptions {
  country?: string
}

interface iTunesSearchResult {
  collectionId?: string | number
  artistId?: string | number | null
  collectionName?: string
  artistName?: string
  description?: string | null
  releaseDate?: string | null
  genres?: string[] | null
  collectionViewUrl?: string | null
  trackCount?: number | null
  feedUrl?: string | null
  trackExplicitness?: string
  primaryGenreName?: string
  artworkUrl600?: string
  [key: string]: unknown
}

interface iTunesSearchResponse {
  results?: iTunesSearchResult[] | null
}

/** Cleaned podcast result shape returned to existing CommonJS consumers. */
export interface iTunesPodcastSearchResult {
  id?: string | number
  artistId?: string | number | null
  title?: string
  artistName?: string
  description: string
  descriptionPlain: string
  releaseDate?: string | null
  genres: string[]
  cover: string | null
  trackCount?: number | null
  feedUrl?: string | null
  pageUrl?: string | null
  explicit: boolean
}

class iTunes {
  #responseTimeout = 10000

  constructor() {}

  /**
   * @see https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html
   */
  search(options: iTunesSearchParams, timeout = this.#responseTimeout): Promise<iTunesSearchResult[]> | iTunesSearchResult[] {
    if (!options.term) {
      Logger.error('[iTunes] Invalid search options - no term')
      return []
    }
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const query = {
      term: options.term,
      media: options.media,
      entity: options.entity,
      lang: options.lang,
      limit: options.limit,
      country: options.country
    }
    return axios
      .get<iTunesSearchResponse>('https://itunes.apple.com/search', {
        params: query,
        timeout
      })
      .then((response) => {
        return response.data.results || []
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        Logger.error('[iTunes] search request error', message)
        return []
      })
  }

  // Example cover art URL sizes can be changed to request a larger image.
  getCoverArtwork(data: iTunesSearchResult): string | null {
    if (data.artworkUrl600) {
      return data.artworkUrl600
    }
    // Should already be sorted from small to large.
    const artworkSizes = Object.keys(data)
      .filter((key) => key.startsWith('artworkUrl'))
      .map((key) => ({
        url: data[key] as string,
        size: Number(key.replace('artworkUrl', ''))
      }))
    if (!artworkSizes.length) return null

    // Return next biggest size above 600.
    const nextBestSize = artworkSizes.find((size) => size.size > 600)
    if (nextBestSize) return nextBestSize.url

    // Find square artwork.
    const squareArtwork = artworkSizes.find((size) => size.url.includes(`${size.size}x${size.size}bb`))

    // Square cover replace with 600x600bb.
    if (squareArtwork) {
      return squareArtwork.url.replace(`${squareArtwork.size}x${squareArtwork.size}bb`, '600x600bb')
    }

    // Last resort: return the biggest size.
    return artworkSizes[artworkSizes.length - 1].url
  }

  cleanAudiobook(data: iTunesSearchResult): BookMetadata {
    // artistName can be "Name1, Name2 & Name3", so refactor it to "Name1, Name2, Name3".
    const author = (data.artistName || '').split(' & ').join(', ')

    return {
      id: data.collectionId,
      artistId: data.artistId,
      title: data.collectionName,
      author,
      description: data.description || null,
      publishedYear: data.releaseDate ? data.releaseDate.split('-')[0] : null,
      genres: data.primaryGenreName ? [data.primaryGenreName] : null,
      cover: this.getCoverArtwork(data)
    }
  }

  searchAudiobooks(term: string, timeout = this.#responseTimeout): Promise<BookMetadata[]> {
    return (this.search({ term, entity: 'audiobook', media: 'audiobook' }, timeout) as Promise<iTunesSearchResult[]>).then((results) => {
      return results.map(this.cleanAudiobook.bind(this))
    })
  }

  cleanPodcast(data: iTunesSearchResult): iTunesPodcastSearchResult {
    return {
      id: data.collectionId,
      artistId: data.artistId || null,
      title: data.collectionName,
      artistName: data.artistName,
      description: htmlSanitizer.sanitize(data.description || ''),
      descriptionPlain: htmlSanitizer.stripAllTags(data.description || ''),
      releaseDate: data.releaseDate,
      genres: data.genres || [],
      cover: this.getCoverArtwork(data),
      trackCount: data.trackCount,
      feedUrl: data.feedUrl,
      pageUrl: data.collectionViewUrl,
      explicit: data.trackExplicitness === 'explicit'
    }
  }

  searchPodcasts(term: string, options: iTunesPodcastOptions = {}, timeout = this.#responseTimeout): Promise<iTunesPodcastSearchResult[]> {
    return (this.search({ term, entity: 'podcast', media: 'podcast', ...options }, timeout) as Promise<iTunesSearchResult[]>).then((results) => {
      return results.map(this.cleanPodcast.bind(this))
    })
  }
}

module.exports = iTunes
