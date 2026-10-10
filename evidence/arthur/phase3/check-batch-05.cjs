// Fixed-input ABS metadata and series parsing sample, run against a compiled checkout.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const series = load('utils/parsers/parseSeriesString')
const metadata = load('utils/generators/abmetadataGenerator')
const logger = load('Logger')

const calls = []
const original = { warn: logger.warn, error: logger.error }
logger.warn = (...args) => calls.push(['warn', ...args.map((arg) => arg instanceof Error ? arg.message : arg)])
logger.error = (...args) => calls.push(['error', ...args.map((arg) => arg instanceof Error ? arg.message : arg)])

const seriesInputs = [null, '', 0, {}, 'Name', 'Name #1', 'Name #1a', 'Name #1#a', 'Name #1 a', ' Name #2', 'Name #0']
const metadataInputs = [
  ['book', { title: 'Book', authors: [' A ', 'A', null, 'B'], series: ['Saga #1', 'Saga'], tags: null, publishedYear: 2020, explicit: 'TRUE' }],
  ['podcast', { metadata: { title: 'Show', feedUrl: 'https://example.test/feed', imageUrl: 'cover', itunesPageUrl: 'page', type: 'serial' } }],
  ['book', { title: 'Chapters', chapters: [{ start: '0', end: '10', title: 'One' }, { start: 10, end: 20, title: 'Two' }] }],
  ['book', { title: 'Bad start', chapters: [{ start: null, end: 2, title: 'One' }] }],
  ['book', { title: 'Bad title', chapters: [{ start: 0, end: 2, title: 1 }] }],
  ['book', { title: 'Null chapters', chapters: null }],
  ['book', { title: 'Wrong chapters', chapters: 'bad' }],
  ['book', { title: 123, abridged: 'false', language: true, tags: [1, ' a ', 'a'] }],
  ['wrong', { title: 'Invalid type' }],
  ['book', 'not-json']
]

let output
try {
  output = {
    exports: {
      series: Object.keys(series),
      metadata: Object.keys(metadata),
      seriesCallable: { name: series.parse.name, prototype: Object.hasOwn(series.parse, 'prototype') },
      metadataCallable: { name: metadata.parseJson.name, prototype: Object.hasOwn(metadata.parseJson, 'prototype') }
    },
    series: seriesInputs.map((value) => series.parse(value)),
    metadata: metadataInputs.map(([type, value]) => metadata.parseJson(typeof value === 'string' ? value : JSON.stringify(value), type)),
    calls
  }
} finally {
  logger.warn = original.warn
  logger.error = original.error
}
console.log('BEHAVIOR_JSON=' + JSON.stringify(output))
