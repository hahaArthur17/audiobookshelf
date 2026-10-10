// Independent deterministic comparison for compiled prober.js.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const events = []
const ffprobe = (filepath) => {
  events.push(['ffprobe', filepath, ffprobe.FFPROBE_PATH ?? null])
  if (filepath === 'reject') return Promise.reject(new Error('spawn failed'))
  if (filepath === 'raw-error') return Promise.resolve({ error: { string: 'invalid data' } })
  if (filepath === 'malformed') return Promise.resolve({ streams: [] })
  if (filepath === 'empty') return Promise.resolve({ format: { size: '0', duration: '0' }, streams: [], chapters: [] })
  return Promise.resolve({
    format: { format_long_name: 'QuickTime', duration: '65.5', size: '1048576', bit_rate: '256000', tags: { TITLE: ' Book ', encoder: 'Tool' } },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264', bit_rate: '144000', avg_frame_rate: '30000/1001', width: '1920', height: '1080', tags: { language: 'eng' } },
      { index: 1, codec_type: 'audio', codec_name: 'aac', bit_rate: '112000', sample_rate: '44100', channels: 2, channel_layout: 'stereo(side)', disposition: { default: 1 }, tags: { title: ' Main ', BPS: '128000' } },
      { index: 2, codec_type: 'audio', codec_name: 'mp3', sample_rate: '48000', disposition: { default: 0 }, tags: { 'BPS-eng': '96000' } },
      { index: 3, codec_type: 'subtitle', codec_name: 'srt', disposition: { default: '1' } }
    ],
    chapters: [
      { start_time: '30.5', end_time: '60.0', tags: { title: ' Two ' } },
      { start: 0, end: 30000, time_base: '1/1000', 'TAG:title': ' One ' }
    ]
  })
}
class MediaProbeData {
  constructor() { events.push(['MediaProbeData.new']) }
  setData(data) { events.push(['MediaProbeData.setData']); this.data = data }
}
const logger = { debug: (...args) => events.push(['debug', ...args]), warn: (...args) => events.push(['warn', ...args]), error: (...args) => events.push(['error', ...args]) }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/prober.js')) {
    if (request === '../libs/nodeFfprobe') return ffprobe
    if (request === '../scanner/MediaProbeData') return MediaProbeData
    if (request === '../Logger') return logger
  }
  return originalLoad.apply(this, arguments)
}
const oldPath = process.env.FFPROBE_PATH
const oldError = console.error
console.error = (...args) => events.push(['console.error', ...args.map((a) => a instanceof Error ? { name: a.name, message: a.message } : a)])
const normalize = (value) => {
  if (value instanceof Error) return { name: value.name, message: value.message }
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map((key) => [key, normalize(value[key])]))
  return value
}
async function main() {
  try {
    process.env.FFPROBE_PATH = '/fake/ffprobe'
    const target = require(path.join(root, 'dist-server/server/utils/prober'))
    const output = { exports: Object.keys(target).map((key) => [key, target[key].length, Object.hasOwn(target[key], 'prototype')]) }
    for (const sample of ['ok', 'empty', 'raw-error', 'malformed', 'reject']) output[sample] = normalize(await target.probe(sample, sample === 'ok'))
    output.rawOk = normalize(await target.rawProbe('ok'))
    output.rawReject = normalize(await target.rawProbe('reject'))
    output.events = normalize(events)
    console.log(JSON.stringify(output, null, 2))
  } finally {
    if (oldPath === undefined) delete process.env.FFPROBE_PATH
    else process.env.FFPROBE_PATH = oldPath
    console.error = oldError
    Module._load = originalLoad
  }
}
main().catch((error) => { oldError(error); process.exitCode = 1 })
