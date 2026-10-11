// Disposable SQLite schema smoke check for the compiled legacy migration module.
// This uses an in-memory database and never opens the user's application database.
const path = require('node:path')
const Module = require('node:module')
const { Sequelize, DataTypes } = require('sequelize')

const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith('/utils/migrations/dbMigration.js')) {
    if (request === '../../Logger') return { info() {}, warn() {}, error() {} }
    if (request === '../../libs/fsExtra') return { async pathExists() { return false } }
    if (request === './oldDbFiles') return {}
    if (request === '../parsers/parseNameString') return { nameToLastFirst: (name) => name }
  }
  return originalLoad.apply(this, arguments)
}

async function main() {
  global.ConfigPath = '/disposable-config'
  global.ServerSettings = { sortingPrefixes: ['the'] }
  const target = require(path.resolve(root, 'dist-server/server/utils/migrations/dbMigration'))
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  try {
    const qi = db.getQueryInterface()
    const tableNames = ['libraries', 'libraryItems', 'podcastEpisodes', 'feeds', 'authors', 'bookAuthors', 'bookSeries', 'books', 'podcasts', 'series']
    for (const table of tableNames) {
      await qi.createTable(table, { id: { type: DataTypes.STRING, primaryKey: true } })
    }
    const model = { async findAll() { return [] } }
    const models = Object.fromEntries(['libraryItem', 'book', 'podcast', 'author', 'series', 'bookAuthor', 'bookSeries'].map((name) => [name, model]))
    const ctx = { sequelize: db, models }

    const patch1 = await target.migrationPatch(ctx)
    const patch2First = await target.migrationPatch2(ctx)
    const patch2Second = await target.migrationPatch2(ctx)
    const columns = {}
    for (const table of tableNames) {
      columns[table] = Object.keys(await qi.describeTable(table)).sort()
    }
    process.stdout.write(JSON.stringify({ exports: Object.keys(target), patch1: String(patch1), patch2First, patch2Second, columns }) + '\n')
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => { Module._load = originalLoad })
