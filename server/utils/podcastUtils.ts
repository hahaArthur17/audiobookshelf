interface RssAttributes {
  url?: string
  href?: string
  type?: string
  title?: string
  start?: string
  text?: string
  [key: string]: string | undefined
}

interface RssTextObject {
  _?: string
  [key: string]: unknown
}

type RssText = string | RssTextObject

interface RssCategory {
  '$'?: RssAttributes
  'itunes:category'?: RssCategory[]
}

interface RssChapter {
  '$'?: RssAttributes
}

interface RssItem extends Record<string, unknown> {
  enclosure?: Array<{ '$'?: RssAttributes }>
  'media:content'?: Array<{ '$'?: RssAttributes }>
  'content:encoded'?: RssText[]
  description?: RssText[]
  pubDate?: RssText[]
  guid?: RssText[]
  'podcast:chapters'?: Array<{ '$'?: RssAttributes }>
  'psc:chapters'?: Array<{ 'psc:chapter'?: RssChapter[] }>
}

interface RssChannel extends Record<string, unknown> {
  image?: { url?: string[] }
  'itunes:image'?: Array<{ '$'?: RssAttributes }>
  'itunes:category'?: RssCategory[]
  'itunes:new-feed-url'?: string[]
  'atom:link'?: Array<{ '$'?: RssAttributes }>
  description?: RssText[]
  item?: RssItem[]
}

interface RssDocument { channel?: RssChannel[] }
interface RssJson { rss?: RssDocument }

interface PodcastMetadata extends Record<string, unknown> {
  image: string | null
  categories: string[]
  feedUrl: string | null
  description: string | null
  descriptionPlain: string | null
  type: string | null
}

interface PodcastChapter { id: number; title: string; start: number; end: number }
interface ChapterStart { id: number; title: string; start: number }
interface PodcastEpisode extends Record<string, unknown> {
  enclosure: RssAttributes & { url: string }
  title?: string
  subtitle?: string
  description?: string
  descriptionPlain?: string
  pubDate?: string
  episodeType?: string
  season?: string
  episode?: string
  author?: string
  duration?: string
  durationSeconds?: number | null
  explicit?: string
  guid?: string | null
  chaptersUrl?: string | null
  chaptersType?: string | null
  chapters?: PodcastChapter[]
}

interface PodcastFeed { metadata: PodcastMetadata; episodes?: PodcastEpisode[]; numEpisodes?: number }
interface PodcastPayload { podcast: PodcastFeed; rawJson?: RssJson }
interface PodcastExports {
  parsePodcastRssFeedXml(xml: string, excludeEpisodeMetadata?: boolean, includeRaw?: boolean): Promise<PodcastPayload | null>
  getPodcastFeed(feedUrl: string, excludeEpisodeMetadata?: boolean): Promise<PodcastFeed | null>
  findMatchingEpisodes(feedUrl: string, searchTitle: string): Promise<Array<{ episode: PodcastEpisode }> | null>
  findMatchingEpisodesInFeed(feed: PodcastFeed | null, searchTitle: string, threshold?: number): Array<{ episode: PodcastEpisode }> | null
}

interface AxiosPodcastResponse { headers?: Record<string, string>; data: Buffer | string }
interface AxiosPodcastError extends Error {
  code?: string
  cause: { code?: string }
  request: { _options: { protocol?: string; href?: string } }
}

