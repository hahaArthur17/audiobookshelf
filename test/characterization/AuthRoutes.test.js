const { expect } = require('chai')
const { startAuthApi } = require('./helpers/auth-harness')
const { matchSnapshot } = require('./helpers/snapshot')

// Real passport (local + jwt strategies), TokenManager and Auth.initAuthRoutes on in-memory SQLite, wired as in Server.js.
// The controller suites use a stub login instead, so this is the only place real token handling is pinned.
// OpenID is not configured (authActiveAuthMethods defaults to local), so only the routes' behaviour without a provider is recorded.
describe('Auth routes (characterization)', () => {
  let api
  const pass = (u) => `${u}-pass`
  const login = (username, password, headers) => api.authRequest('POST', '/login', { json: { username, password }, headers })
  const cookieOf = (res, name) => (res.cookies.find((c) => c.startsWith(`${name}=`)) || '').split(';')[0]
  // cookie values are random/JWTs: keep name, attributes and whether the value is empty
  // the server settings in login responses hold the random temp dir of the test and an environment-dependent logLevel
  const maskTmp = (v) => {
    const out = JSON.parse(JSON.stringify(v ?? null).replace(/[^"\\]*abs-char-[A-Za-z0-9]+/g, '<tmp>'))
    // the default logLevel setting is read from the Logger singleton, which depends on dev/prod mode
    if (out?.serverSettings?.logLevel !== undefined) out.serverSettings.logLevel = '<env>'
    // the default timeZone setting is the machine's (process.env.TZ)
    if (out?.serverSettings?.timeZone !== undefined) out.serverSettings.timeZone = '<env>'
    return out
  }
  const scrub = (res) => ({
    status: res.status,
    location: res.headers.location,
    body: maskTmp(res.body),
    cookies: res.cookies.map((c) => {
      const [nv, ...attrs] = c.split('; ')
      const [name, value] = [nv.slice(0, nv.indexOf('=')), nv.slice(nv.indexOf('=') + 1)]
      return { name, value: value === '' ? '' : '<value>', attrs: attrs.filter((a) => !/^Expires=/i.test(a)) }
    })
  })

  beforeEach(async () => {
    api = await startAuthApi()
    await api.seedAuthUsers()
  })
  afterEach(async () => {
    await api.stop()
  })

  describe('POST /login', () => {
    it('logs in with a valid password and sets the refresh cookie', async function () {
      const res = await login('root', pass('root'))
      matchSnapshot(this, scrub(res))
      expect(res.body.user.accessToken).to.be.a('string')
      expect(res.body.user.refreshToken).to.equal(null)
    })

    it('returns the refresh token in the body (no cookie) when x-return-tokens is true', async function () {
      const res = await login('root', pass('root'), { 'x-return-tokens': 'true' })
      matchSnapshot(this, scrub(res))
      expect(res.body.user.refreshToken).to.be.a('string')
      expect(cookieOf(res, 'refresh_token')).to.equal('')
    })

    it('rejects a wrong password, an unknown user and a missing body with 401', async function () {
      const wrong = await login('root', 'nope')
      const unknown = await login('nobody', 'nope')
      const empty = await api.authRequest('POST', '/login', { json: {} })
      const noBody = await api.authRequest('POST', '/login')
      matchSnapshot(this, { wrong: scrub(wrong), unknown: scrub(unknown), empty: scrub(empty), noBody: scrub(noBody) })
    })

    it('rejects an inactive user', async function () {
      const Database = require('../../server/Database')
      await Database.userModel.update({ isActive: false }, { where: { username: 'user' } })
      const res = await login('user', pass('user'))
      matchSnapshot(this, scrub(res))
    })
  })

  describe('bearer authentication on /api', () => {
    it('accepts the access token as a bearer header and as ?token=', async function () {
      const { body } = await login('admin', pass('admin'))
      const token = body.user.accessToken
      const header = await api.authRequest('GET', '/api/libraries', { bearer: token })
      const query = await api.authRequest('GET', `/api/libraries?token=${token}`)
      matchSnapshot(this, { header: scrub(header), query: scrub(query) })
    })

    it('rejects missing, malformed and wrongly signed tokens with 401', async function () {
      const jwt = require('jsonwebtoken')
      const { body } = await login('admin', pass('admin'))
      const forged = jwt.sign({ userId: body.user.id, username: 'admin' }, 'some-other-secret')
      const results = {
        none: await api.authRequest('GET', '/api/libraries'),
        garbage: await api.authRequest('GET', '/api/libraries', { bearer: 'garbage' }),
        forged: await api.authRequest('GET', '/api/libraries', { bearer: forged })
      }
      matchSnapshot(this, Object.fromEntries(Object.entries(results).map(([k, v]) => [k, scrub(v)])))
    })

    describe('real credentials through passport jwtAuthCheck', () => {
      const crypto = require('crypto')
      const jwt = require('jsonwebtoken')
      const Database = require('../../server/Database')
      const SECRET = 'characterization-test-secret'
      const me = async (token) => scrub(await api.authRequest('GET', '/api/me', { bearer: token }))
      const makeKey = async (users, name, o = {}) => {
        const id = crypto.randomUUID()
        const payload = { keyId: id, name, type: 'api' }
        if (o.expSecondsAgo) payload.exp = Math.floor(Date.now() / 1000) - o.expSecondsAgo
        const token = jwt.sign(payload, SECRET)
        const key = await Database.apiKeyModel.create({ id, name, userId: users.user.id, isActive: o.isActive ?? true, expiresAt: null, createdByUserId: users.admin.id, permissions: Database.apiKeyModel.getDefaultPermissions() })
        return { key, token }
      }

      it('api key bearer: active works; inactive, expired, unknown and inactive-owner keys are rejected', async function () {
        const users = await Database.userModel.findAll()
        const byName = Object.fromEntries(users.map((u) => [u.username, u]))
        const active = await makeKey(byName, 'active')
        const inactive = await makeKey(byName, 'inactive', { isActive: false })
        const expired = await makeKey(byName, 'expired', { expSecondsAgo: 60 })
        const unknown = jwt.sign({ keyId: crypto.randomUUID(), name: 'ghost', type: 'api' }, SECRET)
        const results = {
          active: await me(active.token),
          inactive: await me(inactive.token),
          expired: await me(expired.token),
          unknown: await me(unknown)
        }
        // an expired key is also deactivated as a side effect
        const expiredRow = await Database.apiKeyModel.findByPk(expired.key.id)
        const activeRow = await Database.apiKeyModel.findByPk(active.key.id)
        // owner deactivated: the previously working key is now rejected
        // instance update: it invalidates the user cache (the static Model.update does not, so a cached user would stay active)
        await byName.user.update({ isActive: false })
        results.ownerInactive = await me(active.token)
        matchSnapshot(this, { results, expiredKeyActiveAfter: expiredRow.isActive, activeKeyActiveAfter: activeRow.isActive })
        expect(results.active.status).to.equal(200)
        expect(results.active.body.username).to.equal('user')
      })

      it('expired access token is rejected, a fresh one is accepted', async function () {
        const users = await Database.userModel.findAll()
        const user = users.find((u) => u.username === 'user')
        const mk = (o) => jwt.sign({ userId: user.id, username: user.username, type: 'access' }, SECRET, o)
        const results = { valid: await me(mk({ expiresIn: 600 })), expired: await me(mk({ expiresIn: -60 })) }
        matchSnapshot(this, results)
        expect(results.valid.status).to.equal(200)
        expect(results.valid.body.username).to.equal('user')
      })

      it('valid access token of an inactive user is rejected', async function () {
        const { body } = await login('user', pass('user'))
        const token = body.user.accessToken
        const before = await me(token)
        const row = await Database.userModel.findOne({ where: { username: 'user' } })
        await row.update({ isActive: false })
        const after = await me(token)
        matchSnapshot(this, { before, after })
        expect(before.status).to.equal(200)
      })

      it('a refresh token used as bearer is rejected', async function () {
        const { body } = await login('user', pass('user'), { 'x-return-tokens': 'true' })
        matchSnapshot(this, await me(body.user.refreshToken))
      })
    })

    it('lets cover and author image GETs through without authentication', async function () {
      const cover = await api.authRequest('GET', '/api/items/does-not-exist/cover')
      const image = await api.authRequest('GET', '/api/authors/does-not-exist/image')
      const post = await api.authRequest('POST', '/api/items/does-not-exist/cover')
      matchSnapshot(this, { cover: scrub(cover), image: scrub(image), post: scrub(post) })
    })
  })

  describe('POST /auth/refresh', () => {
    it('401s without a refresh token', async function () {
      matchSnapshot(this, scrub(await api.authRequest('POST', '/auth/refresh')))
    })

    it('401s for an invalid refresh token', async function () {
      const cookie = await api.authRequest('POST', '/auth/refresh', { cookie: 'refresh_token=garbage' })
      const header = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': 'garbage' } })
      matchSnapshot(this, { cookie: scrub(cookie), header: scrub(header) })
    })

    it('issues a new access token from the cookie and keeps the refresh token out of the body', async function () {
      const first = await login('root', pass('root'))
      const res = await api.authRequest('POST', '/auth/refresh', { cookie: cookieOf(first, 'refresh_token') })
      matchSnapshot(this, scrub(res))
      expect(res.body.user.refreshToken).to.equal(null)
      const works = await api.authRequest('GET', '/api/libraries', { bearer: res.body.user.accessToken })
      expect(works.status).to.equal(200)
    })

    it('uses x-refresh-token over the cookie and returns the refresh token in the body', async function () {
      const first = await login('root', pass('root'), { 'x-return-tokens': 'true' })
      const res = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': first.body.user.refreshToken } })
      matchSnapshot(this, scrub(res))
      expect(res.body.user.refreshToken).to.be.a('string')
    })

    it('records whether the same refresh token can be used twice', async function () {
      const first = await login('root', pass('root'), { 'x-return-tokens': 'true' })
      const token = first.body.user.refreshToken
      const one = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': token } })
      const two = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': token } })
      matchSnapshot(this, { one: one.status, two: two.status, twoBody: two.status === 200 ? '<ok>' : two.body })
    })
  })

  describe('POST /logout', () => {
    it('clears the cookies and returns a null redirect_url', async function () {
      const first = await login('root', pass('root'))
      const res = await api.authRequest('POST', '/logout', { cookie: cookieOf(first, 'refresh_token') })
      matchSnapshot(this, scrub(res))
    })

    it('invalidates the refresh token', async function () {
      const first = await login('root', pass('root'))
      const cookie = cookieOf(first, 'refresh_token')
      await api.authRequest('POST', '/logout', { cookie })
      const res = await api.authRequest('POST', '/auth/refresh', { cookie })
      matchSnapshot(this, scrub(res))
    })

    it('works without a refresh token', async function () {
      matchSnapshot(this, scrub(await api.authRequest('POST', '/logout')))
    })

    it('allDevices=1 invalidates every session of the user', async function () {
      const a = await login('root', pass('root'), { 'x-return-tokens': 'true' })
      const b = await login('root', pass('root'), { 'x-return-tokens': 'true' })
      const out = await api.authRequest('POST', '/logout?allDevices=1', { headers: { 'x-refresh-token': a.body.user.refreshToken } })
      const refreshA = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': a.body.user.refreshToken } })
      const refreshB = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': b.body.user.refreshToken } })
      matchSnapshot(this, { out: scrub(out), refreshA: scrub(refreshA), refreshB: scrub(refreshB) })
    })
  })

  describe('openid routes without a configured provider', () => {
    it('GET /auth/openid/config requires an admin and an issuer', async function () {
      const root = await login('root', pass('root'))
      const user = await login('user', pass('user'))
      const noAuth = await api.authRequest('GET', '/auth/openid/config?issuer=http://x')
      const asUser = await api.authRequest('GET', '/auth/openid/config?issuer=http://x', { bearer: user.body.user.accessToken })
      const noIssuer = await api.authRequest('GET', '/auth/openid/config', { bearer: root.body.user.accessToken })
      matchSnapshot(this, { noAuth: scrub(noAuth), asUser: scrub(asUser), noIssuer: scrub(noIssuer) })
    })
  })
})
