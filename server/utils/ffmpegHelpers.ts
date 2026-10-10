interface FfmpegHelpersCommand {
  addOption(...options: Array<string | string[]>): this
  addOutput(path: string): this
  input(path: string): this
  inputOptions(options: string[]): this
  output(path: string): this
  outputOptions(...options: Array<string | string[]>): this
  run(): void
  on(event: 'start', listener: (command: string) => void): this
  on(event: 'error', listener: (error: Error, stdout?: string, stderr?: string) => void): this
  on(event: 'end', listener: (stdout?: string, stderr?: string) => void): this
  on(event: 'stderr', listener: (line: unknown) => void): this
  on(event: 'progress', listener: (progress: FfmpegHelpersProgress) => void): this
}

interface FfmpegHelpersProgress {
  targetSize?: unknown
  percent?: unknown
  timemark?: unknown
}

interface FfmpegHelpersLogger {
  debug(...values: unknown[]): void
  error(...values: unknown[]): void
  info(...values: unknown[]): void
  warn(...values: unknown[]): void
}

interface FfmpegHelpersFileSystem {
  ensureDir(path: string): Promise<unknown>
  writeFile(path: string, content: string): Promise<unknown>
  remove(path: string): Promise<unknown>
}

interface FfmpegHelpersAxiosConfig {
  url: string
  method: string
  responseType: string
  headers: Record<string, string>
  timeout?: number
  httpAgent: unknown
  httpsAgent: unknown
}

interface FfmpegHelpersAxiosResponse {
  data: unknown
}

interface FfmpegHelpersPodcastMedia {
  title: unknown
  author: unknown
  genres: { length: number; join(separator: string): string }
  language: unknown
  itunesId: unknown
  podcastType: unknown
}

interface FfmpegHelpersPodcastEpisode {
  description: unknown
  subtitle: unknown
  season: unknown
  episode: unknown
  title: unknown
  pubDate: unknown
  episodeType: unknown
  enclosure?: { length?: unknown } | null
}

interface FfmpegHelpersPodcastEpisodeDownload {
  url: string
  targetPath: string
  pubYear: unknown
  libraryItem: { media: FfmpegHelpersPodcastMedia }
  rssPodcastEpisode: FfmpegHelpersPodcastEpisode
}

interface FfmpegHelpersTrack {
  duration: number
  index: number
  metadata: { path: string; ext: string }
}

interface FfmpegHelpersChapter {
  start: unknown
  end: unknown
  title?: unknown
}

interface FfmpegHelpersLibraryItem {
  media: {
    title: unknown
    authorName: unknown
    subtitle?: unknown
    genres?: string[] | null
    publishedYear?: unknown
    description?: unknown
    narrators?: string[] | null
    publisher?: unknown
    series?: Array<{ name: string; bookSeries: { sequence?: unknown } }> | null
  }
}

interface FfmpegHelpersEncodingOptions {
  bitrate?: string | number | null
  codec?: string | null
  channels?: string | number | null
}

interface FfmpegHelpersFileUtils {
  filePathToPOSIX(path: string): string
  copyToExisting(source: string, destination: string): Promise<void>
}

interface FfmpegHelpersAxios {
  (config: FfmpegHelpersAxiosConfig): Promise<FfmpegHelpersAxiosResponse>
}

type FfmpegHelpersFactory = (source?: unknown) => FfmpegHelpersCommand
type FfmpegHelpersSsrfFilter = (url: string) => unknown
type FfmpegHelpersPath = typeof import('path')
type FfmpegHelpersFfmetadataUtils = { timemarkToSeconds(timemark: string): number }
type FfmpegHelpersGlobal = typeof global & {
  PodcastDownloadTimeout?: number
  DisableSsrfRequestFilter?: (url: string) => boolean
}

