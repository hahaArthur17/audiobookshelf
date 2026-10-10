interface ProbeRecord {
  [key: string]: unknown
}

interface ProbeStream extends ProbeRecord {
  index?: unknown
  codec_type?: unknown
  codec_name?: unknown
  codec_long_name?: unknown
  codec_time_base?: unknown
  time_base?: unknown
  bit_rate?: unknown
  tags?: ProbeRecord | null
  disposition?: { default?: unknown } | null
  profile?: unknown
  is_avc?: unknown
  pix_fmt?: unknown
  avg_frame_rate?: unknown
  r_frame_rate?: unknown
  width?: unknown
  height?: unknown
  color_range?: unknown
  color_space?: unknown
  color_transfer?: unknown
  color_primaries?: unknown
  channels?: unknown
  sample_rate?: unknown
  channel_layout?: unknown
}

interface ProbeFormat extends ProbeRecord {
  format_long_name?: unknown
  name?: unknown
  size?: unknown
  duration?: unknown
  bit_rate?: unknown
  tags?: ProbeRecord | null
}

interface ProbeChapter extends ProbeRecord {
  'TAG:title'?: unknown
  title?: unknown
  tags?: { title?: unknown } | null
  time_base?: unknown
  start_time?: unknown
  start?: unknown
  end_time?: unknown
  end?: unknown
}

interface RawProbeData {
  format: ProbeFormat
  streams: ProbeStream[]
  chapters?: unknown
  error?: { string: unknown }
}

interface ParsedChapter {
  start: number
  end: number
  title: string
  id?: number
}

interface ParsedStreamInfo extends ProbeRecord {
  index: unknown
  type: unknown
  codec: unknown
  codec_long: unknown
  codec_time_base: unknown
  time_base: unknown
  bit_rate: number | null
  language: string | null
  title: string | null
  tags?: ProbeRecord
  is_default?: boolean
  profile?: unknown
  is_avc?: boolean
  pix_fmt?: unknown
  frame_rate?: number | null
  width?: number | null
  height?: number | null
  color_range?: unknown
  color_space?: unknown
  color_transfer?: unknown
  color_primaries?: unknown
  channels?: unknown
  sample_rate?: number | null
  channel_layout?: string | null
}

interface ParsedProbeData {
  format: unknown
  duration: number | null
  size: number | null
  sizeMb: number | null
  bit_rate: number | null
  tags: Record<string, string | null>
  rawTags?: ProbeRecord
  video_stream?: ParsedStreamInfo
  audio_stream?: ParsedStreamInfo | null
  chapters?: ParsedChapter[]
}

interface FfprobeFunction {
  (filepath: string): Promise<unknown>
  FFPROBE_PATH?: string
}

interface MediaProbeDataInstance {
  setData(data: ParsedProbeData): void
}

interface MediaProbeDataConstructor {
  new (): MediaProbeDataInstance
}

const ffprobe: FfprobeFunction = require('../libs/nodeFfprobe')
const MediaProbeData: MediaProbeDataConstructor = require('../scanner/MediaProbeData')

const ProberLogger = require('../Logger')

function tryGrabBitRate(stream: ProbeStream, all_streams: ProbeStream[], total_bit_rate: number | null): number | null {
  if (!isNaN(stream.bit_rate as number) && stream.bit_rate) {
    return Number(stream.bit_rate)
  }
  if (!stream.tags) {
    return null
  }

  // Attempt to get bitrate from bps tags
  const bps = stream.tags.BPS || stream.tags['BPS-eng'] || stream.tags['BPS_eng']
  if (bps && !isNaN(bps as number)) {
    return Number(bps)
  }

  const tagDuration = stream.tags.DURATION || stream.tags['DURATION-eng'] || stream.tags['DURATION_eng']
  const tagBytes = stream.tags.NUMBER_OF_BYTES || stream.tags['NUMBER_OF_BYTES-eng'] || stream.tags['NUMBER_OF_BYTES_eng']
  if (tagDuration && tagBytes && !isNaN(tagDuration as number) && !isNaN(tagBytes as number)) {
    const calculatedBps = Math.floor((Number(tagBytes) * 8) / Number(tagDuration))
    if (calculatedBps && !isNaN(calculatedBps)) {
      return calculatedBps
    }
  }

  if (total_bit_rate && stream.codec_type === 'video') {
    let estimated_bit_rate = total_bit_rate
    all_streams.forEach((stream) => {
      if (stream.bit_rate && !isNaN(stream.bit_rate as number)) {
        estimated_bit_rate -= Number(stream.bit_rate)
      }
    })
    if (!all_streams.find((s) => s.codec_type === 'audio' && s.bit_rate && Number(s.bit_rate) > estimated_bit_rate)) {
      return estimated_bit_rate
    } else {
      return total_bit_rate
    }
  } else if (stream.codec_type === 'audio') {
    return 112000
  } else {
    return 0
  }
}

