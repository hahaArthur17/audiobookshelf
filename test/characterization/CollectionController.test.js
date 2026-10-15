const { expect } = require('chai')
const { startApi } = require('./helpers/harness')
const { matchSnapshot } = require('./helpers/snapshot')
const Database = require('../../server/Database')
const { createLibrary, createBook } = require('./helpers/seed-library')

// Reference characterization test: every route of one controller, as different users, snapshotting status, body and side effects.
describe('CollectionController (characterization)', () => {
  let api, lf, other, items

  beforeEach(async () => {
    api = await startApi()
    await api.seed.users()
    lf = await createLibrary({ name: 'Books' })
    other = await createLibrary({ name: 'Other', path: '/test/other' })
    items = []
    for (const title of ['Book A', 'Book B', 'Book C']) items.push((await createBook(lf, { title, authors: ['Ann Author'] })).libraryItem)
    items.push((await createBook(other, { title: 'Elsewhere' })).libraryItem)
  })

  afterEach(async () => {
    await api.stop()
  })

  // one snapshot per call: status + body + what was emitted since the last call
  const snap = (ctx, res, label) => {
    const emitted = api.emitted.splice(0)
    matchSnapshot(ctx, { res, emitted }, { label, ids: ctx.ids })
  }
  const createCollection = (as = 'admin', over = {}) => api.request('POST', '/api/collections', { as, json: { libraryId: lf.library.id, name: 'Favourites', description: 'my picks', books: [items[0].id, items[1].id], ...over } })

  describe('POST /api/collections', () => {
    it('requires authentication', async function () {
      snap(this, await api.request('POST', '/api/collections', { json: {} }))
    })
    it('rejects invalid bodies', async function () {
      this.ids = new Map()
      snap(this, await createCollection('admin', { name: '' }), 'empty name')
      snap(this, await createCollection('admin', { libraryId: undefined }), 'no library')
      snap(this, await createCollection('admin', { books: [] }), 'no books')
      snap(this, await createCollection('admin', { description: 5 }), 'bad description')
    })
    it('strips html from the name', async function () {
      snap(this, await createCollection('admin', { name: '<b>Bold</b> name' }))
    })
    it('ignores items from another library', async function () {
      this.ids = new Map()
      snap(this, await createCollection('admin', { books: [items[0].id, items[3].id] }))
    })
    it('creates a collection as admin, user and guest', async function () {
      this.ids = new Map()
      snap(this, await createCollection('admin'), 'admin')
      snap(this, await createCollection('user', { name: 'User collection' }), 'user')
      snap(this, await createCollection('guest', { name: 'Guest collection' }), 'guest')
    })
  })

  describe('read routes', () => {
    it('lists, finds and 404s', async function () {
      this.ids = new Map()
      const { body: created } = await createCollection('admin')
      api.emitted.splice(0)
      snap(this, await api.request('GET', '/api/collections', { as: 'admin' }), 'list')
      snap(this, await api.request('GET', `/api/collections/${created.id}`, { as: 'admin' }), 'find')
      snap(this, await api.request('GET', `/api/collections/${created.id}?include=rssfeed`, { as: 'admin' }), 'find include rssfeed')
      snap(this, await api.request('GET', '/api/collections/not-a-real-id', { as: 'admin' }), 'unknown id')
      snap(this, await api.request('GET', `/api/libraries/${lf.library.id}/collections`, { as: 'admin' }), 'library collections')
    })
  })

  describe('modify routes', () => {
    let collection
    beforeEach(async function () {
      collection = (await createCollection('admin')).body
      api.emitted.splice(0)
    })

    it('updates name, description and book order', async function () {
      this.ids = new Map([[collection.id, '<collection>']])
      snap(this, await api.request('PATCH', `/api/collections/${collection.id}`, { as: 'admin', json: { name: 'Renamed', description: 'new', books: [items[1].id, items[0].id] } }), 'full update')
      snap(this, await api.request('PATCH', `/api/collections/${collection.id}`, { as: 'admin', json: { description: 'x'.repeat(5) } }), 'partial update')
      snap(this, await api.request('PATCH', `/api/collections/${collection.id}`, { as: 'admin', json: {} }), 'no changes')
    })
    it('adds and removes single books', async function () {
      this.ids = new Map([[collection.id, '<collection>']])
      snap(this, await api.request('POST', `/api/collections/${collection.id}/book`, { as: 'admin', json: { id: items[2].id } }), 'add')
      snap(this, await api.request('POST', `/api/collections/${collection.id}/book`, { as: 'admin', json: { id: items[2].id } }), 'add again')
      snap(this, await api.request('POST', `/api/collections/${collection.id}/book`, { as: 'admin', json: { id: 'nope' } }), 'add unknown')
      snap(this, await api.request('DELETE', `/api/collections/${collection.id}/book/${items[2].id}`, { as: 'admin' }), 'remove')
      snap(this, await api.request('DELETE', `/api/collections/${collection.id}/book/${items[2].id}`, { as: 'admin' }), 'remove again')
    })
    it('adds and removes batches', async function () {
      this.ids = new Map([[collection.id, '<collection>']])
      snap(this, await api.request('POST', `/api/collections/${collection.id}/batch/add`, { as: 'admin', json: { books: [items[1].id, items[2].id] } }), 'batch add')
      // an empty list is rejected with the same 400 as any invalid body (controller requires a non-empty array)
      snap(this, await api.request('POST', `/api/collections/${collection.id}/batch/add`, { as: 'admin', json: { books: [] } }), 'batch add empty')
      snap(this, await api.request('POST', `/api/collections/${collection.id}/batch/remove`, { as: 'admin', json: { books: [items[0].id, items[2].id] } }), 'batch remove')
      snap(this, await api.request('POST', `/api/collections/${collection.id}/batch/remove`, { as: 'admin', json: {} }), 'batch remove invalid')
    })
    it('checks permissions', async function () {
      this.ids = new Map([[collection.id, '<collection>']])
      for (const as of ['user', 'guest']) {
        snap(this, await api.request('PATCH', `/api/collections/${collection.id}`, { as, json: { name: 'Hacked' } }), `${as} update`)
        snap(this, await api.request('POST', `/api/collections/${collection.id}/book`, { as, json: { id: items[2].id } }), `${as} add`)
        snap(this, await api.request('DELETE', `/api/collections/${collection.id}`, { as }), `${as} delete`)
      }
    })
    it('deletes and 404s afterwards', async function () {
      this.ids = new Map([[collection.id, '<collection>']])
      snap(this, await api.request('DELETE', `/api/collections/${collection.id}`, { as: 'admin' }), 'admin is not allowed')
      snap(this, await api.request('DELETE', `/api/collections/${collection.id}`, { as: 'root' }), 'root deletes')
      snap(this, await api.request('GET', `/api/collections/${collection.id}`, { as: 'root' }), 'find after delete')
      snap(this, await api.request('DELETE', `/api/collections/${collection.id}`, { as: 'root' }), 'delete again')
    })
  })
  // Tag restrictions (User.checkCanAccessLibraryItemWithTags): an allowlist user (selectedTagsNotAccessible=false) only sees items with
  // at least one selected tag; a denylist user (true) sees items unless ALL their tags are selected. Same method guards item GET,
  // collection list/detail (Collection.js) and the other listings.
  describe('tag restricted users', () => {
    let tagged, collection
    const TAGS = { untagged: [], good: ['good'], mixed: ['good', 'bad'], bad: ['bad'] }
    const setTags = async (username, perms) => {
      const row = await Database.userModel.findOne({ where: { username } })
      await row.update({ permissions: { ...row.permissions, accessAllTags: false, ...perms } })
    }
    const mkUser = async (username, perms) => {
      const permissions = Database.userModel.getDefaultPermissionsForUserType('user')
      await Database.userModel.create({ username, pash: 'hash', token: `token-${username}`, type: 'user', isActive: true, permissions, bookmarks: [], extraData: { seriesHideFromContinueListening: [] } })
      await setTags(username, perms)
    }

    beforeEach(async function () {
      tagged = {}
      for (const [key, tags] of Object.entries(TAGS)) tagged[key] = (await createBook(lf, { title: `Tag ${key}`, extra: { tags, explicit: false } })).libraryItem
      await mkUser('allow', { selectedTagsNotAccessible: false, itemTagsSelected: ['good'] })
      await mkUser('deny', { selectedTagsNotAccessible: true, itemTagsSelected: ['bad'] })
      const res = await api.request('POST', '/api/collections', { as: 'admin', json: { libraryId: lf.library.id, name: 'Tagged', books: Object.values(tagged).map((i) => i.id) } })
      collection = res.body
      api.emitted.splice(0)
    })
    const tagIds = () => new Map([[collection.id, '<collection>'], ...Object.entries(tagged).map(([k, i]) => [i.id, `<${k}>`])])

    for (const username of ['admin', 'allow', 'deny']) {
      it(`item GET as ${username}`, async function () {
        this.ids = tagIds()
        for (const key of Object.keys(TAGS)) snap(this, await api.request('GET', `/api/items/${tagged[key].id}`, { as: username }), key)
      })
      it(`library item list as ${username}`, async function () {
        this.ids = tagIds()
        snap(this, await api.request('GET', `/api/libraries/${lf.library.id}/items?minified=1&sort=media.metadata.title`, { as: username }), 'items')
      })
      it(`collections as ${username}`, async function () {
        this.ids = tagIds()
        snap(this, await api.request('GET', '/api/collections', { as: username }), 'list')
        snap(this, await api.request('GET', `/api/collections/${collection.id}`, { as: username }), 'find')
        snap(this, await api.request('GET', `/api/libraries/${lf.library.id}/collections`, { as: username }), 'library collections')
      })
    }
  })
  // Library access (GET /api/collections drops collections of libraries the user cannot access) and the stored collectionBook `order`
  describe('library access and book order', () => {
    const mkRestricted = async (username, libraryIds) => {
      const permissions = Database.userModel.getDefaultPermissionsForUserType('user')
      const row = await Database.userModel.create({ username, pash: 'hash', token: `token-${username}`, type: 'user', isActive: true, permissions, bookmarks: [], extraData: { seriesHideFromContinueListening: [] } })
      // instance update: the static update leaves the cached user stale
      await row.update({ permissions: { ...row.permissions, accessAllLibraries: false, librariesAccessible: libraryIds } })
    }
    const orderRows = async (collectionId) => {
      const rows = await Database.collectionBookModel.findAll({ where: { collectionId }, order: [['order', 'ASC'], ['id', 'ASC']] })
      return rows.map((r) => ({ item: ['A', 'B', 'C', 'Elsewhere'][items.findIndex((i) => i.mediaId === r.bookId)], order: r.order }))
    }
    const names = (res) => res.body.collections.map((c) => c.name).sort()

    it('lists only collections of accessible libraries', async function () {
      await mkRestricted('restricted', [lf.library.id])
      await mkRestricted('otherOnly', [other.library.id])
      const a = await createCollection('admin', { name: 'In Books' })
      const b = await createCollection('admin', { libraryId: other.library.id, name: 'In Other', books: [items[3].id] })
      expect(a.status).to.equal(200)
      expect(b.status).to.equal(200)
      const lists = {}
      for (const as of ['admin', 'user', 'restricted', 'otherOnly']) {
        const res = await api.request('GET', '/api/collections', { as })
        expect(res.status).to.equal(200)
        lists[as] = names(res)
      }
      expect(lists.admin).to.deep.equal(['In Books', 'In Other'])
      expect(lists.user).to.deep.equal(['In Books', 'In Other'])
      expect(lists.restricted).to.deep.equal(['In Books'])
      expect(lists.otherOnly).to.deep.equal(['In Other'])
      matchSnapshot(this, lists)
    })
    it('stores 1-based order on create and rewrites it on batch add, remove and reorder', async function () {
      const created = await createCollection('admin', { books: [items[2].id, items[0].id, items[1].id] })
      expect(created.status).to.equal(200)
      const id = created.body.id
      const steps = { created: await orderRows(id) }
      let res = await api.request('POST', `/api/collections/${id}/batch/add`, { as: 'admin', json: { books: [items[0].id] } })
      steps.batchAddExisting = { status: res.status, rows: await orderRows(id) }
      res = await api.request('POST', `/api/collections/${id}/batch/remove`, { as: 'admin', json: { books: [items[0].id] } })
      steps.batchRemoveMiddle = { status: res.status, rows: await orderRows(id) }
      res = await api.request('POST', `/api/collections/${id}/batch/add`, { as: 'admin', json: { books: [items[0].id] } })
      steps.batchAddBack = { status: res.status, rows: await orderRows(id) }
      res = await api.request('POST', `/api/collections/${id}/book`, { as: 'admin', json: { id: items[2].id } })
      steps.singleAddExisting = { status: res.status, rows: await orderRows(id) }
      res = await api.request('PATCH', `/api/collections/${id}`, { as: 'admin', json: { books: [items[1].id, items[0].id, items[2].id] } })
      steps.reorder = { status: res.status, rows: await orderRows(id) }
      res = await api.request('DELETE', `/api/collections/${id}/book/${items[1].id}`, { as: 'admin' })
      steps.singleRemoveFirst = { status: res.status, rows: await orderRows(id) }
      expect(steps.created).to.deep.equal([{ item: 'C', order: 1 }, { item: 'A', order: 2 }, { item: 'B', order: 3 }])
      matchSnapshot(this, steps)
    })
  })
})
