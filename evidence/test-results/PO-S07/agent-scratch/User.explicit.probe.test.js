// PO-S07 probe for the reported bug User.js:678 (checkCanAccessLibraryItem):
//   const libraryItemExplicit = !!libraryItem.media.explicit || !!libraryItem.media.metadata?.explicit
// Question: is there an input for which the current code gives a wrong answer?
// This file is NOT part of the test suite. It is run from outside the repo against the compiled server.
// Usage: npx mocha <this file>   (with REPO_ROOT set to the repo root)
const path = require('path')
const root = process.env.REPO_ROOT
const { expect } = require(path.join(root, 'node_modules/chai'))
const { Sequelize } = require(path.join(root, 'node_modules/sequelize'))
const Database = require(path.join(root, 'dist-server/server/Database'))

describe('PROBE User.checkCanAccessLibraryItem and explicit content (current code, no fix)', () => {
  let restrictedUser
  let unrestrictedUser
  let items

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const permissions = { accessAllLibraries: true, accessAllTags: true }
    restrictedUser = await Database.userModel.create({ username: 'restricted', type: 'user', isActive: true, permissions: { ...permissions, accessExplicitContent: false } })
    unrestrictedUser = await Database.userModel.create({ username: 'unrestricted', type: 'user', isActive: true, permissions: { ...permissions, accessExplicitContent: true } })

    const bookLibrary = await Database.libraryModel.create({ name: 'Books', mediaType: 'book' })
    const podcastLibrary = await Database.libraryModel.create({ name: 'Podcasts', mediaType: 'podcast' })
    items = {}
    for (const [key, explicit] of [
      ['cleanBook', false],
      ['explicitBook', true]
    ]) {
      const book = await Database.bookModel.create({ title: key, explicit, audioFiles: [], tags: [], narrators: [], genres: [], chapters: [] })
      const libraryItem = await Database.libraryItemModel.create({ libraryFiles: [], mediaId: book.id, mediaType: 'book', libraryId: bookLibrary.id })
      items[key] = await Database.libraryItemModel.getExpandedById(libraryItem.id)
    }
    for (const [key, explicit] of [
      ['cleanPodcast', false],
      ['explicitPodcast', true]
    ]) {
      const podcast = await Database.podcastModel.create({ title: key, explicit, tags: [], genres: [], autoDownloadEpisodes: false })
      const libraryItem = await Database.libraryItemModel.create({ libraryFiles: [], mediaId: podcast.id, mediaType: 'podcast', libraryId: podcastLibrary.id })
      items[key] = await Database.libraryItemModel.getExpandedById(libraryItem.id)
    }
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('a model instance never has media.metadata, so the second half of the test is always false for it', () => {
    for (const key of Object.keys(items)) {
      expect(items[key].media.metadata, key).to.be.undefined
    }
  })

  it('a user without explicit access is refused an explicit book and an explicit podcast (first half of the test)', () => {
    expect(restrictedUser.checkCanAccessLibraryItem(items.explicitBook)).to.be.false
    expect(restrictedUser.checkCanAccessLibraryItem(items.explicitPodcast)).to.be.false
  })

  it('a user without explicit access is allowed a clean book and a clean podcast', () => {
    expect(restrictedUser.checkCanAccessLibraryItem(items.cleanBook)).to.be.true
    expect(restrictedUser.checkCanAccessLibraryItem(items.cleanPodcast)).to.be.true
  })

  it('a user with explicit access is allowed all four', () => {
    for (const key of Object.keys(items)) {
      expect(unrestrictedUser.checkCanAccessLibraryItem(items[key]), key).to.be.true
    }
  })

  it('an object in the old shape (media.metadata.explicit) is still refused through the second half', () => {
    const oldShapeItem = { libraryId: items.cleanBook.libraryId, media: { metadata: { explicit: true }, tags: [] } }
    expect(restrictedUser.checkCanAccessLibraryItem(oldShapeItem)).to.be.false
    expect(unrestrictedUser.checkCanAccessLibraryItem(oldShapeItem)).to.be.true
  })
})
