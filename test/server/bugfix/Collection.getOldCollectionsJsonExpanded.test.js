const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

describe('Collection.getOldCollectionsJsonExpanded', () => {
  let libraryId
  let cleanLibraryItemId
  let explicitLibraryItemId
  let restrictedUser
  let unrestrictedUser

  /**
   * Create a book with its library item
   *
   * @param {string} title
   * @param {boolean} explicit
   * @param {string} libraryFolderId
   * @returns {Promise<{ bookId: string, libraryItemId: string }>}
   */
  async function createBookWithLibraryItem(title, explicit, libraryFolderId) {
    const book = await Database.bookModel.create({
      title,
      explicit,
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
      libraryId,
      libraryFolderId
    })
    return { bookId: book.id, libraryItemId: libraryItem.id }
  }

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const library = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    libraryId = library.id
    const libraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId })

    const cleanBook = await createBookWithLibraryItem('Clean Book', false, libraryFolder.id)
    const explicitBook = await createBookWithLibraryItem('Explicit Book', true, libraryFolder.id)
    cleanLibraryItemId = cleanBook.libraryItemId
    explicitLibraryItemId = explicitBook.libraryItemId

    const collection = await Database.collectionModel.create({ name: 'Test Collection', libraryId })
    await Database.collectionBookModel.create({ collectionId: collection.id, bookId: cleanBook.bookId, order: 1 })
    await Database.collectionBookModel.create({ collectionId: collection.id, bookId: explicitBook.bookId, order: 2 })

    const permissions = { accessAllLibraries: true, accessAllTags: true }
    restrictedUser = await Database.userModel.create({ username: 'restricted', type: 'user', isActive: true, permissions: { ...permissions, accessExplicitContent: false } })
    unrestrictedUser = await Database.userModel.create({ username: 'unrestricted', type: 'user', isActive: true, permissions: { ...permissions, accessExplicitContent: true } })
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('returns every book of the collection to a user who can access explicit content', async () => {
    const collections = await Database.collectionModel.getOldCollectionsJsonExpanded(unrestrictedUser, libraryId)

    expect(collections).to.have.lengthOf(1)
    expect(collections[0].books.map((li) => li.id)).to.deep.equal([cleanLibraryItemId, explicitLibraryItemId])
  })

  it('leaves out the books that the user is not allowed to access', async () => {
    const collections = await Database.collectionModel.getOldCollectionsJsonExpanded(restrictedUser, libraryId)

    expect(collections).to.have.lengthOf(1)
    expect(collections[0].books.map((li) => li.id)).to.deep.equal([cleanLibraryItemId])
  })

  it('does not store the filtered books on the Collection class', async () => {
    await Database.collectionModel.getOldCollectionsJsonExpanded(restrictedUser, libraryId)

    expect(Object.prototype.hasOwnProperty.call(Database.collectionModel, 'books')).to.be.false
  })
})
