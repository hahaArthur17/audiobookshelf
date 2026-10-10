// Fixed-input sample for the compiled shared utility entrypoint.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const utils = require(path.join(root, 'dist-server/server/utils/index'))
const logger = require(path.join(root, 'dist-server/server/Logger'))
const originalError = logger.error
const originalRandom = Math.random
const originalSettings = global.ServerSettings
const logs = []
logger.error = (...args) => logs.push(args.map((arg) => arg instanceof Error ? { name: arg.name, message: arg.message } : arg))
const run = (fn) => {
  try { return { value: fn() } }
  catch (error) {
    return { error: { name: error?.name, message: error?.message || String(error), status: error?.status, paramName: error?.paramName, fields: error && typeof error === 'object' ? Object.keys(error) : null } }
  }
}
async function main() {
  try {
    global.ServerSettings = { sortingPrefixes: ['the', 'a'] }
    Math.random = () => 0.123456789
    const getId = [utils.getId(), utils.getId('book')]
    Math.random = originalRandom
    const query = (q, name, fallback, required, maxLength) => run(() => utils.getQueryParamAsString(q, name, fallback, required, maxLength))
    const output = {
      exports: Object.keys(utils),
      callable: Object.fromEntries(Object.keys(utils).map((key) => [key, {
        type: typeof utils[key],
        length: utils[key].length,
        prototype: Object.hasOwn(utils[key], 'prototype')
      }])),
      levenshtein: [
        utils.levenshteinDistance('Book', 'books'),
        utils.levenshteinDistance('Book', 'books', true),
        utils.levenshteinSimilarity('Book', 'books'),
        utils.levenshteinSimilarity('', ''),
        utils.levenshteinDistance(null, 0)
      ],
      basic: {
        isObject: [utils.isObject(null), utils.isObject([]), utils.isObject({}), utils.isObject('x')],
        paths: [utils.comparePaths('a/../b', 'b'), utils.comparePaths('a', 'b')],
        nullOrNaN: [utils.isNullOrNaN(null), utils.isNullOrNaN(undefined), utils.isNullOrNaN('2'), utils.isNullOrNaN('x')],
        clamp: [utils.clampPositiveInt(null, 5), utils.clampPositiveInt(-2, 5), utils.clampPositiveInt(2.9, 5), utils.clampPositiveInt(9, 5)],
        getId,
        pretty: [0.5, 0, 61, 3600, 86400, -1].map(utils.elapsedPretty),
        timestamps: [utils.secondsToTimestamp(61.234, true), utils.secondsToTimestamp(3601, false, true)],
        webp: [utils.reqSupportsWebp(null), utils.reqSupportsWebp({ headers: { accept: 'image/webp,image/*' } }), utils.reqSupportsWebp({ headers: { accept: '*/*' } })],
        equivalent: [utils.areEquivalent({ a: 1 }, { a: 1 }), utils.areEquivalent([1], [2])]
      },
      copies: [
        run(() => utils.copyValue(undefined)),
        run(() => utils.copyValue('')),
        run(() => utils.copyValue(0)),
        run(() => utils.copyValue([1, { x: ['v', ''] }])),
        run(() => utils.copyValue.call({ isObject: () => false }, { nested: { x: 1 } }))
      ],
      numberSearchTitle: {
        numbers: [utils.toNumber('2'), utils.toNumber('no', 7), utils.toNumber(null, 7)],
        clean: [utils.cleanStringForSearch('  Hi, `There`.  '), utils.cleanStringForSearch(null)],
        title: ['The Good Book', 'A Tale', 'Other'].map((t) => [utils.getTitleIgnorePrefix(t), utils.getTitlePrefixAtEnd(t)]),
        escape: utils.escapeRegExp('a+b[c].*'),
        invalidEscape: utils.escapeRegExp(5)
      },
      validation: {
        urls: [utils.validateUrl('https://example.com/a'), utils.validateUrl('not-a-url'), utils.validateUrl(null)],
        uuid: [utils.isUUID('550e8400-e29b-41d4-a716-446655440000'), utils.isUUID('bad')],
        asin: [utils.isValidASIN('B012345678'), utils.isValidASIN('b012345678')],
        timestamp: ['01', '01:02', '01:02:03', 'x', '1:2:3:4', 3].map(utils.timestampToSeconds),
        classErrors: [
          run(() => { throw new utils.ValidationError('author', 'is required') }),
          run(() => { throw new utils.NotFoundError('missing') })
        ],
        queries: [
          query({ author: 'Smith' }, 'author'),
          query({}, 'author', 'default'),
          query({}, 'author', '', true),
          query({ author: ['A', 'B'] }, 'author'),
          query({ author: 'abcd' }, 'author', '', false, 3),
          query({ author: 42 }, 'author')
        ]
      },
      xml: [await utils.xmlToJSON('<Root><Name>Book</Name></Root>'), await utils.xmlToJSON('<Root>')],
      logs
    }
    console.log('BEHAVIOR_JSON=' + JSON.stringify(output))
  } finally {
    logger.error = originalError
    Math.random = originalRandom
    global.ServerSettings = originalSettings
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
