// Fixed-input, offline OverDrive marker sample against a compiled checkout.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const parser = load('utils/parsers/parseOverdriveMediaMarkers')
const logger = load('Logger')
const calls = []
const originalDebug = logger.debug
logger.debug = (...args) => calls.push(args)
const track = (duration, marker) => ({ duration, metaTags: { tagOverdriveMediaMarker: marker } })
const marker = (chapters) => '<Markers>' + chapters.map(([name, time]) => '<Marker><Name>' + name + '</Name><Time>' + time + '</Time></Marker>').join('') + '</Markers>'
const one = marker([['Intro', '0:00.000'], ['Chapter 2', '1:02.500']])
const two = marker([['Next', '0:05.000'], ['Continued', '0:10.000'], ['Final', '0:20.000']])
const run = (files) => {
  try { return { value: parser.parseOverdriveMediaMarkersAsChapters(files) } }
  catch (error) { return { error: error.message } }
}
let output
try {
  output = {
    exports: Object.keys(parser),
    callable: {
      name: parser.parseOverdriveMediaMarkersAsChapters.name,
      length: parser.parseOverdriveMediaMarkersAsChapters.length,
      prototype: Object.hasOwn(parser.parseOverdriveMediaMarkersAsChapters, 'prototype'),
      default: Object.hasOwn(parser, 'default')
    },
    samples: {
      empty: run([]),
      noMarker: run([track(20, null)]),
      one: run([track(90, one)]),
      two: run([track(90, one), track(60, two)]),
      mismatch: run([track(90, one), track(60, null)]),
      malformedXml: run([track(20, '<Markers')]),
      invalidTime: run([track(20, marker([['Bad', 'not-time']]))])
    },
    calls
  }
} finally {
  logger.debug = originalDebug
}
console.log('BEHAVIOR_JSON=' + JSON.stringify(output))
