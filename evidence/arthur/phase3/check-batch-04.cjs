// Fixed-input CommonJS and behavior sample for Stage 1 Batch 04.
const path = require('path')
const crypto = require('crypto')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', 'utils', name))

const constants = load('constants')
const { notificationData } = load('notifications')
const { entities } = load('htmlEntities')
const html = load('htmlSanitizer')

const result = {
  constantNames: Object.keys(constants),
  constantValues: constants,
  notificationEventNames: notificationData.events.map((event) => event.name),
  notificationDigest: crypto.createHash('sha256').update(JSON.stringify(notificationData)).digest('hex'),
  entityCount: Object.keys(entities).length,
  entityFirst: Object.keys(entities).slice(0, 5),
  entityLast: Object.keys(entities).slice(-5),
  entityDigest: crypto.createHash('sha256').update(JSON.stringify(entities)).digest('hex'),
  htmlExports: Object.keys(html),
  sanitize: html.sanitize('<p>Hi <strong>there</strong><script>alert(1)</script><a href="javascript:bad">bad</a><a href="https://example.test">good</a></p>'),
  sanitizeNonString: html.sanitize(null),
  stripTags: html.stripAllTags('<p>Tom &amp; Jerry <b>bold</b></p>'),
  stripTagsNoDecode: html.stripAllTags('<p>Tom &amp; Jerry <b>bold</b></p>', false),
  stripTagsNonString: html.stripAllTags(42),
  stripTagsUnknown: html.stripAllTags('<p>&AMP; &AElig; &doesNotExist;</p>')
}
console.log('BEHAVIOR_JSON=' + JSON.stringify(result))
