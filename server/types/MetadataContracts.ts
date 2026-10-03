/** Shared provider -> finder -> search API shapes. External JSON remains untrusted. */
export interface BookMetadata {
  id?: string | number | null
  artistId?: string | number | null
  title?: string | null
  subtitle?: string | null
  author?: string | null
  narrator?: string | null
  publisher?: string | null
  publishedYear?: string | number | null
  description?: string | null
  descriptionPlain?: string | null
  cover?: string | null
  covers?: string[]
  isbn?: string | null
  asin?: string | null
  edition?: string | null
  key?: string
  first_publish_date?: string
  genres?: string[] | null
  tags?: string[] | null
  series?: Array<{ series: string; sequence?: string }> | null
  language?: string | null
  duration?: number
  region?: string | null
  rating?: number | null
  abridged?: boolean
  explicit?: boolean
  matchConfidence?: number | null
  cleanedTitle?: string
  cleanedAuthor?: string
  titleDistance?: number
  authorDistance?: number
  totalPossibleDistance?: number
  totalDistance?: number
  includesTitle?: string
  includesAuthor?: string
}

export interface ProviderError {
  errorCode: number
  errorMsg?: string
}

export type OpenLibrarySearchResult = BookMetadata[] | ProviderError

export interface AuthorMetadata {
  asin: string
  name: string
  description?: string | null
  image?: string | null
}

export interface PodcastMetadata {
  id?: string | number | null
  artistId?: string | number | null
  title?: string | null
  artistName?: string | null
  description?: string
  descriptionPlain?: string
  releaseDate?: string | null
  genres?: string[]
  cover?: string | null
  trackCount?: number | null
  feedUrl?: string | null
  pageUrl?: string | null
  explicit?: boolean
}

export interface FinderSearchOptions {
  titleDistance?: number
  authorDistance?: number
  maxFuzzySearches?: number
}

export interface ProviderOption {
  value: string
  text: string
}

declare global {
  var MetadataPath: string
}