const FfmpegHelpersAxiosModule: FfmpegHelpersAxios = require('axios')
const FfmpegHelpersSsrfFilter: FfmpegHelpersSsrfFilter = require('ssrf-req-filter')
const FfmpegHelpersFfmpeg: FfmpegHelpersFactory = require('../libs/fluentFfmpeg')
const FfmpegHelpersFfmpegUtils: FfmpegHelpersFfmetadataUtils = require('../libs/fluentFfmpeg/utils')
const FfmpegHelpersFs: FfmpegHelpersFileSystem = require('../libs/fsExtra')
const FfmpegHelpersPath: FfmpegHelpersPath = require('path')
const FfmpegHelpersLogger: FfmpegHelpersLogger = require('../Logger')
const {
  filePathToPOSIX: ffmpegHelpersFilePathToPOSIX,
  copyToExisting: ffmpegHelpersCopyToExisting
}: FfmpegHelpersFileUtils = require('./fileUtils')

function escapeSingleQuotes(path: string): string {
  // A ' within a quoted string is escaped with '\'' in ffmpeg (see https://www.ffmpeg.org/ffmpeg-utils.html#Quoting-and-escaping)
  return ffmpegHelpersFilePathToPOSIX(path).replace(/'/g, "'\\''")
}

// Returns first track start time
// startTime is for streams starting an encode part-way through an audiobook
async function writeConcatFile(tracks: FfmpegHelpersTrack[], outputPath: string, startTime = 0): Promise<number | null> {
  var trackToStartWithIndex = 0
  var firstTrackStartTime = 0

  // Find first track greater than startTime
  if (startTime > 0) {
    var currTrackEnd = 0
    var startingTrack = tracks.find((t) => {
      currTrackEnd += t.duration
      return startTime < currTrackEnd
    })
    if (startingTrack) {
      firstTrackStartTime = currTrackEnd - startingTrack.duration
      trackToStartWithIndex = startingTrack.index
    }
  }

  var tracksToInclude = tracks.filter((t) => t.index >= trackToStartWithIndex)
  var trackPaths = tracksToInclude.map((t) => {
    var line = "file '" + escapeSingleQuotes(t.metadata.path) + "'\n" + `duration ${t.duration}`
    return line
  })
  var inputstr = trackPaths.join('\n\n')

  try {
    await FfmpegHelpersFs.writeFile(outputPath, inputstr)
    return firstTrackStartTime
  } catch (error) {
    FfmpegHelpersLogger.error(`[ffmpegHelpers] Failed to write stream concat file at "${outputPath}"`, error)
    return null
  }
}
module.exports.writeConcatFile = writeConcatFile

async function extractCoverArt(filepath: string, outputpath: string): Promise<string | false> {
  var dirname = FfmpegHelpersPath.dirname(outputpath)
  await FfmpegHelpersFs.ensureDir(dirname)

  return new Promise<string | false>((resolve) => {
    /** @type {import('../libs/fluentFfmpeg/index').FfmpegCommand} */
    var ffmpeg = FfmpegHelpersFfmpeg(filepath)
    ffmpeg.addOption(['-map 0:v:0', '-frames:v 1'])
    ffmpeg.output(outputpath)

    ffmpeg.on('start', (cmd) => {
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] Extract Cover Cmd: ${cmd}`)
    })
    ffmpeg.on('error', (err, stdout, stderr) => {
      FfmpegHelpersLogger.error(`[FfmpegHelpers] Extract Cover Error ${err}`)
      resolve(false)
    })
    ffmpeg.on('end', () => {
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] Cover Art Extracted Successfully`)
      resolve(outputpath)
    })
    ffmpeg.run()
  })
}
module.exports.extractCoverArt = extractCoverArt

//This should convert based on the output file extension as well
async function resizeImage(filePath: string, outputPath: string, width: number | null | undefined, height: number | null | undefined): Promise<string | false> {
  return new Promise<string | false>((resolve) => {
    /** @type {import('../libs/fluentFfmpeg/index').FfmpegCommand} */
    var ffmpeg = FfmpegHelpersFfmpeg(filePath)
    ffmpeg.addOption(['-vf', `scale=${width || -1}:${height || -1}`])
    ffmpeg.addOutput(outputPath)
    ffmpeg.on('start', (cmd) => {
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] Resize Image Cmd: ${cmd}`)
    })
    ffmpeg.on('error', (err, stdout, stderr) => {
      FfmpegHelpersLogger.error(`[FfmpegHelpers] Resize Image Error ${err} ${stdout} ${stderr}`)
      resolve(false)
    })
    ffmpeg.on('end', () => {
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] Image resized Successfully`)
      resolve(outputPath)
    })
    ffmpeg.run()
  })
}
module.exports.resizeImage = resizeImage

