// Independent fixed-input comparison for the compiled book query helper.
const path = require('node:path')
const Module = require('node:module')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')

const calls = []
const snapshot = (value, seen = new WeakSet()) => {
  if (typeof value === 'symbol') return String(value)
  if (value === undefined) return '[undefined]'
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((part) => snapshot(part, seen))
  const result = {}
  for (const key of Reflect.ownKeys(value)) result[String(key)] = snapshot(value[key], seen)
  return result
}
const op = Object.fromEntries(['and', 'or', 'gte', 'gt', 'not', 'eq', 'between', 'substring', 'notLike'].map((key) => [key, Symbol(key)]))
const sequelize = {
  Op: op,
  literal: (value) => ({ literal: value }),
  col: (value) => ({ column: value }),
  fn: (name, ...args) => ({ function: name, args }),
  where: (left, right) => ({ where: [left, right] })
}
const bookModel = {
  async count(options) { calls.push(['count', snapshot(options)]); return 7 },
  async findAll(options) { calls.push(['findAll', snapshot(options)]); return [{ id: 'book' }] },
  async findAndCountAll(options) { calls.push(['findAndCountAll', snapshot(options)]); return { rows: [{ id: 'uncached' }], count: 8 } }
}
const database = {
  bookModel,
  sequelize: { random() { calls.push(['random']); return 'RANDOM' } },
  seriesModel: { async findAll(options) {
    calls.push(['series.findAll', snapshot(options)])
    const book = (id) => ({ id, bookSeries: { id: `link-${id}` }, libraryItem: { id: `item-${id}` } })
    return [{ id: 'series', dataValues: { numBooks: 3 }, books: [book('a'), book('b'), book('c')] }]
  } }
}
const logger = { debug(...args) { calls.push(['debug', ...args]) }, warn(...args) { calls.push(['warn', ...args]) }, error(...args) { calls.push(['error', ...args]) } }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/queries/libraryItemsBookFilters.js')) {
    if (request === 'sequelize') return sequelize
    if (request === '../../Database') return database
    if (request === '../../Logger') return logger
    if (request === './authorFilters') return {}
    if (request === '../../managers/ShareManager') return {}
    if (request === '../profiler') return { profile: (fn) => fn }
    if (request === '../stringifySequelizeQuery') return (options) => JSON.stringify(snapshot(options))
  }
  return originalLoad.apply(this, arguments)
}

async function main() {
  try {
    global.ServerSettings = { sortingIgnorePrefix: true }
    const target = require(path.join(root, 'dist-server/server/utils/queries/libraryItemsBookFilters'))
    const output = {}
    output.exports = Object.keys(target).map((key) => [key, typeof target[key], target[key].length, Object.hasOwn(target[key], 'prototype')])
    output.permissions = [null, { canAccessExplicitContent: false, permissions: { accessAllTags: false, itemTagsSelected: ['one'], selectedTagsNotAccessible: true } }, { canAccessExplicitContent: true, permissions: { accessAllTags: false, itemTagsSelected: ['one'], selectedTagsNotAccessible: false } }].map((user) => snapshot(target.getUserPermissionBookWhereQuery(user)))
    output.progress = ['not-finished', 'not-started', 'finished', 'in-progress', 'unknown'].map((value) => snapshot(target.getCollapseSeriesMediaProgressFilter(value)))
    output.groups = [['progress', 'ebook-in-progress'], ['progress', 'not-started'], ['genres', 'fiction'], ['tracks', 'multi'], ['missing', 'authors'], ['publishedDecades', '1990'], ['ebooks', 'no-ebook'], ['unknown', 'x']].map(([group, value]) => snapshot(target.getMediaGroupQuery(group, value)))
    output.order = ['addedAt', 'media.metadata.authorName', 'media.metadata.title', 'sequence', 'progress', 'random', 'unknown'].map((sortBy) => snapshot(target.getOrder(sortBy, true, true)))
    const first = { where: { libraryId: 'lib' } }
    output.cache = [await target.findAndCountAll(first, 2, 0, true), await target.findAndCountAll({ where: { libraryId: 'lib' } }, 1, 2, true)]
    output.firstMutatedOptions = snapshot(first)
    target.clearCountCache('afterUpdate')
    output.cache.push(await target.findAndCountAll({ where: { libraryId: 'lib' } }, 3, 4, true))
    output.uncached = await target.findAndCountAll({ where: { id: 'other' } }, 0, 5, false)
    output.collapse = snapshot(await target.getCollapseSeriesBooksToExclude({ where: { title: 'A' } }, { libraryId: 'lib' }, { key: 'value' }))
    output.calls = calls
    process.stdout.write(JSON.stringify(output) + '\n')
  } finally {
    Module._load = originalLoad
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
