// PO-S07 probe for the reported bug in Book.ts (lines 517-519 and 552 of the old Book.js; Book.ts:651-653 and 686 now):
//   bookSeries.sequence is read without the ?. guard used elsewhere.
// Question: what does the current code do when a series is loaded without its join row, and does the code say what it should do?
// This file is NOT part of the test suite. It is run from outside the repo against the compiled server.
// Usage: REPO_ROOT=<repo> npx mocha <this file>
const path = require('path')
const root = process.env.REPO_ROOT
const { expect } = require(path.join(root, 'node_modules/chai'))
const { Sequelize } = require(path.join(root, 'node_modules/sequelize'))
const Database = require(path.join(root, 'dist-server/server/Database'))

describe('PROBE Book and a series loaded without its bookSeries join row (current code, no fix)', () => {
  let bookId
  let libraryId

  /**
   * @param {string[]} throughAttributes attributes of the join row to load; [] loads no join row
   */
  function loadBook(throughAttributes) {
    return Database.bookModel.findByPk(bookId, {
      include: [
        { model: Database.authorModel, through: { attributes: [] } },
        { model: Database.seriesModel, through: { attributes: throughAttributes } }
      ]
    })
  }

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const library = await Database.libraryModel.create({ name: 'Books', mediaType: 'book' })
    libraryId = library.id
    const book = await Database.bookModel.create({ title: 'Test Book', audioFiles: [], tags: [], narrators: [], genres: [], chapters: [] })
    bookId = book.id
    const series = await Database.seriesModel.create({ name: 'Test Series', libraryId })
    await Database.bookSeriesModel.create({ bookId, seriesId: series.id, sequence: '2' })
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('with the join row loaded (the include of every expanded query): the old metadata has the sequence', async () => {
    const book = await loadBook(['sequence'])
    expect(book.series[0].bookSeries.sequence).to.equal('2')
    expect(book.oldMetadataToJSON().series).to.deep.equal([{ id: book.series[0].id, name: 'Test Series', sequence: '2' }])
  })

  it('without the join row (through: { attributes: [] }): series[0].bookSeries is undefined', async () => {
    const book = await loadBook([])
    expect(book.series).to.have.lengthOf(1)
    expect(book.series[0].bookSeries).to.be.undefined
  })

  it('without the join row: the guarded reads work and report the series as having no sequence', async () => {
    const book = await loadBook([])
    expect(book.seriesName).to.equal('Test Series')
    expect(book.oldMetadataToJSONMinified().seriesName).to.equal('Test Series')
    expect(book.getAbsMetadataJson().series).to.deep.equal(['Test Series'])
  })

  it('without the join row: oldMetadataToJSON() throws a TypeError (Book.ts:686, the reported line)', async () => {
    const book = await loadBook([])
    expect(() => book.oldMetadataToJSON()).to.throw(TypeError, "Cannot read properties of undefined (reading 'sequence')")
  })

  it('without the join row: updateSeriesFromRequest() rejects with a TypeError (Book.ts:651, the other reported lines)', async () => {
    const book = await loadBook([])
    let error = null
    try {
      await book.updateSeriesFromRequest([{ name: 'Test Series', sequence: '3' }], libraryId)
    } catch (err) {
      error = err
    }
    expect(error).to.be.instanceOf(TypeError)
    expect(error.message).to.equal("Cannot read properties of undefined (reading 'sequence')")
  })

  it('for comparison: toOldJSON() throws on purpose when a required include is missing', async () => {
    const book = await Database.bookModel.findByPk(bookId)
    expect(() => book.toOldJSON('some-library-item-id')).to.throw('[Book] Cannot convert to old JSON because authors are not loaded')
  })
})