/**
 * Download podcast episode
 * Uses SSRF filter to prevent internal URLs
 *
 * @param {import('../objects/PodcastEpisodeDownload')} podcastEpisodeDownload
 * @returns {Promise<{success: boolean, isRequestError?: boolean}>}
 */
module.exports.downloadPodcastEpisode = (podcastEpisodeDownload: FfmpegHelpersPodcastEpisodeDownload): Promise<{ success: boolean; isRequestError?: boolean }> => {
  return new Promise<{ success: boolean; isRequestError?: boolean }>(async (resolve) => {
    // Some podcasts fail due to user agent strings
    // See: https://github.com/advplyr/audiobookshelf/issues/3246 (requires iTMS user agent)
    // See: https://github.com/advplyr/audiobookshelf/issues/4401 (requires no iTMS user agent)
    const userAgents = ['audiobookshelf (+https://audiobookshelf.org; like iTMS)', 'audiobookshelf (+https://audiobookshelf.org)']

    let response = null
    let lastError = null

    for (const userAgent of userAgents) {
      try {
        response = await FfmpegHelpersAxiosModule({
          url: podcastEpisodeDownload.url,
          method: 'GET',
          responseType: 'stream',
          headers: {
            Accept: '*/*',
            'User-Agent': userAgent
          },
          timeout: (global as FfmpegHelpersGlobal).PodcastDownloadTimeout,
          httpAgent: (global as FfmpegHelpersGlobal).DisableSsrfRequestFilter?.(podcastEpisodeDownload.url) ? null : FfmpegHelpersSsrfFilter(podcastEpisodeDownload.url),
          httpsAgent: (global as FfmpegHelpersGlobal).DisableSsrfRequestFilter?.(podcastEpisodeDownload.url) ? null : FfmpegHelpersSsrfFilter(podcastEpisodeDownload.url)
        })

        FfmpegHelpersLogger.debug(`[ffmpegHelpers] Successfully connected with User-Agent: ${userAgent}`)
        break
      } catch (error) {
        lastError = error
        FfmpegHelpersLogger.warn(`[ffmpegHelpers] Failed to download podcast episode with User-Agent "${userAgent}" for url "${podcastEpisodeDownload.url}"`, (error as { message: string }).message)

        // If this is the last attempt, log the full error
        if (userAgent === userAgents[userAgents.length - 1]) {
          FfmpegHelpersLogger.error(`[ffmpegHelpers] All User-Agent attempts failed for url "${podcastEpisodeDownload.url}"`, lastError)
        }
      }
    }

    if (!response) {
      return resolve({
        success: false,
        isRequestError: true
      })
    }

    /** @type {import('../libs/fluentFfmpeg/index').FfmpegCommand} */
    const ffmpeg = FfmpegHelpersFfmpeg(response.data)
    ffmpeg.addOption('-loglevel debug') // Debug logs printed on error
    ffmpeg.outputOptions('-c:a', 'copy', '-map', '0:a', '-metadata', 'podcast=1')

    /** @type {import('../models/Podcast')} */
    const podcast = podcastEpisodeDownload.libraryItem.media
    const podcastEpisode = podcastEpisodeDownload.rssPodcastEpisode
    const finalSizeInBytes = Number(podcastEpisode.enclosure?.length || 0)

    const taggings: Record<string, unknown> = {
      album: podcast.title,
      'album-sort': podcast.title,
      artist: podcast.author,
      'artist-sort': podcast.author,
      comment: podcastEpisode.description,
      subtitle: podcastEpisode.subtitle,
      disc: podcastEpisode.season,
      genre: podcast.genres.length ? podcast.genres.join(';') : null,
      language: podcast.language,
      MVNM: podcast.title,
      MVIN: podcastEpisode.episode,
      track: podcastEpisode.episode,
      'series-part': podcastEpisode.episode,
      title: podcastEpisode.title,
      'title-sort': podcastEpisode.title,
      year: podcastEpisodeDownload.pubYear,
      date: podcastEpisode.pubDate,
      releasedate: podcastEpisode.pubDate,
      'itunes-id': podcast.itunesId,
      'podcast-type': podcast.podcastType,
      'episode-type': podcastEpisode.episodeType
    }

    for (const tag in taggings) {
      if (taggings[tag]) {
        if ((taggings[tag] as { length: number }).length > 10000) {
          FfmpegHelpersLogger.warn(`[ffmpegHelpers] Episode download tag "${tag}" is too long (${(taggings[tag] as { length: number }).length} characters) - trimming it down`)
          taggings[tag] = (taggings[tag] as { slice(start: number, end: number): unknown }).slice(0, 10000)
        }
        ffmpeg.addOption('-metadata', `${tag}=${taggings[tag]}`)
      }
    }

    ffmpeg.addOutput(podcastEpisodeDownload.targetPath)

    const stderrLines: string[] = []
    ffmpeg.on('stderr', (stderrLine) => {
      if (typeof stderrLine === 'string') {
        stderrLines.push(stderrLine)
      }
    })
    ffmpeg.on('start', (cmd) => {
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] downloadPodcastEpisode: Cmd: ${cmd}`)
    })
    ffmpeg.on('error', (err) => {
      FfmpegHelpersLogger.error(`[FfmpegHelpers] downloadPodcastEpisode: Error ${err}`)
      if (stderrLines.length) {
        FfmpegHelpersLogger.error(`Full stderr dump for episode url "${podcastEpisodeDownload.url}": ${stderrLines.join('\n')}`)
      }
      resolve({
        success: false
      })
    })
    ffmpeg.on('progress', (progress) => {
      let progressPercent = 0
      if (finalSizeInBytes && progress.targetSize && !isNaN(progress.targetSize as number)) {
        const finalSizeInKb = Math.floor(finalSizeInBytes / 1000)
        progressPercent = Math.min(1, (progress.targetSize as number) / finalSizeInKb) * 100
      }
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] downloadPodcastEpisode: Progress estimate ${progressPercent.toFixed(0)}% (${progress?.targetSize || 'N/A'} KB) for "${podcastEpisodeDownload.url}"`)
    })
    ffmpeg.on('end', () => {
      FfmpegHelpersLogger.debug(`[FfmpegHelpers] downloadPodcastEpisode: Complete`)
      resolve({
        success: true
      })
    })
    ffmpeg.run()
  })
}

