const Logger = require('../Logger')
import type { PodcastMetadata } from '../types/MetadataContracts'

const iTunes = require('../providers/iTunes') as {
  new (): {
    searchPodcasts(term: string, options?: { country?: string }): Promise<PodcastMetadata[]>
  }
}

class PodcastFinder {
  iTunesApi: InstanceType<typeof iTunes>

  constructor() {
    this.iTunesApi = new iTunes()
  }

  /**
   *
   * @param {string} term
   * @param {{country:string}} options
   * @returns {Promise<import('../providers/iTunes').iTunesPodcastSearchResult[]>}
   */
  async search(term: string, options: { country?: string } = {}): Promise<PodcastMetadata[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast with term "${term}"`)
    const results = await this.iTunesApi.searchPodcasts(term, options)
    Logger.debug(`[iTunes] Podcast search for "${term}" returned ${results.length} results`)
    return results
  }

  /**
   * @param {string} term
   * @returns {Promise<string[]>}
   */
  async findCovers(term: string): Promise<string[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast covers with term "${term}"`)
    const results = await this.iTunesApi.searchPodcasts(term)
    if (!results) return []
    return results.map((r) => r.cover).filter((cover): cover is string => Boolean(cover))
  }
}
export = new PodcastFinder()
