import type { PodcastMetadata } from '../types/MetadataContracts'

const Logger = require('../Logger')
const iTunes = require('../providers/iTunes')

interface PodcastSearchOptions {
  country?: string
}

class PodcastFinder {
  private iTunesApi: InstanceType<typeof iTunes>

  constructor() {
    this.iTunesApi = new iTunes()
  }

  async search(term: string, options: PodcastSearchOptions = {}): Promise<PodcastMetadata[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast with term "${term}"`)
    const results: PodcastMetadata[] = await this.iTunesApi.searchPodcasts(term, options)
    Logger.debug(`[iTunes] Podcast search for "${term}" returned ${results.length} results`)
    return results
  }

  async findCovers(term: string): Promise<string[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast covers with term "${term}"`)
    const results: PodcastMetadata[] = await this.iTunesApi.searchPodcasts(term)
    if (!results) return []
    return results
      .map((result) => result.cover)
      .filter((cover): cover is string => Boolean(cover))
  }
}

module.exports = new PodcastFinder()