/**
 * Generates ffmetadata file content from the provided metadata object and chapters array.
 * @param {Object} metadata - The input metadata object.
 * @param {Array|null} chapters - An array of chapter objects.
 * @returns {string} - The ffmetadata file content.
 */
function generateFFMetadata(metadata: Record<string, unknown>, chapters: FfmpegHelpersChapter[] | null | undefined): string {
  let ffmetadataContent = ';FFMETADATA1\n'

  // Add global metadata
  for (const key in metadata) {
    if (metadata[key]) {
      ffmetadataContent += `${key}=${escapeFFMetadataValue(metadata[key] as string)}\n`
    }
  }

  // Add chapters
  if (chapters) {
    chapters.forEach((chapter) => {
      ffmetadataContent += '\n[CHAPTER]\n'
      ffmetadataContent += `TIMEBASE=1/1000\n`
      ffmetadataContent += `START=${Math.floor((chapter.start as number) * 1000)}\n`
      ffmetadataContent += `END=${Math.floor((chapter.end as number) * 1000)}\n`
      if (chapter.title) {
        ffmetadataContent += `title=${escapeFFMetadataValue(chapter.title as string)}\n`
      }
    })
  }

  return ffmetadataContent
}

module.exports.generateFFMetadata = generateFFMetadata

/**
 * Writes FFmpeg metadata file with the given metadata and chapters.
 *
 * @param {Object} metadata - The metadata object.
 * @param {Array} chapters - The array of chapter objects.
 * @param {string} ffmetadataPath - The path to the FFmpeg metadata file.
 * @returns {Promise<boolean>} - A promise that resolves to true if the file was written successfully, false otherwise.
 */
