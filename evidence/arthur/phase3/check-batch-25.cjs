// Independent offline comparison for the compiled FFmpeg helper module.
const path = require('node:path')
const Module = require('node:module')
const EventEmitter = require('node:events')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const calls = []
const snapshot = (value) => value instanceof Error ? { error: value.message } : value
class Command extends EventEmitter {
  constructor(input) { super(); calls.push(['ffmpeg.create', input === undefined ? '[undefined]' : input]) }
  on(name, listener) { calls.push(['ffmpeg.on', name]); return super.on(name, listener) }
  addOption(...args) { calls.push(['ffmpeg.addOption', ...args]); return this }
  addOutput(...args) { calls.push(['ffmpeg.addOutput', ...args]); return this }
  output(...args) { calls.push(['ffmpeg.output', ...args]); return this }
  outputOptions(...args) { calls.push(['ffmpeg.outputOptions', ...args]); return this }
  input(...args) { calls.push(['ffmpeg.input', ...args]); return this }
  inputOptions(...args) { calls.push(['ffmpeg.inputOptions', ...args]); return this }
  run() {
    calls.push(['ffmpeg.run'])
    this.emit('start', 'ffmpeg command')
    this.emit('stderr', 'warning')
    this.emit('progress', { percent: 32, targetSize: 10, timemark: '00:00:10' })
    this.emit('end', 'stdout', 'stderr')
    return this
  }
}
const fs = {
  async writeFile(...args) { calls.push(['fs.writeFile', ...args]) },
  async ensureDir(...args) { calls.push(['fs.ensureDir', ...args]) },
  async remove(...args) { calls.push(['fs.remove', ...args]) }
}
const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((name) => [name, (...args) => calls.push([`log.${name}`, ...args.map(snapshot)])]))
let attempts = 0
const axios = async (options) => {
  calls.push(['axios', { ...options, httpAgent: options.httpAgent, httpsAgent: options.httpsAgent }])
  attempts++
  if (attempts === 1) throw new Error('first user agent rejected')
  return { data: 'stream' }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/ffmpegHelpers.js')) {
    if (request === 'axios') return axios
    if (request === 'ssrf-req-filter') return (url) => { calls.push(['ssrf', url]); return 'filtered-agent' }
    if (request === '../libs/fluentFfmpeg') return (input) => new Command(input)
    if (request === '../libs/fluentFfmpeg/utils') return { timemarkToSeconds: () => 10 }
    if (request === '../libs/fsExtra') return fs
    if (request === '../Logger') return logger
    if (request === './fileUtils') return { filePathToPOSIX: (value) => value.replaceAll('\\', '/'), copyToExisting: async (...args) => calls.push(['copy', ...args]) }
  }
  return originalLoad.apply(this, arguments)
}
async function main() {
  try {
    global.PodcastDownloadTimeout = 1234
    global.DisableSsrfRequestFilter = (url) => { calls.push(['disableSsrf', url]); return false }
    const target = require(path.join(root, 'dist-server/server/utils/ffmpegHelpers'))
    const output = {}
    output.exports = Object.keys(target).map((key) => [key, typeof target[key], target[key].length, Object.hasOwn(target[key], 'prototype')])
    output.metadata = target.generateFFMetadata({ title: 'A;B=C', skip: '', author: 'X' }, [{ start: 0, end: 1.25, title: 'Intro#' }])
    output.concat = await target.writeConcatFile([{ index: 0, duration: 5, metadata: { path: "/a'one.mp3" } }, { index: 1, duration: 7, metadata: { path: 'C:\\two.mp3' } }], '/tmp/concat.txt', 6)
    output.writeMetadata = await target.writeFFMetadataFile({ title: 'A' }, null, '/tmp/meta.txt')
    output.cover = await target.extractCoverArt('/input.m4b', '/out/cover.jpg')
    output.resize = await target.resizeImage('/in.jpg', '/out.jpg', 0, 200)
    const episodeDownload = { url: 'https://feed/episode.mp3', targetPath: '/tmp/episode.mp3', pubYear: 2020, libraryItem: { media: { title: 'Show', author: 'Host', genres: ['Books'], language: 'en', itunesId: 'i1', podcastType: 'episodic' } }, rssPodcastEpisode: { enclosure: { length: '10000' }, title: 'Episode', subtitle: 'Sub', description: 'Text', season: '1', episode: '2', pubDate: 'today', episodeType: 'full' } }
    output.download = await target.downloadPodcastEpisode(episodeDownload)
    output.ffObject = target.getFFMetadataObject({ media: { title: 'Book', subtitle: 'Part', authorName: 'Author', genres: ['Fiction'], publishedYear: '2020', narrators: ['Reader'], series: [] } }, 2)
    output.add = await target.addCoverAndMetadataToFile('/audio/book.mp3', null, '/tmp/meta.txt', 2, 'audio/mpeg', (value) => calls.push(['progress', value]))
    output.merge = await target.mergeAudioFiles([{ index: 0, metadata: { path: '/audio/book.m4b', ext: '.m4b' }, duration: 20 }], 20, '/tmp/cache', '/tmp/merged.m4b', { bitrate: '96k', codec: 'aac', channels: 2 }, (value) => calls.push(['merge.progress', value]))
    output.calls = calls
    process.stdout.write(JSON.stringify(output) + '\n')
  } finally {
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
