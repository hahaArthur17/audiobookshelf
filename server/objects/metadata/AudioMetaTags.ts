/**
 * The names of the tag fields: every property of the class that starts with 'tag', which is also how toJSON() picks them at runtime.
 * A for...in loop types its key as a plain string, so the three loops in the class assert it back to TagKey; in each of them the keys can only be tag field names.
 */
type TagKey = Extract<keyof AudioMetaTags, `tag${string}`>

/** Tag values by field name. A missing or null entry means the tag is not set. */
type TagValues = Partial<Record<TagKey, string | null>>

/** A position such as a track or disc number, parsed from a tag like "3/10" or "3" */
interface NumberAndTotal {
  number: number | null
  total: number | null
}

/** The tags parseTags() in utils/prober.js reads from ffprobe output. A key is only present when the file has that tag. */
interface ProbeTags {
  file_tag_album?: string | null
  file_tag_albumsort?: string | null
  file_tag_artist?: string | null
  file_tag_artistsort?: string | null
  file_tag_genre?: string | null
  file_tag_title?: string | null
  file_tag_titlesort?: string | null
  file_tag_series?: string | null
  file_tag_seriespart?: string | null
  file_tag_grouping?: string | null
  file_tag_track?: string | null
  file_tag_disc?: string | null
  file_tag_subtitle?: string | null
  file_tag_albumartist?: string | null
  file_tag_date?: string | null
  file_tag_composer?: string | null
  file_tag_publisher?: string | null
  file_tag_comment?: string | null
  file_tag_description?: string | null
  file_tag_encoder?: string | null
  file_tag_encodedby?: string | null
  file_tag_isbn?: string | null
  file_tag_language?: string | null
  file_tag_asin?: string | null
  file_tag_itunesid?: string | null
  file_tag_podcasttype?: string | null
  file_tag_episodetype?: string | null
  file_tag_overdrive_media_marker?: string | null
  file_tag_originalyear?: string | null
  file_tag_releasecountry?: string | null
  file_tag_releasetype?: string | null
  file_tag_releasestatus?: string | null
  file_tag_isrc?: string | null
  file_tag_musicbrainz_trackid?: string | null
  file_tag_musicbrainz_albumid?: string | null
  file_tag_musicbrainz_albumartistid?: string | null
  file_tag_musicbrainz_artistid?: string | null
}

class AudioMetaTags {
  declare tagAlbum: string | null
  declare tagAlbumSort: string | null
  declare tagArtist: string | null
  declare tagArtistSort: string | null
  declare tagGenre: string | null
  declare tagTitle: string | null
  declare tagTitleSort: string | null
  declare tagSeries: string | null
  declare tagSeriesPart: string | null
  declare tagGrouping: string | null
  declare tagTrack: string | null
  declare tagDisc: string | null
  declare tagSubtitle: string | null
  declare tagAlbumArtist: string | null
  declare tagDate: string | null
  declare tagComposer: string | null
  declare tagPublisher: string | null
  declare tagComment: string | null
  declare tagDescription: string | null
  declare tagEncoder: string | null
  declare tagEncodedBy: string | null
  declare tagIsbn: string | null
  declare tagLanguage: string | null
  declare tagASIN: string | null
  declare tagItunesId: string | null
  declare tagPodcastType: string | null
  declare tagEpisodeType: string | null
  declare tagOverdriveMediaMarker: string | null
  declare tagOriginalYear: string | null
  declare tagReleaseCountry: string | null
  declare tagReleaseType: string | null
  declare tagReleaseStatus: string | null
  declare tagISRC: string | null
  declare tagMusicBrainzTrackId: string | null
  declare tagMusicBrainzAlbumId: string | null
  declare tagMusicBrainzAlbumArtistId: string | null
  declare tagMusicBrainzArtistId: string | null

  constructor(metadata?: TagValues) {
    this.tagAlbum = null
    this.tagAlbumSort = null
    this.tagArtist = null
    this.tagArtistSort = null
    this.tagGenre = null
    this.tagTitle = null
    this.tagTitleSort = null
    this.tagSeries = null
    this.tagSeriesPart = null
    this.tagGrouping = null
    this.tagTrack = null
    this.tagDisc = null
    this.tagSubtitle = null
    this.tagAlbumArtist = null
    this.tagDate = null
    this.tagComposer = null
    this.tagPublisher = null
    this.tagComment = null
    this.tagDescription = null
    this.tagEncoder = null
    this.tagEncodedBy = null
    this.tagIsbn = null
    this.tagLanguage = null
    this.tagASIN = null
    this.tagItunesId = null
    this.tagPodcastType = null
    this.tagEpisodeType = null
    this.tagOverdriveMediaMarker = null
    this.tagOriginalYear = null
    this.tagReleaseCountry = null
    this.tagReleaseType = null
    this.tagReleaseStatus = null
    this.tagISRC = null
    this.tagMusicBrainzTrackId = null
    this.tagMusicBrainzAlbumId = null
    this.tagMusicBrainzAlbumArtistId = null
    this.tagMusicBrainzArtistId = null

    if (metadata) {
      this.construct(metadata)
    }
  }