async function writeFFMetadataFile(metadata: Record<string, unknown>, chapters: FfmpegHelpersChapter[] | null | undefined, ffmetadataPath: string): Promise<boolean> {
  try {
    await FfmpegHelpersFs.writeFile(ffmetadataPath, generateFFMetadata(metadata, chapters))
    FfmpegHelpersLogger.debug(`[ffmpegHelpers] Wrote ${ffmetadataPath}`)
    return true
  } catch (error) {
    FfmpegHelpersLogger.error(`[ffmpegHelpers] Write ${ffmetadataPath} failed`, error)
    return false
  }
}

module.exports.writeFFMetadataFile = writeFFMetadataFile

/**
 * Adds an ffmetadata and optionally a cover image to an audio file using fluent-ffmpeg.
 *
 * @param {string} audioFilePath - Path to the input audio file.
 * @param {string|null} coverFilePath - Path to the cover image file.
 * @param {string} metadataFilePath - Path to the ffmetadata file.
 * @param {number} track - The track number to embed in the audio file.
 * @param {string} mimeType - The MIME type of the audio file.
 * @param {function(number): void|null} progressCB - A callback function to report progress.
 * @param {import('../libs/fluentFfmpeg/index').FfmpegCommand} ffmpeg - The Ffmpeg instance to use (optional). Used for dependency injection in tests.
 * @param {function(string, string): Promise<void>} copyFunc - The function to use for copying files (optional). Used for dependency injection in tests.
 * @returns {Promise<void>} A promise that resolves if the operation is successful, rejects otherwise.
 */
async function addCoverAndMetadataToFile(
  audioFilePath: string,
  coverFilePath: string | null,
  metadataFilePath: string,
  track: number,
  mimeType: string,
  progressCB: ((percent: number) => void) | null = null,
  ffmpeg: FfmpegHelpersCommand = FfmpegHelpersFfmpeg(),
  copyFunc: (source: string, destination: string) => Promise<void> = ffmpegHelpersCopyToExisting
): Promise<void> {
  const isMp4 = mimeType === 'audio/mp4'
  const isMp3 = mimeType === 'audio/mpeg'

  const audioFileDir = FfmpegHelpersPath.dirname(audioFilePath)
  const audioFileExt = FfmpegHelpersPath.extname(audioFilePath)
  const audioFileBaseName = FfmpegHelpersPath.basename(audioFilePath, audioFileExt)
  const tempFilePath = ffmpegHelpersFilePathToPOSIX(FfmpegHelpersPath.join(audioFileDir, `${audioFileBaseName}.tmp${audioFileExt}`))

  return new Promise((resolve, reject) => {
    ffmpeg.input(audioFilePath).input(metadataFilePath).outputOptions([
      '-map 0:a', // map audio stream from input file
      '-map_metadata 1', // map metadata tags from metadata file first
      '-map_metadata 0', // add additional metadata tags from input file
      '-map_chapters 1', // map chapters from metadata file
      '-c copy' // copy streams
    ])

    if (track && !isNaN(track)) {
      ffmpeg.outputOptions(['-metadata track=' + track])
    }

    if (isMp4) {
      ffmpeg.outputOptions([
        '-f mp4' // force output format to mp4
      ])
    } else if (isMp3) {
      ffmpeg.outputOptions([
        '-id3v2_version 3' // set ID3v2 version to 3
      ])
    }

    if (coverFilePath) {
      ffmpeg.input(coverFilePath).outputOptions([
        '-map 2:v', // map video stream from cover image file
        '-disposition:v:0 attached_pic', // set cover image as attached picture
        '-metadata:s:v',
        'title=Cover', // add title metadata to cover image stream
        '-metadata:s:v',
        'comment=Cover' // add comment metadata to cover image stream
      ])
      const ext = FfmpegHelpersPath.extname(coverFilePath).toLowerCase()
      if (ext === '.webp') {
        ffmpeg.outputOptions([
          '-c:v mjpeg' // convert webp images to jpeg
        ])
      }
    } else {
      ffmpeg.outputOptions([
        '-map 0:v?' // retain video stream from input file if exists
      ])
    }

    ffmpeg
      .output(tempFilePath)
      .on('start', (commandLine) => {
        FfmpegHelpersLogger.debug('[ffmpegHelpers] Spawned Ffmpeg with command: ' + commandLine)
      })
      .on('progress', (progress) => {
        if (!progressCB || !progress.percent) return
        FfmpegHelpersLogger.debug(`[ffmpegHelpers] Progress: ${progress.percent}%`)
        progressCB(progress.percent as number)
      })
      .on('end', async (stdout, stderr) => {
        FfmpegHelpersLogger.debug('[ffmpegHelpers] ffmpeg stdout:', stdout)
        FfmpegHelpersLogger.debug('[ffmpegHelpers] ffmpeg stderr:', stderr)
        FfmpegHelpersLogger.debug('[ffmpegHelpers] Moving temp file to audio file path:', `"${tempFilePath}"`, '->', `"${audioFilePath}"`)
        try {
          await copyFunc(tempFilePath, audioFilePath)
          await FfmpegHelpersFs.remove(tempFilePath)
          resolve()
        } catch (error) {
          FfmpegHelpersLogger.error(`[ffmpegHelpers] Failed to move temp file to audio file path: "${tempFilePath}" -> "${audioFilePath}"`, error)
          reject(error)
        }
      })
      .on('error', (err, stdout, stderr) => {
        if (err.message && err.message.includes('SIGKILL')) {
          FfmpegHelpersLogger.info(`[ffmpegHelpers] addCoverAndMetadataToFile Killed by User`)
          reject(new Error('FFMPEG_CANCELED'))
        } else {
          FfmpegHelpersLogger.error('Error adding cover image and metadata:', err)
          FfmpegHelpersLogger.error('ffmpeg stdout:', stdout)
          FfmpegHelpersLogger.error('ffmpeg stderr:', stderr)
          reject(err)
        }
      })

    ffmpeg.run()
  })
}