const axios = require('axios') as (options: Record<string, unknown>) => Promise<AxiosPodcastResponse>
const ssrfFilter = require('ssrf-req-filter') as (url: string) => unknown
const PodcastLogger = require('../Logger') as { debug(...args: unknown[]): void; info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
const { xmlToJSON, timestampToSeconds } = require('./index') as { xmlToJSON(xml: string): Promise<RssJson>; timestampToSeconds(value: string): number | null }
const htmlSanitizer = require('../utils/htmlSanitizer') as { sanitize(value: string): string; stripAllTags(value: string): string }
const Fuse = require('../libs/fusejs') as new (items: PodcastEpisode[], options: Record<string, unknown>) => { search(value: string): Array<{ item: PodcastEpisode }> }
const podcastLexicalExports = module.exports as PodcastExports

/**
 * @typedef RssPodcastChapter
 * @property {number} id
 * @property {string} title
 * @property {number} start
 * @property {number} end
 */

/**
 * @typedef RssPodcastEpisode
 * @property {string} title
 * @property {string} subtitle
 * @property {string} description
 * @property {string} descriptionPlain
 * @property {string} pubDate
 * @property {string} episodeType
 * @property {string} season
 * @property {string} episode
 * @property {string} author
 * @property {string} duration
 * @property {number|null} durationSeconds - Parsed from duration string if duration is valid
 * @property {string} explicit
 * @property {number} publishedAt - Unix timestamp
 * @property {{ url: string, type?: string, length?: string }} enclosure
 * @property {string} guid
 * @property {string} chaptersUrl
 * @property {string} chaptersType
 * @property {RssPodcastChapter[]} chapters
 */

/**
 * @typedef RssPodcastMetadata
 * @property {string} title
 * @property {string} language
 * @property {string} explicit
 * @property {string} author
 * @property {string} pubDate
 * @property {string} link
 * @property {string} image
 * @property {string[]} categories
 * @property {string} feedUrl
 * @property {string} description
 * @property {string} descriptionPlain
 * @property {string} type
 */

/**
 * @typedef RssPodcast
 * @property {RssPodcastMetadata} metadata
 * @property {RssPodcastEpisode[]} episodes
 * @property {number} numEpisodes
 */

function extractFirstArrayItem<T = RssText>(json: Record<string, unknown>, key: string): T | null {
  if (!(json[key] as { length: number } | null | undefined)?.length) return null
  return (json[key] as { [index: number]: T })[0]
}

function extractStringOrStringify(json: Record<string, unknown>): string {
  try {
    if (typeof (json[Object.keys(json)[0]] as Array<unknown> | undefined)?.[0] === 'string') {
      return (json[Object.keys(json)[0]] as string[])[0]
    }
    // Handles case where html was included without being wrapped in CDATA
    return JSON.stringify(json)
  } catch {
    return ''
  }
}

function extractFirstArrayItemString(json: Record<string, unknown>, key: string): string {
  const item = extractFirstArrayItem(json, key)
  if (!item) return ''
  if (typeof item === 'object') {
    if (item?.['_'] && typeof item['_'] === 'string') return item['_']

    return extractStringOrStringify(item)
  }
  return typeof item === 'string' ? item : ''
}

function extractImage(channel: RssChannel): string | null {
  if (!channel.image || !channel.image.url || !channel.image.url.length) {
    if (!channel['itunes:image'] || !channel['itunes:image'].length || !channel['itunes:image'][0]['$']) {
      return null
    }
    var itunesImage = channel['itunes:image'][0]['$']
    return itunesImage.href || null
  }
  return channel.image.url[0] || null
}

function extractCategories(channel: RssChannel | RssCategory): string[] {
  if (!channel['itunes:category'] || !channel['itunes:category'].length) return []
  var categories = channel['itunes:category']
  var cleanedCats: string[] = []
  categories.forEach((cat) => {
    if (!cat['$'] || !cat['$'].text) return
    var cattext = cat['$'].text
    if (cat['itunes:category']) {
      var subcats = extractCategories(cat)
      if (subcats.length) {
        cleanedCats = cleanedCats.concat(subcats.map((subcat) => `${cattext}:${subcat}`))
      } else {
        cleanedCats.push(cattext)
      }
    } else {
      cleanedCats.push(cattext)
    }
  })
  return cleanedCats
}

function extractPodcastMetadata(channel: RssChannel): PodcastMetadata {
  const metadata: PodcastMetadata = {
    image: extractImage(channel),
    categories: extractCategories(channel),
    feedUrl: null,
    description: null,
    descriptionPlain: null,
    type: null
  }

  if (channel['itunes:new-feed-url']) {
    metadata.feedUrl = extractFirstArrayItem<string>(channel, 'itunes:new-feed-url')
  } else if (channel['atom:link'] && channel['atom:link'].length && channel['atom:link'][0]['$']) {
    metadata.feedUrl = channel['atom:link'][0]['$'].href || null
  }

  if (channel['description']) {
    const rawDescription = extractFirstArrayItemString(channel, 'description')
    metadata.description = htmlSanitizer.sanitize(rawDescription.trim())
    metadata.descriptionPlain = htmlSanitizer.stripAllTags(rawDescription.trim())
  }

  const arrayFields = ['title', 'language', 'itunes:explicit', 'itunes:author', 'pubDate', 'link', 'itunes:type']
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop() as string
    let value = extractFirstArrayItem(channel, key)
    if ((value as RssTextObject)?.['_']) value = (value as RssTextObject)['_']!
    metadata[cleanKey] = value
  })
  return metadata
}