function tryGrabFrameRate(stream: ProbeStream): number | null {
  let avgFrameRate: unknown = stream.avg_frame_rate || stream.r_frame_rate
  if (!avgFrameRate) return null
  const parts = (avgFrameRate as string).split('/')
  if (parts.length === 2) {
    avgFrameRate = Number(parts[0]) / Number(parts[1])
  } else {
    avgFrameRate = Number(parts[0])
  }
  if (!isNaN(avgFrameRate as number)) return avgFrameRate as number
  return null
}

function tryGrabSampleRate(stream: ProbeStream): number | null {
  const sample_rate = stream.sample_rate
  if (!isNaN(sample_rate as number)) return Number(sample_rate)
  return null
}

function tryGrabChannelLayout(stream: ProbeStream): string | null {
  const layout = stream.channel_layout
  if (!layout) return null
  return String(layout).split('(').shift() as string
}

function tryGrabTags(stream: ProbeStream, ...tags: string[]): string | null {
  if (!stream.tags) return null
  for (let i = 0; i < tags.length; i++) {
    const tagKey = Object.keys(stream.tags).find((t) => t.toLowerCase() === tags[i].toLowerCase())
    const value = stream.tags[tagKey as string]
    if (value && (value as string).trim()) return (value as string).trim()
  }
  return null
}

function parseMediaStreamInfo(stream: ProbeStream, all_streams: ProbeStream[], total_bit_rate: number | null): ParsedStreamInfo {
  const info: ParsedStreamInfo = {
    index: stream.index,
    type: stream.codec_type,
    codec: stream.codec_name || null,
    codec_long: stream.codec_long_name || null,
    codec_time_base: stream.codec_time_base || null,
    time_base: stream.time_base || null,
    bit_rate: tryGrabBitRate(stream, all_streams, total_bit_rate),
    language: tryGrabTags(stream, 'language'),
    title: tryGrabTags(stream, 'title')
  }
  if (stream.tags) info.tags = stream.tags

  if (info.type === 'audio' || info.type === 'subtitle') {
    const disposition = stream.disposition || {}
    info.is_default = disposition.default === 1 || disposition.default === '1'
  }

  if (info.type === 'video') {
    info.profile = stream.profile || null
    info.is_avc = stream.is_avc !== '0' && stream.is_avc !== 'false'
    info.pix_fmt = stream.pix_fmt || null
    info.frame_rate = tryGrabFrameRate(stream)
    info.width = !isNaN(stream.width as number) ? Number(stream.width) : null
    info.height = !isNaN(stream.height as number) ? Number(stream.height) : null
    info.color_range = stream.color_range || null
    info.color_space = stream.color_space || null
    info.color_transfer = stream.color_transfer || null
    info.color_primaries = stream.color_primaries || null
  } else if (stream.codec_type === 'audio') {
    info.channels = stream.channels || null
    info.sample_rate = tryGrabSampleRate(stream)
    info.channel_layout = tryGrabChannelLayout(stream)
  }

  return info
}

function isNullOrNaN(val: unknown): boolean {
  return val === null || isNaN(val as number)
}

/* Example chapter object
 * {
      "id": 71,
      "time_base": "1/1000",
      "start": 80792671,
      "start_time": "80792.671000",
      "end": 81084755,
      "end_time": "81084.755000",
      "tags": {
          "title": "072"
      }
 * }
 */
function parseChapters(_chapters: unknown): ParsedChapter[] {
  if (!_chapters) return []

  return (_chapters as ProbeChapter[])
    .map<ParsedChapter>((chap) => {
      let title = (chap['TAG:title'] || chap.title || '') as string
      if (!title && chap.tags?.title) title = chap.tags.title as string
      title = title.trim()

      const timebase = (chap.time_base as string | null | undefined)?.includes('/') ? Number((chap.time_base as string).split('/')[1]) : 1
      const start = !isNullOrNaN(chap.start_time) ? Number(chap.start_time) : !isNullOrNaN(chap.start) ? Number(chap.start) / timebase : 0
      const end = !isNullOrNaN(chap.end_time) ? Number(chap.end_time) : !isNullOrNaN(chap.end) ? Number(chap.end) / timebase : 0
      return {
        start,
        end,
        title
      }
    })
    .sort((a, b) => a.start - b.start)
    .map((chap, index) => {
      chap.id = index
      return chap
    })
}