  toJSON(): Partial<Record<TagKey, string>> {
    // Only return the tags that are actually set
    const json: Partial<Record<TagKey, string>> = {}
    for (const key in this) {
      if (key.startsWith('tag') && this[key]) {
        json[key as TagKey] = this[key as TagKey]!
      }
    }
    return json
  }

  get trackNumAndTotal(): NumberAndTotal {
    const data: NumberAndTotal = {
      number: null,
      total: null
    }

    // Track ID3 tag might be "3/10" or just "3"
    if (this.tagTrack) {
      const trackParts = this.tagTrack.split('/').map((part) => Number(part))
      if (trackParts.length > 0) {
        // Fractional track numbers not supported
        data.number = !isNaN(trackParts[0]) ? Math.trunc(trackParts[0]) : null
      }
      if (trackParts.length > 1) {
        data.total = !isNaN(trackParts[1]) ? trackParts[1] : null
      }
    }

    return data
  }

  get discNumAndTotal(): NumberAndTotal {
    const data: NumberAndTotal = {
      number: null,
      total: null
    }

    if (this.tagDisc) {
      const discParts = this.tagDisc.split('/').map((p) => Number(p))
      if (discParts.length > 0) {
        data.number = !isNaN(discParts[0]) ? Math.trunc(discParts[0]) : null
      }
      if (discParts.length > 1) {
        data.total = !isNaN(discParts[1]) ? discParts[1] : null
      }
    }

    return data
  }

  get discNumber() {
    return this.discNumAndTotal.number
  }
  get discTotal() {
    return this.discNumAndTotal.total
  }
  get trackNumber() {
    return this.trackNumAndTotal.number
  }
  get trackTotal() {
    return this.trackNumAndTotal.total
  }

  construct(metadata: TagValues): void {
    this.tagAlbum = metadata.tagAlbum || null
    this.tagAlbumSort = metadata.tagAlbumSort || null
    this.tagArtist = metadata.tagArtist || null
    this.tagArtistSort = metadata.tagArtistSort || null
    this.tagGenre = metadata.tagGenre || null
    this.tagTitle = metadata.tagTitle || null
    this.tagTitleSort = metadata.tagTitleSort || null
    this.tagSeries = metadata.tagSeries || null
    this.tagSeriesPart = metadata.tagSeriesPart || null
    this.tagGrouping = metadata.tagGrouping || null
    this.tagTrack = metadata.tagTrack || null
    this.tagDisc = metadata.tagDisc || null
    this.tagSubtitle = metadata.tagSubtitle || null
    this.tagAlbumArtist = metadata.tagAlbumArtist || null
    this.tagDate = metadata.tagDate || null
    this.tagComposer = metadata.tagComposer || null
    this.tagPublisher = metadata.tagPublisher || null
    this.tagComment = metadata.tagComment || null
    this.tagDescription = metadata.tagDescription || null
    this.tagEncoder = metadata.tagEncoder || null
    this.tagEncodedBy = metadata.tagEncodedBy || null
    this.tagIsbn = metadata.tagIsbn || null
    this.tagLanguage = metadata.tagLanguage || null
    this.tagASIN = metadata.tagASIN || null
    this.tagItunesId = metadata.tagItunesId || null
    this.tagPodcastType = metadata.tagPodcastType || null
    this.tagEpisodeType = metadata.tagEpisodeType || null
    this.tagOverdriveMediaMarker = metadata.tagOverdriveMediaMarker || null
    this.tagOriginalYear = metadata.tagOriginalYear || null
    this.tagReleaseCountry = metadata.tagReleaseCountry || null
    this.tagReleaseType = metadata.tagReleaseType || null
    this.tagReleaseStatus = metadata.tagReleaseStatus || null
    this.tagISRC = metadata.tagISRC || null
    this.tagMusicBrainzTrackId = metadata.tagMusicBrainzTrackId || null
    this.tagMusicBrainzAlbumId = metadata.tagMusicBrainzAlbumId || null
    this.tagMusicBrainzAlbumArtistId = metadata.tagMusicBrainzAlbumArtistId || null
    this.tagMusicBrainzArtistId = metadata.tagMusicBrainzArtistId || null
  }

