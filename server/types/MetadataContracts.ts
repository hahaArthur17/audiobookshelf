/** Metadata crossing the provider -> finder -> controller boundary.
 * External responses are not validated uniformly. Fields are optional where
 * the existing providers can omit them; consumers must narrow before use.
 */
export interface BookMetadata {
  id?: string | number
  title?: string
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

export type BookProviderResult = BookMetadata[] | ProviderError

export interface AuthorMetadata {
  asin: string
  name: string
  description?: string
  image?: string | null
}

export interface PodcastMetadata {
  id?: string | number
  artistId?: string | number | null
  title?: string
  artistName?: string
  description?: string
  descriptionPlain?: string
  releaseDate?: string
  genres?: string[]
  cover?: string | null
  trackCount?: number
  feedUrl?: string
  pageUrl?: string
  explicit?: boolean
}

export interface FinderSearchOptions {
  titleDistance?: number
  authorDistance?: number
  maxFuzzySearches?: number
}