function parseTags(format: ProbeFormat | ProbeStream, verbose: boolean): Record<string, string | null> {
  if (!format.tags) {
    return {}
  }
  if (verbose) {
    ProberLogger.debug('Tags', format.tags)
  }

  const tags: Record<string, string | null> = {
    file_tag_encoder: tryGrabTags(format, 'encoder', 'tsse', 'tss'),
    file_tag_encodedby: tryGrabTags(format, 'encoded_by', 'tenc', 'ten'),
    file_tag_title: tryGrabTags(format, 'title', 'tit2', 'tt2'),
    file_tag_titlesort: tryGrabTags(format, 'title-sort', 'tsot'),
    file_tag_subtitle: tryGrabTags(format, 'subtitle', 'tit3', 'tt3'),
    file_tag_track: tryGrabTags(format, 'track', 'trck', 'trk'),
    file_tag_disc: tryGrabTags(format, 'discnumber', 'disc', 'disk', 'tpos', 'tpa'),
    file_tag_album: tryGrabTags(format, 'album', 'talb', 'tal'),
    file_tag_albumsort: tryGrabTags(format, 'album-sort', 'tsoa'),
    file_tag_artist: tryGrabTags(format, 'artist', 'tpe1', 'tp1'),
    file_tag_artistsort: tryGrabTags(format, 'artist-sort', 'tsop'),
    file_tag_albumartist: tryGrabTags(format, 'albumartist', 'album_artist', 'tpe2'),
    file_tag_date: tryGrabTags(format, 'date', 'tyer', 'tye'),
    file_tag_composer: tryGrabTags(format, 'composer', 'tcom', 'tcm'),
    file_tag_publisher: tryGrabTags(format, 'publisher', 'tpub', 'tpb'),
    file_tag_comment: tryGrabTags(format, 'comment', 'comm', 'com'),
    file_tag_description: tryGrabTags(format, 'description', 'desc'),
    file_tag_genre: tryGrabTags(format, 'genre', 'tcon', 'tco'),
    file_tag_series: tryGrabTags(format, 'series', 'show', 'mvnm'),
    file_tag_seriespart: tryGrabTags(format, 'series-part', 'episode_id', 'mvin', 'part'),
    file_tag_grouping: tryGrabTags(format, 'grouping', 'grp1'),
    file_tag_isbn: tryGrabTags(format, 'isbn'), // custom
    file_tag_language: tryGrabTags(format, 'language', 'lang'),
    file_tag_asin: tryGrabTags(format, 'asin', 'audible_asin'), // custom
    file_tag_itunesid: tryGrabTags(format, 'itunes-id'), // custom
    file_tag_podcasttype: tryGrabTags(format, 'podcast-type'), // custom
    file_tag_episodetype: tryGrabTags(format, 'episode-type'), // custom
    file_tag_originalyear: tryGrabTags(format, 'originalyear'),
    file_tag_releasecountry: tryGrabTags(format, 'MusicBrainz Album Release Country', 'releasecountry'),
    file_tag_releasestatus: tryGrabTags(format, 'MusicBrainz Album Status', 'releasestatus', 'musicbrainz_albumstatus'),
    file_tag_releasetype: tryGrabTags(format, 'MusicBrainz Album Type', 'releasetype', 'musicbrainz_albumtype'),
    file_tag_isrc: tryGrabTags(format, 'tsrc', 'isrc'),
    file_tag_musicbrainz_trackid: tryGrabTags(format, 'MusicBrainz Release Track Id', 'musicbrainz_releasetrackid'),
    file_tag_musicbrainz_albumid: tryGrabTags(format, 'MusicBrainz Album Id', 'musicbrainz_albumid'),
    file_tag_musicbrainz_albumartistid: tryGrabTags(format, 'MusicBrainz Album Artist Id', 'musicbrainz_albumartistid'),
    file_tag_musicbrainz_artistid: tryGrabTags(format, 'MusicBrainz Artist Id', 'musicbrainz_artistid'),

    // Not sure if these are actually used yet or not
    file_tag_creation_time: tryGrabTags(format, 'creation_time'),
    file_tag_wwwaudiofile: tryGrabTags(format, 'wwwaudiofile', 'woaf', 'waf'),
    file_tag_contentgroup: tryGrabTags(format, 'contentgroup', 'tit1', 'tt1'),
    file_tag_releasetime: tryGrabTags(format, 'releasetime', 'tdrl'),
    file_tag_movementname: tryGrabTags(format, 'movementname', 'mvnm'),
    file_tag_movement: tryGrabTags(format, 'movement', 'mvin'),
    file_tag_genre1: tryGrabTags(format, 'tmp_genre1', 'genre1'),
    file_tag_genre2: tryGrabTags(format, 'tmp_genre2', 'genre2'),
    file_tag_overdrive_media_marker: tryGrabTags(format, 'OverDrive MediaMarkers')
  }
  for (const key in tags) {
    if (!tags[key]) {
      delete tags[key]
    }
  }

  return tags
}

