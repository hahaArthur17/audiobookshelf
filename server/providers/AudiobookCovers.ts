import axios from 'axios'
import Logger from '../Logger'

interface AudiobookCoverItem {
  versions: {
    png: {
      original: string
    }
  }
}

interface AudiobookCoverResult {
  cover: string
}

class AudiobookCovers {
  #responseTimeout = 10000

  constructor() {}

  /**
   *
   * @param {string} search
   * @param {number} [timeout]
   * @returns {Promise<{cover: string}[]>}
   */
  async search(search: string, timeout = this.#responseTimeout): Promise<AudiobookCoverResult[]> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const url = `https://api.audiobookcovers.com/cover/bytext/`
    const params = new URLSearchParams([['q', search]])
    const items = await axios
      .get<AudiobookCoverItem[]>(url, {
        params,
        timeout
      })
      .then((res) => res?.data || [])
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        Logger.error('[AudiobookCovers] Cover search error', message)
        return []
      })
    return items.map((item) => ({ cover: item.versions.png.original }))
  }
}

module.exports = AudiobookCovers
