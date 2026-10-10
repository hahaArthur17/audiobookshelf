// Independent offline comparison of the compiled podcast RSS utility.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const calls = []
const rss = {
  rss: { channel: [{
    title: ['Podcast'], language: ['en'], description: ['<p>Show</p>'], image: [{ url: ['https://image'] }],
    'itunes:category': [{ '$': { text: 'Arts' }, 'itunes:category': [{ '$': { text: 'Books' } }] }],
    'itunes:new-feed-url': ['https://original-feed'],
    item: [
      {
        title: ['First'], description: ['<p>Episode</p>'], 'content:encoded': ['<b>Full</b>'],
        enclosure: [{ '$': { url: ' https://audio/first.mp3 ', type: 'audio/mpeg' } }],
        pubDate: ['Tue, 10 Oct 2023 12:00:00 GMT'], guid: ['first-guid'], 'itunes:duration': ['01:02'],
        'psc:chapters': [{ 'psc:chapter': [{ '$': { title: 'Intro', start: '00:01' } }, { '$': { title: 'More', start: '00:31' } }] }]
      },
      { title: ['Second'], 'media:content': [{ '$': { url: 'https://audio/second.mp3', type: 'audio/mpeg' } }], 'itunes:duration': ['bad'] },
      { title: ['Invalid'] }
    ]
  }] }
}
const xmlToJSON = async (xml) => {
  calls.push(['xmlToJSON', xml])
  if (xml === 'invalid') return {}
  if (xml === 'no-channel') return { rss: {} }
  if (xml === 'no-items') return { rss: { channel: [{}] } }
  return JSON.parse(JSON.stringify(rss))
}
const timestampToSeconds = (value) => { calls.push(['timestamp', value]); if (value === 'bad') return null; const parts = value.split(':').map(Number); return parts.reduce((total, part) => total * 60 + part, 0) }
const htmlSanitizer = { sanitize: (value) => { calls.push(['sanitize', value]); return value.replace(/<[^>]*>/g, '') }, stripAllTags: (value) => { calls.push(['strip', value]); return value.replace(/<[^>]*>/g, '') } }
const ssrfFilter = (url) => { calls.push(['ssrf', url]); return `agent:${url}` }
const axios = (options) => {
  calls.push(['axios', { ...options }])
  if (options.url === 'http://redirect') {
    const error = new Error('redirect')
    error.code = 'ERR_FR_REDIRECTION_FAILURE'
    error.cause = { code: 'ERR_INVALID_PROTOCOL' }
    error.request = { _options: { protocol: 'https:', href: 'https://redirect' } }
    return Promise.reject(error)
  }
  if (options.url === 'https://failure') return Promise.reject(new Error('network failed'))
  if (options.url === 'https://empty') return Promise.resolve({ headers: {}, data: Buffer.alloc(0) })
  return Promise.resolve({ headers: { 'content-type': options.url === 'https://latin' ? 'application/xml; charset=iso-8859-1' : 'application/xml' }, data: Buffer.from('valid') })
}
class Fuse {
  constructor(items, options) { calls.push(['fuseNew', options]); this.items = items }
  search(term) { calls.push(['fuseSearch', term]); return this.items.slice().reverse().map((item) => ({ item })) }
}
const logger = { debug: (...args) => calls.push(['debug', ...args]), info: (...args) => calls.push(['info', ...args]), warn: (...args) => calls.push(['warn', ...args]), error: (...args) => calls.push(['error', ...args]) }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/podcastUtils.js')) {
    if (request === 'axios') return axios
    if (request === 'ssrf-req-filter') return ssrfFilter
    if (request === '../Logger') return logger
    if (request === './index') return { xmlToJSON, timestampToSeconds }
    if (request === '../utils/htmlSanitizer') return htmlSanitizer
    if (request === '../libs/fusejs') return Fuse
  }
  return originalLoad.apply(this, arguments)
}
const originalTimeout = global.PodcastDownloadTimeout
const originalDisable = global.DisableSsrfRequestFilter
const normalize = (value) => {
  if (Buffer.isBuffer(value)) return `[Buffer ${value.toString()}]`
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code }
  if (typeof value === 'function') return '[function]'
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map((key) => [key, normalize(value[key])]))
  return value
}
async function main() {
  try {
    global.PodcastDownloadTimeout = 777
    global.DisableSsrfRequestFilter = (url) => { calls.push(['disableSsrf', url]); return url === 'https://latin' }
    const target = require(path.join(root, 'dist-server/server/utils/podcastUtils'))
    const output = { exports: Object.keys(target).map((key) => [key, target[key].length, Object.hasOwn(target[key], 'prototype')]) }
    output.parsed = [
      await target.parsePodcastRssFeedXml('valid'),
      await target.parsePodcastRssFeedXml('valid', true),
      await target.parsePodcastRssFeedXml('valid', false, true),
      await target.parsePodcastRssFeedXml('invalid'),
      await target.parsePodcastRssFeedXml('no-channel'),
      await target.parsePodcastRssFeedXml('no-items'),
      await target.parsePodcastRssFeedXml('')
    ]
    output.feed = [
      await target.getPodcastFeed('https://www.cbc.ca/show'),
      await target.getPodcastFeed('https://latin', true),
      await target.getPodcastFeed('http://redirect'),
      await target.getPodcastFeed('https://empty'),
      await target.getPodcastFeed('https://failure')
    ]
    output.borrowedFeed = await target.getPodcastFeed.call({ parsePodcastRssFeedXml: () => { throw new Error('wrong receiver') } }, 'https://ok', true)
    output.matches = [target.findMatchingEpisodesInFeed(output.parsed[0].podcast, 'Second'), target.findMatchingEpisodesInFeed(null, 'x'), await target.findMatchingEpisodes('https://ok', 'First')]
    output.calls = calls
    console.log(JSON.stringify(normalize(output), null, 2))
  } finally {
    global.PodcastDownloadTimeout = originalTimeout
    global.DisableSsrfRequestFilter = originalDisable
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
