const AbMetadataLogger = require('../../Logger')
const parseSeriesString = require('../parsers/parseSeriesString')

type AbMetadataExpectedType = 'string' | 'stringArray' | 'boolean'

interface AbMetadataSeries {
  name: string
  sequence: string | null
}

interface AbMetadataChapter {
  id: number
  start: unknown
  end: unknown
  title: string
}

type AbMetadataValue = string | boolean | string[] | AbMetadataSeries[] | AbMetadataChapter[] | null

interface AbMetadataResult {
  [key: string]: AbMetadataValue | undefined
  title?: string | null
  series?: string[] | AbMetadataSeries[]
  chapters?: AbMetadataChapter[]
}

const mediaTypeKeys: Record<string, Record<string, AbMetadataExpectedType>> = {
  book: {
    tags: 'stringArray',
    title: 'string',
    subtitle: 'string',
    authors: 'stringArray',
    narrators: 'stringArray',
    series: 'stringArray',
    genres: 'stringArray',
    publishedYear: 'string',
    publishedDate: 'string',
    publisher: 'string',
    description: 'string',
    isbn: 'string',
    asin: 'string',
    language: 'string',
    explicit: 'boolean',
    abridged: 'boolean'
  },
  podcast: {
    tags: 'stringArray',
    title: 'string',
    author: 'string',
    description: 'string',
    releaseDate: 'string',
    genres: 'stringArray',
    feedURL: 'string',
    imageURL: 'string',
    itunesPageURL: 'string',
    itunesId: 'string',
    itunesArtistId: 'string',
    asin: 'string',
    language: 'string',
    explicit: 'boolean',
    podcastType: 'string'
  }
}

/**
 * Parse metadata.json text and keep only keys supported for the media type.
 */
function parseJsonMetadataText(text: string, mediaType: string): AbMetadataResult | null {
  try {
    const abmetadataData = JSON.parse(text) as Record<string, unknown>

    // Old metadata.json used nested "metadata"
    if (abmetadataData.metadata) {
      for (const key in abmetadataData.metadata as Record<string, unknown>) {
        if ((abmetadataData.metadata as Record<string, unknown>)[key] === undefined) continue
        let newModelKey = key
        if (key === 'feedUrl') newModelKey = 'feedURL'
        else if (key === 'imageUrl') newModelKey = 'imageURL'
        else if (key === 'itunesPageUrl') newModelKey = 'itunesPageURL'
        else if (key === 'type') newModelKey = 'podcastType'
        abmetadataData[newModelKey] = (abmetadataData.metadata as Record<string, unknown>)[key]
      }
    }
    delete abmetadataData.metadata

    const expectedKeys = mediaTypeKeys[mediaType]
    if (!expectedKeys) {
      AbMetadataLogger.error(`[abmetadataGenerator] Invalid media type "${mediaType}"`)
      return null
    }

    const validated: AbMetadataResult = {}
    for (const key in expectedKeys) {
      const expectedType = expectedKeys[key]
      if (!(key in abmetadataData)) continue

      const validatedValue = validateMetadataValue(key, abmetadataData[key], expectedType)
      if (validatedValue !== undefined) {
        validated[key] = validatedValue
      }
    }

    if (validated.series?.length) {
      validated.series = validated.series.map((series) => parseSeriesString.parse(series)).filter(Boolean) as AbMetadataSeries[]
    }

    if (mediaType === 'book' && 'chapters' in abmetadataData) {
      if (abmetadataData.chapters === null) {
        validated.chapters = []
      } else if (Array.isArray(abmetadataData.chapters)) {
        const cleanedChapters = cleanChaptersArray(abmetadataData.chapters, validated.title ?? abmetadataData.title)
        if (cleanedChapters) {
          validated.chapters = cleanedChapters
        }
      } else {
        AbMetadataLogger.warn(`[abmetadataGenerator] Invalid metadata key "chapters" expected array, got ${typeof abmetadataData.chapters}`)
      }
    }

    return validated
  } catch (error) {
    AbMetadataLogger.error(`[abmetadataGenerator] Invalid metadata.json JSON`, error)
    return null
  }
}
module.exports.parseJson = parseJsonMetadataText

function validateMetadataValue(key: string, value: unknown, expectedType: string): AbMetadataValue | undefined {
  if (expectedType === 'string') {
    if (value === null) return null
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return value
    AbMetadataLogger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string, got ${typeof value}`)
    return undefined
  }

  if (expectedType === 'boolean') {
    if (value === null) return null
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (lower === 'true') return true
      if (lower === 'false') return false
    }
    AbMetadataLogger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected boolean, got ${typeof value}`)
    return undefined
  }

  // Filter empty strings and deduplicate
  if (expectedType === 'stringArray') {
    if (value === null) return []
    if (!Array.isArray(value)) {
      AbMetadataLogger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string array, got ${typeof value}`)
      return undefined
    }

    const cleanedArray = value.filter((item): item is string => typeof item === 'string')
    return [...new Set(cleanedArray.map((item) => item.trim()).filter((item) => item))]
  }

  AbMetadataLogger.warn(`[abmetadataGenerator] Unknown expected type "${expectedType}" for key "${key}"`)
  return undefined
}

function cleanChaptersArray(chaptersArray: unknown[], mediaTitle: unknown): AbMetadataChapter[] | null {
  const chapters: AbMetadataChapter[] = []
  let index = 0
  for (const chapterValue of chaptersArray) {
    const chapter = chapterValue as Record<string, unknown>
    if (chapter.start === null || isNaN(chapter.start as number)) {
      AbMetadataLogger.error(`[abmetadataGenerator] Invalid chapter start time ${chapter.start as string} for "${mediaTitle as string}" metadata file`)
      return null
    }
    if (chapter.end === null || isNaN(chapter.end as number)) {
      AbMetadataLogger.error(`[abmetadataGenerator] Invalid chapter end time ${chapter.end as string} for "${mediaTitle as string}" metadata file`)
      return null
    }
    if (!chapter.title || typeof chapter.title !== 'string') {
      AbMetadataLogger.error(`[abmetadataGenerator] Invalid chapter title ${chapter.title as string} for "${mediaTitle as string}" metadata file`)
      return null
    }

    chapters.push({
      id: index++,
      start: chapter.start,
      end: chapter.end,
      title: chapter.title
    })
  }
  return chapters
}
