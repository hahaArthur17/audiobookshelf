import axiosModule = require('axios')
// axios.get takes (url, config). searchTrack() passes a third argument, which axios ignores (bug log); this annotation describes that call so it compiles unchanged.
const axios: { get(url: string, config?: object, ignored?: object): Promise<{ data: { recordings?: unknown[] } }> } = axiosModule.default
import packageJson = require('../../package.json')
import Logger = require('../Logger')
import utils = require('../utils/index')
const { isNullOrNaN } = utils

/** Search options of searchTrack() (only the fields read here) */
interface MusicBrainzSearchOptions {
  artist?: string
  isrc?: string
  title?: string
  album?: string
  limit?: number | string | null
}

class MusicBrainz {
  constructor() { }

  get userAgentString(): string {
    return `audiobookshelf/${packageJson.version} (https://audiobookshelf.org)`
  }

  // https://musicbrainz.org/doc/MusicBrainz_API/Search
  searchTrack(options: MusicBrainzSearchOptions): unknown[] | Promise<unknown[]> {
    let luceneParts: string[] = []
    if (options.artist) {
      luceneParts.push(`artist:${options.artist}`)
    }
    if (options.isrc) {
      luceneParts.push(`isrc:${options.isrc}`)
    }
    if (options.title) {
      luceneParts.push(`recording:${options.title}`)
    }
    if (options.album) {
      luceneParts.push(`release:${options.album}`)
    }
    if (!luceneParts.length) {
      Logger.error(`[MusicBrainz] Invalid search options - must have at least one of artist, isrc, title, album`)
      return []
    }

    const query = {
      query: luceneParts.join(' AND '),
      limit: isNullOrNaN(options.limit) ? 15 : Number(options.limit),
      fmt: 'json'
    }
    const config = {
      headers: {
        'User-Agent': this.userAgentString
      }
    }
    return axios.get('https://musicbrainz.org/ws/2/recording', { params: query }, config).then((response) => {
      return response.data.recordings || []
    }).catch((error: Error) => {
      Logger.error(`[MusicBrainz] search request error`, error)
      return []
    })
  }
}
export = MusicBrainz