function extractEpisodeData(item: RssItem): PodcastEpisode | null {
  // Episode must have url
  let enclosure: PodcastEpisode['enclosure']

  if (item.enclosure?.[0]?.['$']?.url) {
    enclosure = item.enclosure[0]['$'] as PodcastEpisode['enclosure']
  } else if (item['media:content']?.find((c) => c?.['$']?.url && (c?.['$']?.type ?? '').startsWith('audio'))) {
    enclosure = item['media:content'].find((c) => (c['$']?.type ?? '').startsWith('audio'))!['$'] as PodcastEpisode['enclosure']
  } else {
    PodcastLogger.error(`[podcastUtils] Invalid podcast episode data`)
    return null
  }

  const episode: PodcastEpisode = {
    enclosure: enclosure
  }

  episode.enclosure.url = episode.enclosure.url.trim()

  // Full description with html
  if (item['content:encoded']) {
    const rawDescription = (extractFirstArrayItemString(item, 'content:encoded') || '').trim()
    episode.description = htmlSanitizer.sanitize(rawDescription)
  }

  // Extract chapters
  if (item['podcast:chapters']?.[0]?.['$']?.url) {
    episode.chaptersUrl = item['podcast:chapters'][0]['$'].url
    episode.chaptersType = item['podcast:chapters'][0]['$'].type || 'application/json'
  }

  // Supposed to be the plaintext description but not always followed
  if (item['description']) {
    const rawDescription = extractFirstArrayItemString(item, 'description')

    if (!episode.description) episode.description = htmlSanitizer.sanitize(rawDescription.trim())
    episode.descriptionPlain = htmlSanitizer.stripAllTags(rawDescription.trim())
  }

  if (item['pubDate']) {
    const pubDate = extractFirstArrayItem(item, 'pubDate')
    if (typeof pubDate === 'string') {
      episode.pubDate = pubDate
    } else if (typeof pubDate?._ === 'string') {
      episode.pubDate = pubDate._
    } else {
      PodcastLogger.error(`[podcastUtils] Invalid pubDate ${item['pubDate']} for ${episode.enclosure.url}`)
    }
  }

  if (item['guid']) {
    const guidItem = extractFirstArrayItem(item, 'guid')
    if (typeof guidItem === 'string') {
      episode.guid = guidItem
    } else if (typeof guidItem?._ === 'string') {
      episode.guid = guidItem._
    } else {
      PodcastLogger.error(`[podcastUtils] Invalid guid for ${episode.enclosure.url}`, item['guid'])
    }
  }

  const arrayFields = ['title', 'itunes:episodeType', 'itunes:season', 'itunes:episode', 'itunes:author', 'itunes:duration', 'itunes:explicit', 'itunes:subtitle']
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop() as string
    episode[cleanKey] = extractFirstArrayItemString(item, key)
  })

  if (episode.subtitle) {
    episode.subtitle = htmlSanitizer.sanitize(episode.subtitle.trim())
  }

  // Extract psc:chapters if duration is set
  episode.durationSeconds = episode.duration ? timestampToSeconds(episode.duration) : null

  if (item['psc:chapters']?.[0]?.['psc:chapter']?.length && episode.durationSeconds) {
    // Example chapter:
    // {"id":0,"start":0,"end":43.004286,"title":"chapter 1"}

    const cleanedChapters = item['psc:chapters'][0]['psc:chapter'].map((chapter, index) => {
      if (!chapter['$']?.title || !chapter['$']?.start || typeof chapter['$']?.start !== 'string' || typeof chapter['$']?.title !== 'string') {
        return null
      }

      const start = timestampToSeconds(chapter['$'].start)
      if (start === null) {
        return null
      }

      return {
        id: index,
        title: chapter['$'].title,
        start
      }
    })

    if (cleanedChapters.some((chapter) => !chapter)) {
      PodcastLogger.warn(`[podcastUtils] Invalid chapter data for ${episode.enclosure.url}`)
    } else {
      episode.chapters = (cleanedChapters as ChapterStart[]).map((chapter, index) => {
        const nextChapter = cleanedChapters[index + 1]
        const end = nextChapter ? nextChapter.start : episode.durationSeconds as number
        return {
          id: chapter.id,
          title: chapter.title,
          start: chapter.start,
          end
        }
      })
    }
  }

  return episode
}

