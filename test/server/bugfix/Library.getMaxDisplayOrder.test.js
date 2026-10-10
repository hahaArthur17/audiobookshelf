const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

describe('Library.getMaxDisplayOrder', () => {
  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('returns the largest display order of the libraries', async () => {
    await Database.libraryModel.create({ name: 'First', mediaType: 'book', displayOrder: 1 })
    await Database.libraryModel.create({ name: 'Third', mediaType: 'podcast', displayOrder: 3 })

    expect(await Database.libraryModel.getMaxDisplayOrder()).to.equal(3)
  })

  it('returns 0 when there is no library', async () => {
    expect(await Database.libraryModel.getMaxDisplayOrder()).to.equal(0)
  })
})