function getDefaultAudioStream(audioStreams: ParsedStreamInfo[] | null | undefined): ParsedStreamInfo | null {
  if (!audioStreams || !audioStreams.length) return null
  if (audioStreams.length === 1) return audioStreams[0]
  const defaultStream = audioStreams.find((a) => a.is_default)
  if (!defaultStream) return audioStreams[0]
  return defaultStream
}

function parseProbeData(data: RawProbeData, verbose = false): ParsedProbeData | null {
  try {
    const { format, streams, chapters } = data

    const sizeBytes = !isNaN(format.size as number) ? Number(format.size) : null
    const sizeMb = sizeBytes !== null ? Number((sizeBytes / (1024 * 1024)).toFixed(2)) : null

    let cleanedData: ParsedProbeData = {
      format: format.format_long_name || format.name || 'Unknown',
      duration: !isNaN(format.duration as number) ? Number(format.duration) : null,
      size: sizeBytes,
      sizeMb,
      bit_rate: !isNaN(format.bit_rate as number) ? Number(format.bit_rate) : null,
      tags: parseTags(format, verbose)
    }
    if (verbose && format.tags) {
      cleanedData.rawTags = format.tags
    }

    const cleaned_streams = streams.map((s) => parseMediaStreamInfo(s, streams, cleanedData.bit_rate))
    cleanedData.video_stream = cleaned_streams.find((s) => s.type === 'video')
    const audioStreams = cleaned_streams.filter((s) => s.type === 'audio')
    cleanedData.audio_stream = getDefaultAudioStream(audioStreams)

    if (cleanedData.audio_stream && cleanedData.video_stream) {
      const videoBitrate = cleanedData.video_stream.bit_rate
      // If audio stream bitrate larger then video, most likely incorrect
      if ((cleanedData.audio_stream.bit_rate as number) > (videoBitrate as number)) {
        cleanedData.video_stream.bit_rate = cleanedData.bit_rate
      }
    }

    // If format does not have tags, check audio stream (https://github.com/advplyr/audiobookshelf/issues/256)
    if (!format.tags && cleanedData.audio_stream && cleanedData.audio_stream.tags) {
      cleanedData = {
        ...cleanedData,
        tags: parseTags(cleanedData.audio_stream, verbose)
      }
    }

    cleanedData.chapters = parseChapters(chapters)

    return cleanedData
  } catch (error) {
    console.error('Parse failed', error)
    return null
  }
}

/**
 * Run ffprobe on audio filepath
 * @param {string} filepath
 * @param {boolean} [verbose=false]
 * @returns {import('../scanner/MediaProbeData')|{error:string}}
 */
function probe(filepath: string, verbose = false): Promise<MediaProbeDataInstance | { error: unknown }> {
  if (process.env.FFPROBE_PATH) {
    ffprobe.FFPROBE_PATH = process.env.FFPROBE_PATH
  }

  return (ffprobe(filepath) as Promise<RawProbeData>)
    .then((raw) => {
      if (raw.error) {
        return {
          error: raw.error.string
        }
      }

      const rawProbeData = parseProbeData(raw, verbose)
      if (!rawProbeData || (!rawProbeData.audio_stream && !rawProbeData.video_stream)) {
        return {
          error: rawProbeData ? 'Invalid media file: no audio or video streams found' : 'Probe Failed'
        }
      } else {
        const probeData = new MediaProbeData()
        probeData.setData(rawProbeData)
        return probeData
      }
    })
    .catch((err) => {
      return {
        error: err
      }
    })
}
module.exports.probe = probe

/**
 * Ffprobe for audio file path
 *
 * @param {string} filepath
 * @returns {Object} ffprobe json output
 */
function rawProbe(filepath: string): Promise<unknown> {
  if (process.env.FFPROBE_PATH) {
    ffprobe.FFPROBE_PATH = process.env.FFPROBE_PATH
  }

  return ffprobe(filepath).catch((err) => {
    return {
      error: err
    }
  })
}
module.exports.rawProbe = rawProbe