module.exports.addCoverAndMetadataToFile = addCoverAndMetadataToFile

function escapeFFMetadataValue(value: string): string {
  return value.replace(/([;=\n\\#])/g, '\\$1')
}

/**
 * Retrieves the FFmpeg metadata object for a given library item.
 *
 * @param {import('../models/LibraryItem')} libraryItem - The library item containing the media metadata.
 * @param {number} audioFilesLength - The length of the audio files.
 * @returns {Object} - The FFmpeg metadata object.
 */
function getFFMetadataObject(libraryItem: FfmpegHelpersLibraryItem, audioFilesLength: number): Record<string, unknown> {
  const ffmetadata: Record<string, unknown> = {
    title: libraryItem.media.title,
    artist: libraryItem.media.authorName,
    album_artist: libraryItem.media.authorName,
    album: (libraryItem.media.title || '') + (libraryItem.media.subtitle ? `: ${libraryItem.media.subtitle}` : ''),
    TIT3: libraryItem.media.subtitle, // mp3 only
    genre: libraryItem.media.genres?.join('; '),
    date: libraryItem.media.publishedYear,
    comment: libraryItem.media.description,
    description: libraryItem.media.description,
    composer: (libraryItem.media.narrators || []).join(', '),
    copyright: libraryItem.media.publisher,
    publisher: libraryItem.media.publisher, // mp3 only
    TRACKTOTAL: `${audioFilesLength}`, // mp3 only
    grouping: libraryItem.media.series?.map((s) => s.name + (s.bookSeries.sequence ? ` #${s.bookSeries.sequence}` : '')).join('; ')
  }
  Object.keys(ffmetadata).forEach((key) => {
    if (!ffmetadata[key]) {
      delete ffmetadata[key]
    }
  })

  return ffmetadata
}

module.exports.getFFMetadataObject = getFFMetadataObject

/**
 * Merges audio files into a single output file using FFmpeg.
 *
 * @param {import('../models/Book').AudioFileObject} audioTracks - The audio tracks to merge.
 * @param {number} duration - The total duration of the audio tracks.
 * @param {string} itemCachePath - The path to the item cache.
 * @param {string} outputFilePath - The path to the output file.
 * @param {import('../managers/AbMergeManager').AbMergeEncodeOptions} encodingOptions - The options for encoding the audio.
 * @param {Function} [progressCB=null] - The callback function to track the progress of the merge.
 * @param {import('../libs/fluentFfmpeg/index').FfmpegCommand} [ffmpeg=FfmpegHelpersFfmpeg()] - The FFmpeg instance to use for merging.
 * @returns {Promise<void>} A promise that resolves when the audio files are merged successfully.
 */
async function mergeAudioFiles(
  audioTracks: FfmpegHelpersTrack[],
  duration: number,
  itemCachePath: string,
  outputFilePath: string,
  encodingOptions: FfmpegHelpersEncodingOptions,
  progressCB: ((percent: number) => void) | null = null,
  ffmpeg: FfmpegHelpersCommand = FfmpegHelpersFfmpeg()
): Promise<void> {
  const audioBitrate = encodingOptions.bitrate || '128k'
  const audioCodec = encodingOptions.codec || 'aac'
  const audioChannels = encodingOptions.channels || 2

  // TODO: Updated in 2.2.11 to always encode even if merging multiple m4b. This is because just using the file extension as was being done before is not enough. This can be an option or do more to check if a concat is possible.
  // const audioRequiresEncode = audioTracks[0].metadata.ext !== '.m4b'
  const audioRequiresEncode = true

  const firstTrackIsM4b = audioTracks[0].metadata.ext.toLowerCase() === '.m4b'
  const isOneTrack = audioTracks.length === 1

  let concatFilePath = null
  if (!isOneTrack) {
    concatFilePath = FfmpegHelpersPath.join(itemCachePath, 'files.txt')
    if ((await writeConcatFile(audioTracks, concatFilePath)) == null) {
      throw new Error('Failed to write concat file')
    }
    ffmpeg.input(concatFilePath).inputOptions(['-safe 0', '-f concat'])
  } else {
    ffmpeg.input(audioTracks[0].metadata.path).inputOptions(firstTrackIsM4b ? ['-f mp4'] : [])
  }

  //const logLevel = process.env.NODE_ENV === 'production' ? 'error' : 'warning'
  ffmpeg.outputOptions(['-f mp4'])

  if (audioRequiresEncode) {
    ffmpeg.outputOptions(['-map 0:a', `-acodec ${audioCodec}`, `-ac ${audioChannels}`, `-b:a ${audioBitrate}`])
  } else {
    ffmpeg.outputOptions(['-max_muxing_queue_size 1000'])

    if (isOneTrack && firstTrackIsM4b) {
      ffmpeg.outputOptions(['-c copy'])
    } else {
      ffmpeg.outputOptions(['-c:a copy'])
    }
  }

  ffmpeg.output(outputFilePath)

  return new Promise((resolve, reject) => {
    ffmpeg
      .on('start', (cmd) => {
        FfmpegHelpersLogger.debug(`[ffmpegHelpers] Merge Audio Files ffmpeg command: ${cmd}`)
      })
      .on('progress', (progress) => {
        if (!progressCB || !progress.timemark || !duration) return
        // Cannot rely on progress.percent as it is not accurate for concat
        const percent = (FfmpegHelpersFfmpegUtils.timemarkToSeconds(progress.timemark as string) / duration) * 100
        progressCB(percent)
      })
      .on('end', async (stdout, stderr) => {
        if (concatFilePath) await FfmpegHelpersFs.remove(concatFilePath)
        FfmpegHelpersLogger.debug('[ffmpegHelpers] ffmpeg stdout:', stdout)
        FfmpegHelpersLogger.debug('[ffmpegHelpers] ffmpeg stderr:', stderr)
        FfmpegHelpersLogger.debug(`[ffmpegHelpers] Audio Files Merged Successfully`)
        resolve()
      })
      .on('error', async (err, stdout, stderr) => {
        if (concatFilePath) await FfmpegHelpersFs.remove(concatFilePath)
        if (err.message && err.message.includes('SIGKILL')) {
          FfmpegHelpersLogger.info(`[ffmpegHelpers] Merge Audio Files Killed by User`)
          reject(new Error('FFMPEG_CANCELED'))
        } else {
          FfmpegHelpersLogger.error(`[ffmpegHelpers] Merge Audio Files Error ${err}`)
          FfmpegHelpersLogger.error('ffmpeg stdout:', stdout)
          FfmpegHelpersLogger.error('ffmpeg stderr:', stderr)
          reject(err)
        }
      })

    ffmpeg.run()
  })
}

module.exports.mergeAudioFiles = mergeAudioFiles