function cleanEpisodeData(data: PodcastEpisode): PodcastEpisode {
  const pubJsDate = data.pubDate ? new Date(data.pubDate) : null
  const publishedAt = pubJsDate && !isNaN(pubJsDate as Date & number) ? pubJsDate.valueOf() : null

  return {
    title: data.title,
    subtitle: data.subtitle || '',
    description: data.description || '',
    descriptionPlain: data.descriptionPlain || '',
    pubDate: data.pubDate || '',
    episodeType: data.episodeType || '',
    season: data.season || '',
    episode: data.episode || '',
    author: data.author || '',
    duration: data.duration || '',
    durationSeconds: data.durationSeconds || null,
    explicit: data.explicit || '',
    publishedAt,
    enclosure: data.enclosure,
    guid: data.guid || null,
    chaptersUrl: data.chaptersUrl || null,
    chaptersType: data.chaptersType || null,
    chapters: data.chapters || []
  }
}

function extractPodcastEpisodes(items: RssItem[]): PodcastEpisode[] {
  const episodes: PodcastEpisode[] = []
  items.forEach((item) => {
    const extracted = extractEpisodeData(item)
    if (extracted) {
      episodes.push(cleanEpisodeData(extracted))
    }
  })
  return episodes
}

function cleanPodcastJson(rssJson: RssDocument, excludeEpisodeMetadata: boolean): PodcastFeed | null {
  if (!rssJson.channel?.length) {
    PodcastLogger.error(`[podcastUtil] Invalid podcast no channel object`)
    return null
  }
  const channel = rssJson.channel[0]
  if (!channel.item?.length) {
    PodcastLogger.error(`[podcastUtil] Invalid podcast no episodes`)
    return null
  }
  const podcast: PodcastFeed = {
    metadata: extractPodcastMetadata(channel)
  }
  if (!excludeEpisodeMetadata) {
    podcast.episodes = extractPodcastEpisodes(channel.item)
  } else {
    podcast.numEpisodes = channel.item.length
  }
  return podcast
}

module.exports.parsePodcastRssFeedXml = async (xml: string, excludeEpisodeMetadata = false, includeRaw = false): Promise<PodcastPayload | null> => {
  if (!xml) return null
  const json = await xmlToJSON(xml)
  if (!json?.rss) {
    PodcastLogger.error('[podcastUtils] Invalid XML or RSS feed')
    return null
  }

  const podcast = cleanPodcastJson(json.rss, excludeEpisodeMetadata)
  if (!podcast) return null

  if (includeRaw) {
    return {
      podcast,
      rawJson: json
    }
  } else {
    return {
      podcast
    }
  }
}

/**
 * Get podcast RSS feed as JSON
 * Uses SSRF filter to prevent internal URLs
 *
 * @param {string} feedUrl
 * @param {boolean} [excludeEpisodeMetadata=false]
 * @returns {Promise<RssPodcast|null>}
 */
