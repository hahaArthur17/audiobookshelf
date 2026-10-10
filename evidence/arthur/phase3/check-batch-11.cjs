// Offline OPF/EPUB comparison against a compiled checkout; no real archives.
const path = require('path')
const Module = require('module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')

let state = { traces: [], logs: [], xml: null, values: {} }
const logger = {
  debug: (...args) => state.logs.push(['debug', ...args]),
  warn: (...args) => state.logs.push(['warn', ...args]),
  error: (...args) => state.logs.push(['error', ...args.map((arg) => arg instanceof Error ? arg.message : arg)])
}
const utils = { xmlToJSON: async (text) => {
  state.traces.push(['xmlToJSON', text])
  return text === 'XML_SAMPLE' ? state.xml : state.values[text] || null
} }
const streamZip = {
  async: class {
    constructor(options) { state.traces.push(['zipOpen', options.file]) }
    async entryData(file) {
      state.traces.push(['entryData', file])
      if (state.failEntry === file) throw new Error('read failed')
      return Buffer.from(file === 'META-INF/container.xml' ? 'container-token' : 'package-token')
    }
    async extract(file, output) {
      state.traces.push(['extract', file, output])
      if (state.failExtract) throw new Error('extract failed')
    }
    async close() {
      state.traces.push(['close'])
      if (state.failClose) throw new Error('close failed')
    }
  }
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  const file = parent?.filename || ''
  if ((file.endsWith('/parsers/parseOpfMetadata.js') || file.endsWith('/parsers/parseEpubMetadata.js')) && request === '../index') return utils
  if (file.endsWith('/parsers/parseEpubMetadata.js')) {
    if (request === '../../Logger') return logger
    if (request === '../../libs/nodeStreamZip') return streamZip
  }
  return originalLoad.apply(this, arguments)
}
let opf, epub
try {
  opf = require(path.join(root, 'dist-server/server/utils/parsers/parseOpfMetadata'))
  epub = require(path.join(root, 'dist-server/server/utils/parsers/parseEpubMetadata'))
} finally {
  Module._load = originalLoad
}

function makePackage(prefixed = false, cover = 'explicit') {
  const metadata = {
    'dc:title': ['The Book'],
    'dc:creator': [
      { _: ' A Author ', $: { 'opf:role': 'aut', id: 'a1' } },
      { _: 'N Narrator', $: { 'opf:role': 'nrt' } }
    ],
    'dc:date': ['2020-04-03'],
    'dc:publisher': ['Pub'],
    'dc:description': ['A &lt;b&gt;bold&lt;/b&gt; story'],
    'dc:subject': ['Story', 'Story', null],
    'dc:tag': ['tag', 'tag'],
    'dc:language': ['en'],
    'dc:identifier': [{ _: '9780000000000', $: { 'opf:scheme': 'ISBN' } }],
    meta: [
      { $: { name: 'calibre:series', content: 'Cycle' } },
      { $: { name: 'calibre:series_index', content: '2' } },
      { _: 'aut', $: { refines: '#a1', property: 'role' } }
    ]
  }
  const pkg = { metadata: [metadata], manifest: [{ item: [] }] }
  if (cover === 'explicit') {
    metadata.meta.push({ $: { name: 'cover', content: 'front' } })
    pkg.manifest[0].item.push({ $: { id: 'front', href: 'images/front.jpg', 'media-type': 'image/jpeg' } })
  } else if (cover === 'property') {
    pkg.manifest[0].item.push({ $: { href: 'images/property.jpg', properties: 'cover-image', 'media-type': 'image/jpeg' } })
  } else if (cover === 'first') {
    pkg.manifest[0].item.push({ $: { href: 'images/first.jpg', 'media-type': 'image/jpeg' } })
  }
  if (prefixed) {
    pkg['ns0:metadata'] = pkg.metadata
    delete pkg.metadata
    metadata['ns0:meta'] = metadata.meta
    delete metadata.meta
    return { 'ns0:package': pkg }
  }
  return { package: pkg }
}
const outcome = (fn) => {
  try { return { value: fn() } }
  catch (error) { return { error: error.message || String(error) } }
}
async function asyncOutcome(fn) {
  try { return { value: await fn() } }
  catch (error) { return { error: error.message || String(error) } }
}
function opfJson(input) {
  const result = outcome(() => opf.parseOpfMetadataJson(input))
  const pkg = input && (input.package || input['ns0:package'])
  const metadata = pkg && (pkg.metadata || pkg['ns0:metadata'])
  return { result, metaAfter: Array.isArray(metadata) ? metadata[0]?.meta : metadata?.meta }
}
async function epubCase(name, cover, changes = {}) {
  const packageJson = makePackage(false, cover)
  state = {
    traces: [], logs: [],
    values: {
      'container-token': changes.noContainer ? null : { container: changes.noPath ? {} : { rootfiles: [{ rootfile: [{ $: { 'full-path': 'OPS/content.opf' } }] }] } },
      'package-token': packageJson
    },
    ...changes
  }
  const result = await asyncOutcome(() => epub.parse({ metadata: { path: '/virtual/book.epub' }, ebookFormat: 'epub' }))
  return { name, result, packageMetaAfter: packageJson.package.metadata[0].meta, traces: state.traces, logs: state.logs }
}
async function main() {
  const normal = makePackage()
  const prefixed = makePackage(true)
  const result = {
    exports: {
      opf: Object.keys(opf),
      epub: Object.keys(epub),
      callable: Object.fromEntries([...Object.entries(opf), ...Object.entries(epub)].map(([name, fn]) => [name, { name: fn.name, length: fn.length, prototype: Object.hasOwn(fn, 'prototype') }]))
    },
    opf: {
      normal: opfJson(normal),
      prefixed: opfJson(prefixed),
      empty: opfJson({}),
      primitive: opfJson({ package: { metadata: 'text' } }),
      nullInput: opfJson(null)
    }
  }
  state = { traces: [], logs: [], xml: makePackage(), values: {} }
  const original = opf.parseOpfMetadataJson
  opf.parseOpfMetadataJson = (json) => ({ receiverMarker: Object.keys(json)[0] })
  result.xml = {
    direct: await asyncOutcome(() => opf.parseOpfMetadataXML('XML_SAMPLE')),
    borrowed: await asyncOutcome(() => opf.parseOpfMetadataXML.call({ parseOpfMetadataJson: () => 'other' }, 'XML_SAMPLE')),
    traces: state.traces
  }
  opf.parseOpfMetadataJson = original
  result.epub = [
    await epubCase('explicit', 'explicit'),
    await epubCase('property', 'property'),
    await epubCase('first', 'first'),
    await epubCase('missingCover', 'none'),
    await epubCase('missingContainer', 'explicit', { noContainer: true }),
    await epubCase('missingPath', 'explicit', { noPath: true }),
    await epubCase('readFailure', 'explicit', { failEntry: 'META-INF/container.xml' })
  ]
  state = { traces: [], logs: [], failExtract: false }
  result.coverSuccess = { result: await asyncOutcome(() => epub.extractCoverImage('/virtual/book.epub', 'cover.jpg', '/virtual/out.jpg')), traces: state.traces, logs: state.logs }
  state = { traces: [], logs: [], failExtract: true, failClose: true }
  result.coverFailure = { result: await asyncOutcome(() => epub.extractCoverImage('/virtual/book.epub', 'cover.jpg', '/virtual/out.jpg')), traces: state.traces, logs: state.logs }
  console.log('BEHAVIOR_JSON=' + JSON.stringify(result))
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
