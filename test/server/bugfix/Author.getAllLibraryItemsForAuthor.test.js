const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

describe('Author.getAllLibraryItemsForAuthor', () => {
  let authorId
  let libraryItemId

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const library = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    const libraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId: library.id })

    const book = await Database.bookModel.create({
      title: 'Test Book',
      audioFiles: [],
      tags: [],
      narrators: [],
      genres: [],
      chapters: []
    })
    const libraryItem = await Database.libraryItemModel.create({
      libraryFiles: [],
      mediaId: book.id,
      mediaType: 'book',
      libraryId: library.id,
      libraryFolderId: libraryFolder.id
    })
    libraryItemId = libraryItem.id

    const author = await Database.authorModel.create({ name: 'Test Author', libraryId: library.id })
    await Database.bookAuthorModel.create({ bookId: book.id, authorId: author.id })
    authorId = author.id
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('returns the library items of a known author', async () => {
    const libraryItems = await Database.authorModel.getAllLibraryItemsForAuthor(authorId)

    expect(libraryItems).to.have.lengthOf(1)
    expect(libraryItems[0].id).to.equal(libraryItemId)
    expect(libraryItems[0].media.title).to.equal('Test Book')
  })

  it('returns an empty array for an unknown author id', async () => {
    const libraryItems = await Database.authorModel.getAllLibraryItemsForAuthor('00000000-0000-0000-0000-000000000000')

    expect(libraryItems).to.deep.equal([])
  })
})