module.exports.getPodcastFeed = (feedUrl: string, excludeEpisodeMetadata = false): Promise<PodcastFeed | null> => {
  PodcastLogger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}"`)

  let userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS)'
  // Workaround for CBC RSS feeds rejecting our user agent string
  // See: https://github.com/advplyr/audiobookshelf/issues/3322
  if (feedUrl.startsWith('https://www.cbc.ca')) {
    userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS) - CBC'
  }

  return axios({
    url: feedUrl,
    method: 'GET',
    timeout: (global as typeof global & { PodcastDownloadTimeout: number }).PodcastDownloadTimeout,
    responseType: 'arraybuffer',
    headers: {
      Accept: 'application/rss+xml, application/xhtml+xml, application/xml, */*;q=0.8',
      'Accept-Encoding': 'gzip, compress, deflate',
      'User-Agent': userAgent
    },
    httpAgent: (global as typeof global & { DisableSsrfRequestFilter?: (url: string) => boolean }).DisableSsrfRequestFilter?.(feedUrl) ? null : ssrfFilter(feedUrl),
    httpsAgent: (global as typeof global & { DisableSsrfRequestFilter?: (url: string) => boolean }).DisableSsrfRequestFilter?.(feedUrl) ? null : ssrfFilter(feedUrl)
  })
    .then(async (data) => {
      // Adding support for ios-8859-1 encoded RSS feeds.
      //  See: https://github.com/advplyr/audiobookshelf/issues/1489
      const contentType = data.headers?.['content-type'] || '' // e.g. text/xml; charset=iso-8859-1
      if (contentType.toLowerCase().includes('iso-8859-1')) {
        data.data = data.data.toString('latin1')
      } else {
        data.data = data.data.toString()
      }

      if (!data?.data) {
        PodcastLogger.error(`[podcastUtils] getPodcastFeed: Invalid podcast feed request response (${feedUrl})`)
        return null
      }
      PodcastLogger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}" success - parsing xml`)
      const payload = await podcastLexicalExports.parsePodcastRssFeedXml(data.data, excludeEpisodeMetadata)
      if (!payload) {
        return null
      }

      // RSS feed may be a private RSS feed
      payload.podcast.metadata.feedUrl = feedUrl

      return payload.podcast
    })
    .catch((error: AxiosPodcastError) => {
      // Check for failures due to redirecting from http to https. If original url was http, upgrade to https and try again
      if (error.code === 'ERR_FR_REDIRECTION_FAILURE' && error.cause.code === 'ERR_INVALID_PROTOCOL') {
        if (feedUrl.startsWith('http://') && error.request._options.protocol === 'https:') {
          PodcastLogger.info('Redirection from http to https detected. Upgrading Request', error.request._options.href)
          feedUrl = feedUrl.replace('http://', 'https://')
          return podcastLexicalExports.getPodcastFeed(feedUrl, excludeEpisodeMetadata)
        }
      }
      PodcastLogger.error('[podcastUtils] getPodcastFeed Error', error)
      return null
    })
}

// Return array of episodes ordered by closest match using fuse.js
module.exports.findMatchingEpisodes = async (feedUrl: string, searchTitle: string): Promise<Array<{ episode: PodcastEpisode }> | null> => {
  const feed = await podcastLexicalExports.getPodcastFeed(feedUrl).catch(() => {
    return null
  })

  return podcastLexicalExports.findMatchingEpisodesInFeed(feed, searchTitle)
}

/**
 *
 * @param {RssPodcast} feed
 * @param {string} searchTitle
 * @param {number} [threshold=0.4] - 0.0 for perfect match, 1.0 for match anything
 * @returns {Array<{ episode: RssPodcastEpisode }>}
 */
module.exports.findMatchingEpisodesInFeed = (feed: PodcastFeed | null, searchTitle: string, threshold = 0.4): Array<{ episode: PodcastEpisode }> | null => {
  if (!feed?.episodes) {
    return null
  }

  const fuseOptions = {
    ignoreDiacritics: true,
    threshold,
    keys: [
      { name: 'title', weight: 0.7 }, // prefer match in title
      { name: 'subtitle', weight: 0.3 }
    ]
  }
  const fuse = new Fuse(feed.episodes, fuseOptions)

  const matches: Array<{ episode: PodcastEpisode }> = []
  fuse.search(searchTitle).forEach((match) => {
    matches.push({
      episode: match.item
    })
  })
  return matches
}