  // Data parsed in prober.js
  setData(payload: ProbeTags): void {
    this.tagAlbum = payload.file_tag_album || null
    this.tagAlbumSort = payload.file_tag_albumsort || null
    this.tagArtist = payload.file_tag_artist || null
    this.tagArtistSort = payload.file_tag_artistsort || null
    this.tagGenre = payload.file_tag_genre || null
    this.tagTitle = payload.file_tag_title || null
    this.tagTitleSort = payload.file_tag_titlesort || null
    this.tagSeries = payload.file_tag_series || null
    this.tagSeriesPart = payload.file_tag_seriespart || null
    this.tagGrouping = payload.file_tag_grouping || null
    this.tagTrack = payload.file_tag_track || null
    this.tagDisc = payload.file_tag_disc || null
    this.tagSubtitle = payload.file_tag_subtitle || null
    this.tagAlbumArtist = payload.file_tag_albumartist || null
    this.tagDate = payload.file_tag_date || null
    this.tagComposer = payload.file_tag_composer || null
    this.tagPublisher = payload.file_tag_publisher || null
    this.tagComment = payload.file_tag_comment || null
    this.tagDescription = payload.file_tag_description || null
    this.tagEncoder = payload.file_tag_encoder || null
    this.tagEncodedBy = payload.file_tag_encodedby || null
    this.tagIsbn = payload.file_tag_isbn || null
    this.tagLanguage = payload.file_tag_language || null
    this.tagASIN = payload.file_tag_asin || null
    this.tagItunesId = payload.file_tag_itunesid || null
    this.tagPodcastType = payload.file_tag_podcasttype || null
    this.tagEpisodeType = payload.file_tag_episodetype || null
    this.tagOverdriveMediaMarker = payload.file_tag_overdrive_media_marker || null
    this.tagOriginalYear = payload.file_tag_originalyear || null
    this.tagReleaseCountry = payload.file_tag_releasecountry || null
    this.tagReleaseType = payload.file_tag_releasetype || null
    this.tagReleaseStatus = payload.file_tag_releasestatus || null
    this.tagISRC = payload.file_tag_isrc || null
    this.tagMusicBrainzTrackId = payload.file_tag_musicbrainz_trackid || null
    this.tagMusicBrainzAlbumId = payload.file_tag_musicbrainz_albumid || null
    this.tagMusicBrainzAlbumArtistId = payload.file_tag_musicbrainz_albumartistid || null
    this.tagMusicBrainzArtistId = payload.file_tag_musicbrainz_artistid || null
  }

  updateData(payload: ProbeTags): boolean {
    const dataMap: Record<TagKey, string | null> = {
      tagAlbum: payload.file_tag_album || null,
      tagAlbumSort: payload.file_tag_albumsort || null,
      tagArtist: payload.file_tag_artist || null,
      tagArtistSort: payload.file_tag_artistsort || null,
      tagGenre: payload.file_tag_genre || null,
      tagTitle: payload.file_tag_title || null,
      tagTitleSort: payload.file_tag_titlesort || null,
      tagSeries: payload.file_tag_series || null,
      tagSeriesPart: payload.file_tag_seriespart || null,
      tagGrouping: payload.file_tag_grouping || null,
      tagTrack: payload.file_tag_track || null,
      tagDisc: payload.file_tag_disc || null,
      tagSubtitle: payload.file_tag_subtitle || null,
      tagAlbumArtist: payload.file_tag_albumartist || null,
      tagDate: payload.file_tag_date || null,
      tagComposer: payload.file_tag_composer || null,
      tagPublisher: payload.file_tag_publisher || null,
      tagComment: payload.file_tag_comment || null,
      tagDescription: payload.file_tag_description || null,
      tagEncoder: payload.file_tag_encoder || null,
      tagEncodedBy: payload.file_tag_encodedby || null,
      tagIsbn: payload.file_tag_isbn || null,
      tagLanguage: payload.file_tag_language || null,
      tagASIN: payload.file_tag_asin || null,
      tagItunesId: payload.file_tag_itunesid || null,
      tagPodcastType: payload.file_tag_podcasttype || null,
      tagEpisodeType: payload.file_tag_episodetype || null,
      tagOverdriveMediaMarker: payload.file_tag_overdrive_media_marker || null,
      tagOriginalYear: payload.file_tag_originalyear || null,
      tagReleaseCountry: payload.file_tag_releasecountry || null,
      tagReleaseType: payload.file_tag_releasetype || null,
      tagReleaseStatus: payload.file_tag_releasestatus || null,
      tagISRC: payload.file_tag_isrc || null,
      tagMusicBrainzTrackId: payload.file_tag_musicbrainz_trackid || null,
      tagMusicBrainzAlbumId: payload.file_tag_musicbrainz_albumid || null,
      tagMusicBrainzAlbumArtistId: payload.file_tag_musicbrainz_albumartistid || null,
      tagMusicBrainzArtistId: payload.file_tag_musicbrainz_artistid || null
    }

    let hasUpdates = false
    for (const key in dataMap) {
      if (dataMap[key as TagKey] !== this[key as TagKey]) {
        this[key as TagKey] = dataMap[key as TagKey]
        hasUpdates = true
      }
    }
    return hasUpdates
  }

  clone(): AudioMetaTags {
    return new AudioMetaTags(this.toJSON())
  }

  isEqual(audioFileMetadata: AudioMetaTags | null | undefined): boolean {
    if (!audioFileMetadata || !audioFileMetadata.toJSON) return false
    for (const key in audioFileMetadata.toJSON()) {
      if (audioFileMetadata[key as TagKey] !== this[key as TagKey]) return false
    }
    return true
  }
}
export = AudioMetaTags
