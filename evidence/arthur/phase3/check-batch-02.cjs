// Fixed-input parser/generator behavior sample; run against compiled checkout.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const nfo = load('utils/parsers/parseNfoMetadata')
const opml = load('utils/parsers/parseOPML')
const userAgent = load('utils/parsers/parseUserAgent')
const generator = load('utils/generators/opmlGenerator')
const logger = load('Logger')

const errors = []
const originalError = logger.error
logger.error = (...args) => { errors.push(args) }
let feeds
try {
  feeds = opml.parse('<opml><body><outline type="rss" title="A" xmlUrl="https://a.test/feed"/><outline type="rss" title="No URL"/><outline type="rss" text="B" xmlUrl="https://b.test/feed"/></body></opml>')
} finally {
  logger.error = originalError
}

console.log('BEHAVIOR_JSON=' + JSON.stringify({
  exports: {
    nfo: Object.keys(nfo),
    opml: Object.keys(opml),
    userAgent: typeof userAgent,
    generator: Object.keys(generator),
    nfoCallable: { name: nfo.parseNfoMetadata.name, prototype: Object.hasOwn(nfo.parseNfoMetadata, 'prototype') },
    opmlCallable: { name: opml.parse.name, prototype: Object.hasOwn(opml.parse, 'prototype') },
    userAgentCallable: { name: userAgent.name, prototype: Object.hasOwn(userAgent, 'prototype') },
    generatorCallable: { name: generator.generate.name, prototype: Object.hasOwn(generator.generate, 'prototype') }
  },
  nfoEmpty: nfo.parseNfoMetadata(''),
  nfoSample: nfo.parseNfoMetadata('Title: Book: Subtitle\nAuthor: A, B\nRelease Date: 2015 then 2020\nUnabridged: maybe\nBook Description\n====\nLine one\nLine two'),
  feeds,
  errors,
  userAgentEmpty: userAgent(''),
  userAgentUnknown: userAgent('unknown-agent'),
  userAgentKnown: userAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
  generated: generator.generate([{ feedURL: 'https://feed.test/?a=1&b=2', title: 'Tom & Jerry', description: '<show>' }, { title: 'missing URL' }], false)
}))
