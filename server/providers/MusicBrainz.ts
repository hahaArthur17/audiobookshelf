import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import Logger from '../Logger'

const packageJson = require('../../package.json') as { version: string }
const { isNullOrNaN } = require('../utils/index') as { isNullOrNaN(value: number | string | null | undefined): boolean }

interface MusicBrainzSearchOptions {
  artist?: string
  isrc?: string
  title?: string
  album?: string
  limit?: number | string | null
}

interface MusicBrainzRecording {
  [key: string]: unknown
}

interface MusicBrainzSearchResponse {
  recordings?: MusicBrainzRecording[] | null
}

// Keep the legacy third argument at this call site. Axios ignores it, as it did in the JS implementation.
interface MusicBrainzAxiosClient {
  get<T>(url: string, config?: AxiosRequestConfig, ignoredConfig?: AxiosRequestConfig): Promise<AxiosResponse<T>>
}

const axios = require('axios') as MusicBrainzAxiosClient

class MusicBrainz {
  constructor() {}

  get userAgentString(): string {
    return `audiobookshelf/${packageJson.version} (https://audiobookshelf.org)`
  }

  // https://musicbrainz.org/doc/MusicBrainz_API/Search
  searchTrack(options: MusicBrainzSearchOptions): Promise<MusicBrainzRecording[]> | MusicBrainzRecording[] {
    const luceneParts: string[] = []
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
      Logger.error('[MusicBrainz] Invalid search options - must have at least one of artist, isrc, title, album')
      return []
    }

    const query = {
      query: luceneParts.join(' AND '),
      limit: isNullOrNaN(options.limit) ? 15 : Number(options.limit),
      fmt: 'json'
    }
    const config: AxiosRequestConfig = {
      headers: {
        'User-Agent': this.userAgentString
      }
    }
    return axios.get<MusicBrainzSearchResponse>('https://musicbrainz.org/ws/2/recording', { params: query }, config).then((response) => {
      return response.data.recordings || []
    }).catch((error: unknown) => {
      Logger.error('[MusicBrainz] search request error', error)
      return []
    })
  }
}

module.exports = MusicBrainz
