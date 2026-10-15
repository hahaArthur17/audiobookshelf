const crypto = require('crypto')
const passport = require('passport')
const { expect } = require('chai')
const Database = require('../../server/Database')
const Logger = require('../../server/Logger')
const TokenManager = require('../../server/auth/TokenManager')
const { startAuthApi } = require('./helpers/auth-harness')
const { startFakeIdp } = require('./helpers/fake-idp')
const { matchSnapshot } = require('./helpers/snapshot')

// The OpenID Connect login flow (auth/OidcAuthStrategy + the /auth/openid* routes in Auth.js) against a fake identity provider
// (helpers/fake-idp.js) that speaks the real protocol: discovery, authorize redirect, token exchange with PKCE and client secret,
// signed id_token + JWKS, userinfo and end-session. openid-client and passport run for real; only the browser is simulated.
describe('OIDC flow (characterization)', function () {
  this.timeout(30000)

  let api = null
  let idp = null
  let jar = {}
  let users = null

  // User.createUserFromOpenIdUserInfo signs the new user's legacy token with the TokenManager the model module loaded (not the fresh copy the harness
  // configures), so give that one a secret too
  let savedSecret
  beforeEach(async () => {
    savedSecret = TokenManager.TokenSecret
    TokenManager.TokenSecret = 'characterization-test-secret'
    api = await startAuthApi()
    users = await api.seedAuthUsers()
    idp = await startFakeIdp()
    jar = {}
  })
  afterEach(async () => {
    passport.unuse('openid-client')
    await idp.stop()
    await api.stop()
    TokenManager.TokenSecret = savedSecret
  })

  /** apply authOpenID* server settings and (re)initialise the strategy the way PATCH /api/auth-settings does */
  const configure = (extra = {}, { settings = idp.settings(extra) } = {}) => {
    Object.assign(Database.serverSettings, settings)
    global.ServerSettings = Database.serverSettings.toJSON()
    api.auth.oidcAuthStrategy.unuse()
    api.auth.oidcAuthStrategy.init()
  }

  // ---- the simulated browser / app -------------------------------------------------------------------------------------------------
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  const storeCookies = (cookies) => {
    for (const c of cookies) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      const name = pair.slice(0, i)
      const value = pair.slice(i + 1)
      if (/Expires=Thu, 01 Jan 1970/.test(c) || value === '') delete jar[name]
      else jar[name] = value
    }
  }
  /** a request to ABS with the cookie jar; the jar learns the set-cookies */
  const abs = async (method, url, o = {}) => {
    const res = await api.authRequest(method, url, { ...o, cookie: o.cookie ?? cookieHeader() })
    storeCookies(res.cookies)
    return res
  }
  /** follows one redirect to the identity provider like a browser would (no cookies are shared with ABS) */
  const visitIdp = async (location) => {
    const res = await fetch(location, { redirect: 'manual' })
    return { status: res.status, location: res.headers.get('location') }
  }
  const toPath = (location) => {
    const u = new URL(location)
    return u.pathname + u.search
  }

  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('base64url')
  const portsMasked = (s) =>
    String(s)
      .split(`127.0.0.1:${idp.port}`)
      .join('<idp>')
      .split(`127.0.0.1%3A${idp.port}`)
      .join('<idp>')
      .split(`127.0.0.1:${new URL(api.authBase).port}`)
      .join('<abs>')
      .split(`127.0.0.1%3A${new URL(api.authBase).port}`)
      .join('<abs>')
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
  const maskUrl = (s) =>
    s === null || s === undefined
      ? s
      : portsMasked(s)
          .replace(/([?&](?:state|code_challenge|id_token_hint|accessToken|setToken))=[^&]*/g, '$1=<v>')
          .replace(/%3C|%3E/g, (m) => m)
  const maskCookie = (c) => c.replace(/^([^=]+)=[^;]*/, '$1=<v>').replace(/Expires=[^;]+/, 'Expires=<date>').replace(/Max-Age=\d+/, 'Max-Age=<n>')
  /** status, redirect target and cookies of an ABS response, with the random parts masked */
  const view = (res) => ({
    status: res.status,
    location: maskUrl(res.headers.location),
    body: res.status === 302 ? undefined : res.body && typeof res.body === 'object' ? bodyView(res.body) : typeof res.body === 'string' ? textView(res.body) : res.body,
    cookies: res.cookies.map(maskCookie)
  })
  // express' default error page: keep the message, drop the stack (file paths)
  const textView = (body) => {
    const m = body.match(/<pre>(.*?)<br>/s)
    return portsMasked(m ? `<error page> ${m[1].replace(/&quot;/g, '"')}` : body)
  }
  /** what the strategy and routes logged at error / warn level since the flow started (first line, masked) */
  const logged = () => {
    const lines = (stub) => stub.args.map((args) => portsMasked(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).split('\n')[0].replace(/\b1[6-9]\d{8}\b/g, '<epoch>'))
    const out = { errors: lines(Logger.error), warnings: lines(Logger.warn) }
    return out.errors.length || out.warnings.length ? out : undefined
  }
  const bodyView = (body) => {
    if (!body.user) return JSON.parse(portsMasked(JSON.stringify(body)))
    const u = body.user
    return { user: { username: u.username, type: u.type, hasAccessToken: !!u.accessToken, hasRefreshToken: !!u.refreshToken, refreshTokenIsNull: u.refreshToken === null }, userDefaultLibraryId: body.userDefaultLibraryId, hasServerSettings: !!body.serverSettings }
  }
  const authorizeView = (location) => {
    const u = new URL(location)
    return { origin: portsMasked(u.origin), path: u.pathname, params: Object.fromEntries([...u.searchParams].map(([k, v]) => [k, ['state', 'code_challenge'].includes(k) ? `<${k}>` : portsMasked(v)])) }
  }
  const tokenRequests = () =>
    idp.requests
      .filter((r) => r.endpoint === '/token')
      .map((r) => ({ method: r.method, authorization: r.headers.authorization ? 'Basic <client>' : undefined, form: { ...r.form, code_verifier: r.form?.code_verifier ? '<verifier>' : undefined, redirect_uri: portsMasked(r.form?.redirect_uri) } }))
  // instance update, so the model's user cache is invalidated (Model.update would leave a stale cached user behind)
  const patchUser = async (user, values) => (await Database.userModel.findByPk(user.id)).update(values)
  const userRow = async (username) => {
    const u = await Database.userModel.findOne({ where: { username } })
    return u ? { username: u.username, type: u.type, email: u.email, isActive: u.isActive, authOpenIDSub: u.extraData?.authOpenIDSub, hasPash: !!u.pash } : null
  }

  /** web flow: ABS login route -> identity provider -> ABS callback. Returns each hop. */
  const webFlow = async ({ query = 'callback=/login', preCallback } = {}) => {
    Logger.error.resetHistory()
    Logger.warn.resetHistory()
    const start = await abs('GET', `/auth/openid?${query}`)
    const hops = { start: view(start) }
    if (start.status !== 302) return hops
    hops.authorize = authorizeView(start.headers.location)
    const back = await visitIdp(start.headers.location)
    hops.idp = { status: back.status, location: maskUrl(back.location) }
    if (preCallback) await preCallback()
    const callback = await abs('GET', toPath(back.location))
    hops.callback = { ...view(callback), logged: logged() }
    return hops
  }

  /** mobile (API) flow: app starts the login with a PKCE challenge, the browser goes through the IdP and /mobile-redirect, the app calls the callback */
  const mobileFlow = async ({ redirectUri = 'audiobookshelf://oauth', state = 'app-state', verifier = 'v'.repeat(50), extraQuery = '' } = {}) => {
    const q = `redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${sha256(verifier)}&code_challenge_method=S256&response_type=code&state=${state}${extraQuery}`
    Logger.error.resetHistory()
    Logger.warn.resetHistory()
    const start = await abs('GET', `/auth/openid?${q}`)
    const hops = { start: view(start) }
    if (start.status !== 302) return hops
    hops.authorize = authorizeView(start.headers.location)
    const idpBack = await visitIdp(start.headers.location)
    hops.idp = { status: idpBack.status, location: maskUrl(idpBack.location) }
    const browser = await api.authRequest('GET', toPath(idpBack.location)) // the system browser: no cookies from the app
    hops.mobileRedirect = view(browser)
    const appUrl = new URL(browser.headers.location)
    const callback = await abs('GET', `/auth/openid/callback?code=${appUrl.searchParams.get('code')}&state=${appUrl.searchParams.get('state')}&code_verifier=${verifier}`)
    hops.callback = { ...view(callback), logged: logged() }
    hops.raw = { callback, idpBack, appUrl, challenge: sha256(verifier), verifier }
    return hops
  }

  describe('issuer config helper (GET /auth/openid/config)', () => {
    it('reads the discovery document of an issuer, keeping only the fields the settings page uses', async function () {
      const admin = await api.authRequest('POST', '/login', { json: { username: 'admin', password: 'admin-pass' } })
      const bearer = admin.body.user.accessToken
      const plain = await api.authRequest('GET', `/auth/openid/config?issuer=${encodeURIComponent(idp.base)}`, { bearer })
      const trailing = await api.authRequest('GET', `/auth/openid/config?issuer=${encodeURIComponent(idp.base + '/')}`, { bearer })
      idp.endSession = false
      const noLogout = await api.authRequest('GET', `/auth/openid/config?issuer=${encodeURIComponent(idp.base)}`, { bearer })
      const unreachable = await api.authRequest('GET', `/auth/openid/config?issuer=${encodeURIComponent('http://127.0.0.1:1')}`, { bearer })
      const notUrl = await api.authRequest('GET', `/auth/openid/config?issuer=${encodeURIComponent('not a url')}`, { bearer })
      const notHttp = await api.authRequest('GET', `/auth/openid/config?issuer=${encodeURIComponent('file:///etc')}`, { bearer })
      const arrayIssuer = await api.authRequest('GET', `/auth/openid/config?issuer=a&issuer=b`, { bearer })
      const out = { plain, trailing, noLogout, unreachable, notUrl, notHttp, arrayIssuer }
      for (const k of Object.keys(out)) out[k] = { status: out[k].status, body: typeof out[k].body === 'string' ? portsMasked(out[k].body) : JSON.parse(portsMasked(JSON.stringify(out[k].body))) }
      matchSnapshot(this, out)
      expect(Object.keys(plain.body)).to.not.include('extra_field_not_forwarded')
    })
  })

  describe('starting the login (GET /auth/openid)', () => {
    it('redirects the web flow to the authorization endpoint with state, PKCE and scope, and remembers the callback in cookies', async function () {
      configure()
      const hops = await webFlow({ query: 'callback=/audiobookshelf/login' })
      matchSnapshot(this, hops.start, { label: 'start' })
      matchSnapshot(this, hops.authorize, { label: 'authorize' })
      expect(Object.keys(jar).sort()).to.deep.equal(['auth_cb', 'auth_method', 'connect.sid'])
    })

    it('adds the group and advanced permissions claim names to the scope', async function () {
      configure({ authOpenIDGroupClaim: 'groups', authOpenIDAdvancedPermsClaim: 'abs_perms' })
      const start = await abs('GET', '/auth/openid?callback=/login')
      matchSnapshot(this, authorizeView(start.headers.location))
    })

    it('rejects a web login without a usable callback, with a state, or with another response_type', async function () {
      configure()
      const out = {}
      out.noCallback = view(await abs('GET', '/auth/openid'))
      out.foreignCallback = view(await abs('GET', '/auth/openid?callback=https://evil.example/x'))
      out.protocolRelative = view(await abs('GET', '/auth/openid?callback=//evil.example/x'))
      out.sameOriginAbsolute = view(await abs('GET', `/auth/openid?callback=${encodeURIComponent(api.authBase + '/login')}`))
      out.webWithState = view(await abs('GET', '/auth/openid?callback=/login&state=x'))
      out.responseTypeToken = view(await abs('GET', '/auth/openid?callback=/login&response_type=token'))
      for (const [k, v] of Object.entries(out)) matchSnapshot(this, { res: v }, { label: k })
    })

    it('does not set auth cookies when the callback is rejected', async function () {
      configure()
      const res = await abs('GET', '/auth/openid?callback=https://evil.example/x')
      expect(res.cookies.map((c) => c.split('=')[0])).to.not.include('auth_cb')
      matchSnapshot(this, view(res))
    })

    it('builds the redirect uri from authOpenIDSubfolderForRedirectURLs (and from the literal string "undefined" when it was never set)', async function () {
      configure({ authOpenIDSubfolderForRedirectURLs: '/audiobookshelf' })
      const withSubfolder = authorizeView((await abs('GET', '/auth/openid?callback=/login')).headers.location)
      configure({ authOpenIDSubfolderForRedirectURLs: undefined })
      const unset = authorizeView((await abs('GET', '/auth/openid?callback=/login')).headers.location)
      matchSnapshot(this, { withSubfolder: withSubfolder.params.redirect_uri, unset: unset.params.redirect_uri })
    })

    it('answers 500 when the openid settings are incomplete', async function () {
      configure({ authOpenIDTokenURL: null })
      const res = await abs('GET', '/auth/openid?callback=/login')
      matchSnapshot(this, { res: view(res) })
    })

    it('mobile flow: requires a whitelisted redirect_uri and a PKCE code_challenge (S256 only), and accepts a client state', async function () {
      configure()
      const out = {}
      const ch = sha256('x'.repeat(50))
      out.ok = view(await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&state=app-state`))
      out.okAuthorize = authorizeView((await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&state=app-state`)).headers.location)
      out.noRedirectUri = view(await abs('GET', `/auth/openid?code_challenge=${ch}`))
      out.notWhitelisted = view(await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('evil://x')}&code_challenge=${ch}`))
      out.noChallenge = view(await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&response_type=code`))
      out.plainMethod = view(await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&code_challenge_method=plain`))
      out.badResponseType = view(await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&response_type=token`))
      for (const [k, v] of Object.entries(out)) matchSnapshot(this, k === 'okAuthorize' ? v : { res: v }, { label: k })
    })

    it('mobile flow: the redirect uri whitelist can be a single "*"', async function () {
      configure({ authOpenIDMobileRedirectURIs: ['*'] })
      const ch = sha256('x'.repeat(50))
      const res = await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('anything://at-all')}&code_challenge=${ch}`)
      matchSnapshot(this, { res: view(res), authorize: authorizeView(res.headers.location) })
    })
  })

  describe('mobile redirect (GET /auth/openid/mobile-redirect)', () => {
    it('forwards code and state to the app redirect uri once, and refuses unknown or reused state', async function () {
      configure()
      const ch = sha256('x'.repeat(50))
      const start = await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&state=s-1`)
      expect(start.status).to.equal(302)
      const out = {}
      out.noState = view(await api.authRequest('GET', '/auth/openid/mobile-redirect?code=c'))
      out.unknownState = view(await api.authRequest('GET', '/auth/openid/mobile-redirect?code=c&state=nope'))
      out.ok = view(await api.authRequest('GET', '/auth/openid/mobile-redirect?code=a%20b&state=s-1'))
      out.reused = view(await api.authRequest('GET', '/auth/openid/mobile-redirect?code=c&state=s-1'))
      for (const [k, v] of Object.entries(out)) matchSnapshot(this, { res: v }, { label: k })
    })

    it('forwards "undefined" as the code when none is sent', async function () {
      configure()
      const ch = sha256('x'.repeat(50))
      await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&state=s-2`)
      matchSnapshot(this, { res: view(await api.authRequest('GET', '/auth/openid/mobile-redirect?state=s-2')) })
    })

    it('generates its own state for the mobile flow when the app sends none', async function () {
      configure()
      const ch = sha256('x'.repeat(50))
      const start = await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}`)
      const generated = new URL(start.headers.location).searchParams.get('state')
      expect(generated).to.be.a('string').with.length.greaterThan(10)
      const res = await api.authRequest('GET', `/auth/openid/mobile-redirect?code=c&state=${generated}`)
      matchSnapshot(this, { res: view(res) })
    })
  })

  describe('web login callback', () => {
    it('logs in an existing user matched by the sub claim and redirects to the callback with the tokens', async function () {
      configure()
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const hops = await webFlow({ query: 'callback=/audiobookshelf/login' })
      matchSnapshot(this, hops.idp, { label: 'idp' })
      matchSnapshot(this, hops.callback, { label: 'callback' })
      matchSnapshot(this, tokenRequests(), { label: 'tokenRequests' })
      expect(hops.callback.status).to.equal(302)
    })

    it('uses the access token from the redirect as a working bearer token and sets the refresh and id token cookies', async function () {
      configure()
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const start = await abs('GET', '/auth/openid?callback=/login')
      const back = await visitIdp(start.headers.location)
      const callback = await abs('GET', toPath(back.location))
      const target = new URL(callback.headers.location, 'http://x')
      const accessToken = target.searchParams.get('accessToken')
      const me = await api.authRequest('GET', '/api/me', { bearer: accessToken })
      matchSnapshot(this, { redirectPath: target.pathname, paramNames: [...target.searchParams.keys()], setTokenIsJwt: /^[\w-]+\.[\w-]+\.[\w-]+$/.test(target.searchParams.get('setToken')), me: { status: me.status, username: me.body?.username, type: me.body?.type }, cookieNames: Object.keys(jar).sort() })
    })

    it('answers 400 "No session" when the callback is called without a login attempt, and 400 when the callback cookie has expired', async function () {
      configure()
      const noSession = await abs('GET', '/auth/openid/callback?code=c&state=s')
      matchSnapshot(this, { res: view(noSession) }, { label: 'noSession' })
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const start = await abs('GET', '/auth/openid?callback=/login')
      const back = await visitIdp(start.headers.location)
      delete jar.auth_cb
      const noCb = await abs('GET', toPath(back.location))
      matchSnapshot(this, { res: view(noCb) }, { label: 'noCallbackCookie' })
    })

    it('redirects to /login with an error when the provider denies access', async function () {
      configure()
      idp.denyAuthorize = true
      const hops = await webFlow()
      matchSnapshot(this, hops.callback)
    })

    it('redirects to /login with "Error in callback" when the state does not match, the code is unknown, or the token endpoint fails', async function () {
      configure()
      const out = {}
      const start = await abs('GET', '/auth/openid?callback=/login')
      const back = await visitIdp(start.headers.location)
      const u = new URL(back.location)
      out.stateMismatch = view(await abs('GET', `${u.pathname}?code=${u.searchParams.get('code')}&state=wrong`))
      const start2 = await abs('GET', '/auth/openid?callback=/login')
      const back2 = await visitIdp(start2.headers.location)
      const u2 = new URL(back2.location)
      out.unknownCode = view(await abs('GET', `${u2.pathname}?code=nope&state=${u2.searchParams.get('state')}`))
      idp.tokenStatus = 500
      const start3 = await abs('GET', '/auth/openid?callback=/login')
      const back3 = await visitIdp(start3.headers.location)
      out.tokenEndpointFails = view(await abs('GET', toPath(back3.location)))
      for (const [k, v] of Object.entries(out)) matchSnapshot(this, { res: v }, { label: k })
    })

    it('rejects an id_token with a bad signature, issuer, audience, expiry, or a sub that differs from userinfo', async function () {
      configure()
      const out = {}
      for (const [name, set] of Object.entries({
        otherKey: () => (idp.idTokenSignedWithOtherKey = true),
        wrongIssuer: () => (idp.idTokenIssuer = 'https://evil.example'),
        wrongAudience: () => (idp.idTokenAudience = 'someone-else'),
        expired: () => (idp.idTokenExpired = true),
        subMismatch: () => (idp.idTokenSub = 'other-sub'),
        userinfoFails: () => (idp.userinfoStatus = 500)
      })) {
        idp.idTokenSignedWithOtherKey = false
        idp.idTokenIssuer = null
        idp.idTokenAudience = null
        idp.idTokenExpired = false
        idp.idTokenSub = null
        idp.userinfoStatus = null
        set()
        out[name] = (await webFlow()).callback
      }
      for (const [k, v] of Object.entries(out)) matchSnapshot(this, { res: v }, { label: k })
    })
  })

  describe('matching and creating users', () => {
    const outcome = async (hops) => ({ callback: { status: hops.callback.status, location: hops.callback.location, body: hops.callback.body } })

    it('matches nobody by default: an unknown sub is refused when auto-register is off', async function () {
      configure()
      const hops = await webFlow()
      matchSnapshot(this, { ...(await outcome(hops)), users: await Database.userModel.count() })
    })

    it('auto-registers an unknown sub as a "user" named after preferred_username', async function () {
      configure({ authOpenIDAutoRegister: true })
      const hops = await webFlow()
      const emitted = api.emitted.filter((e) => e.method === 'adminEmitter').map((e) => e.args[0])
      matchSnapshot(this, { ...(await outcome(hops)), created: await userRow('idpuser'), emitted })
    })

    it('auto-registers with the name, then the sub, as username when preferred_username is missing, and drops an unverified email', async function () {
      configure({ authOpenIDAutoRegister: true })
      idp.user = { sub: 'sub-only', name: 'Display Name', email: 'a@example.com', email_verified: false }
      await webFlow()
      idp.user = { sub: 'sub-two' }
      await webFlow()
      matchSnapshot(this, { named: await userRow('Display Name'), subOnly: await userRow('sub-two') })
    })

    it('matches an existing user by email when configured, links the sub, and is case insensitive', async function () {
      configure({ authOpenIDMatchExistingBy: 'email' })
      await patchUser(users.user, { email: 'IdpUser@Example.com' })
      const hops = await webFlow()
      matchSnapshot(this, { ...(await outcome(hops)), row: await userRow('user') })
    })

    it('refuses an email match when email_verified is false, when there is no email, or when the user is linked to another sub', async function () {
      configure({ authOpenIDMatchExistingBy: 'email' })
      await patchUser(users.user, { email: 'idpuser@example.com' })
      const out = {}
      idp.user = { sub: 'idp-user-1', email: 'idpuser@example.com', email_verified: false }
      out.unverified = (await webFlow()).callback
      idp.user = { sub: 'idp-user-1' }
      out.noEmail = (await webFlow()).callback
      await patchUser(users.user, { extraData: { authOpenIDSub: 'someone-else', seriesHideFromContinueListening: [] } })
      idp.user = { sub: 'idp-user-1', email: 'idpuser@example.com', email_verified: true }
      out.alreadyLinked = (await webFlow()).callback
      for (const [k, v] of Object.entries(out)) matchSnapshot(this, { res: v }, { label: k })
    })

    it('treats a missing email_verified as verified', async function () {
      configure({ authOpenIDMatchExistingBy: 'email' })
      await patchUser(users.user, { email: 'idpuser@example.com' })
      idp.user = { sub: 'idp-user-1', email: 'idpuser@example.com' }
      const hops = await webFlow()
      matchSnapshot(this, { res: hops.callback, row: await userRow('user') })
    })

    it('matches an existing user by username (preferred_username, then username) when configured', async function () {
      configure({ authOpenIDMatchExistingBy: 'username' })
      idp.user = { sub: 'sub-a', preferred_username: 'USER' }
      const byPreferred = (await webFlow()).callback
      idp.user = { sub: 'sub-b', username: 'admin' }
      const byUsername = (await webFlow()).callback
      idp.user = { sub: 'sub-c' }
      const none = (await webFlow()).callback
      matchSnapshot(this, { byPreferred, byUsername, none, user: await userRow('user'), admin: await userRow('admin') })
    })

    it('refuses a username match for a user already linked to a different sub', async function () {
      configure({ authOpenIDMatchExistingBy: 'username' })
      await patchUser(users.user, { extraData: { authOpenIDSub: 'someone-else', seriesHideFromContinueListening: [] } })
      idp.user = { sub: 'sub-a', preferred_username: 'user' }
      matchSnapshot(this, (await webFlow()).callback)
    })

    it('refuses an inactive user, whether it is found by email or by sub', async function () {
      configure({ authOpenIDMatchExistingBy: 'email' })
      await patchUser(users.user, { email: 'idpuser@example.com', isActive: false })
      const byEmail = (await webFlow()).callback
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const bySub = (await webFlow()).callback
      matchSnapshot(this, { byEmail, bySub, row: await userRow('user') })
    })
  })

  describe('group and permission claims', () => {
    const run = async (user) => {
      idp.user = { sub: 'idp-user-1', preferred_username: 'idpuser', ...user }
      return (await webFlow()).callback
    }

    it('refuses the login when the group claim is configured but missing or empty', async function () {
      configure({ authOpenIDAutoRegister: true, authOpenIDGroupClaim: 'groups' })
      const missing = await run({})
      const empty = await run({ groups: [] })
      const nonMatching = await run({ groups: ['staff'] })
      matchSnapshot(this, { missing, empty, nonMatching, users: await Database.userModel.count() })
    })

    it('sets the user type from the groups by priority admin > user > guest, case insensitive', async function () {
      configure({ authOpenIDAutoRegister: true, authOpenIDGroupClaim: 'groups' })
      const out = {}
      out.guestOnly = await run({ groups: ['Guest'] })
      out.guestRow = await userRow('idpuser')
      out.userWins = await run({ groups: ['guest', 'USER'] })
      out.userRow = await userRow('idpuser')
      out.adminWins = await run({ groups: ['guest', 'user', 'Admin'] })
      out.adminRow = await userRow('idpuser')
      matchSnapshot(this, out)
    })

    it('never downgrades or changes the root user through the group claim, and refuses the login when it would', async function () {
      configure({ authOpenIDGroupClaim: 'groups' })
      await patchUser(users.root, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const asAdmin = await run({ groups: ['admin'] })
      const asUser = await run({ groups: ['user'] })
      matchSnapshot(this, { asAdmin, asUser, root: await userRow('root') })
    })

    it('applies the advanced permissions claim to non-admin users and ignores it for admins', async function () {
      configure({ authOpenIDAutoRegister: true, authOpenIDAdvancedPermsClaim: 'abs_perms' })
      const missing = await run({})
      const missingLeavesNoUser = await userRow('idpuser')
      const ok = await run({ abs_perms: { canDownload: false, canUpdate: true, canAccessAllLibraries: false, allowedLibraries: ['lib-1', 'lib-2'], canAccessAllTags: false, allowedTags: ['t1'], tagsAreDenylist: true } })
      const row = await Database.userModel.findOne({ where: { username: 'idpuser' } })
      const perms = row.permissions
      const unknownKey = await run({ abs_perms: { canFly: true } })
      const badLibraries = await run({ abs_perms: { canAccessAllLibraries: false, allowedLibraries: [1, 2] } })
      await patchUser(row, { type: 'admin' })
      const asAdmin = await run({})
      matchSnapshot(this, { missing, missingLeavesNoUser, ok, perms, unknownKey, badLibraries, asAdmin })
    })
  })

  describe('mobile login flow', () => {
    it('completes through the app: PKCE challenge at login, mobile-redirect, then the callback with the code_verifier returns json with tokens', async function () {
      configure()
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const hops = await mobileFlow()
      matchSnapshot(this, hops.start, { label: 'start' })
      matchSnapshot(this, hops.authorize, { label: 'authorize' })
      matchSnapshot(this, hops.idp, { label: 'idp' })
      matchSnapshot(this, hops.mobileRedirect, { label: 'mobileRedirect' })
      matchSnapshot(this, hops.callback, { label: 'callback' })
      matchSnapshot(this, tokenRequests(), { label: 'tokenRequests' })
    })

    it('fails the token exchange when the code_verifier does not match the challenge', async function () {
      configure()
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const ch = sha256('a'.repeat(50))
      const start = await abs('GET', `/auth/openid?redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&code_challenge=${ch}&state=s-9`)
      const back = await visitIdp(start.headers.location)
      const u = new URL(back.location)
      Logger.error.resetHistory()
      Logger.warn.resetHistory()
      const res = await abs('GET', `/auth/openid/callback?code=${u.searchParams.get('code')}&state=s-9&code_verifier=${'b'.repeat(50)}`)
      matchSnapshot(this, { res: view(res), logged: logged() })
      // the IdP is what rejected it: the token request carried the wrong verifier and the code was not consumed
      expect(tokenRequests()[0].form.code_verifier).to.equal('<verifier>')
      expect(idp.codes.has(u.searchParams.get('code'))).to.equal(true)
    })

    it('uses the tokens returned to the app: the access token is a working bearer for the IdP-linked user and the refresh token rotates the session', async function () {
      configure()
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      const hops = await mobileFlow()
      const { callback, challenge, verifier, appUrl, idpBack } = hops.raw
      expect(callback.status).to.equal(200)

      // PKCE: the app's own challenge reaches the IdP unchanged (S256, 43 char base64url), and the app's verifier (not a server generated one) is what the token endpoint gets
      const authorizeParams = new URLSearchParams(idp.requests.find((r) => r.endpoint === '/authorize').query)
      expect(authorizeParams.get('code_challenge')).to.match(/^[A-Za-z0-9_-]{43}$/)
      expect(authorizeParams.get('code_challenge')).to.equal(challenge)
      expect(authorizeParams.get('code_challenge_method')).to.equal('S256')
      expect(idp.requests.find((r) => r.endpoint === '/token').form.code_verifier).to.equal(verifier)
      // the app's own state goes to the IdP and comes back to the app with the code
      expect(authorizeParams.get('state')).to.equal('app-state')
      expect(appUrl.searchParams.get('state')).to.equal('app-state')
      expect(appUrl.searchParams.get('code')).to.equal(new URL(idpBack.location).searchParams.get('code'))
      expect(appUrl.href).to.equal('audiobookshelf://oauth?code=code-1&state=app-state')

      const { user } = callback.body
      expect(user.accessToken).to.match(/^[\w-]+\.[\w-]+\.[\w-]+$/)
      expect(user.refreshToken).to.match(/^[\w-]+\.[\w-]+\.[\w-]+$/)
      expect(user.refreshToken).to.not.equal(user.accessToken)
      expect(callback.cookies.map((c) => c.split('=')[0])).to.not.include('refresh_token')

      const me = await api.authRequest('GET', '/api/me', { bearer: user.accessToken })
      const garbage = await api.authRequest('GET', '/api/me', { bearer: 'garbage' })
      const refreshTokenAsBearer = await api.authRequest('GET', '/api/me', { bearer: user.refreshToken })
      const refreshed = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': user.refreshToken } })
      const meAfterRefresh = await api.authRequest('GET', '/api/me', { bearer: refreshed.body?.user?.accessToken })
      const noRefreshToken = await api.authRequest('POST', '/auth/refresh', {})
      const badRefreshToken = await api.authRequest('POST', '/auth/refresh', { headers: { 'x-refresh-token': 'garbage' } })
      const idView = (id) => (id === users.user.id ? '<linked user id>' : id === users.admin.id ? '<admin id>' : id)
      matchSnapshot(this, {
        loginUser: { id: idView(user.id), username: user.username, type: user.type, hasToken: !!user.token, tokenIsAccessToken: user.token === user.accessToken, hasPermissions: !!user.permissions, librariesAccessible: user.librariesAccessible, hasLibraries: Array.isArray(user.librariesAccessible) },
        loginBodyKeys: Object.keys(callback.body).sort(),
        me: { status: me.status, id: idView(me.body?.id), username: me.body?.username, type: me.body?.type },
        garbageBearer: { status: garbage.status, body: garbage.body },
        refreshTokenAsBearer: { status: refreshTokenAsBearer.status },
        refreshed: { status: refreshed.status, id: idView(refreshed.body?.user?.id), username: refreshed.body?.user?.username, hasAccessToken: !!refreshed.body?.user?.accessToken, hasRefreshToken: !!refreshed.body?.user?.refreshToken, refreshTokenRotated: refreshed.body?.user?.refreshToken !== user.refreshToken, cookies: refreshed.cookies.map(maskCookie) },
        meAfterRefresh: { status: meAfterRefresh.status, id: idView(meAfterRefresh.body?.id), username: meAfterRefresh.body?.username },
        noRefreshToken: { status: noRefreshToken.status, body: noRefreshToken.body },
        badRefreshToken: { status: badRefreshToken.status, body: badRefreshToken.body }
      })
    })

    it('answers errors of the mobile callback with the web redirect to /login, because the session flag is the redirect uri string, not true', async function () {
      configure()
      idp.denyAuthorize = true
      const hops = await mobileFlow()
      matchSnapshot(this, hops.callback)
    })

    it('refuses an unknown user on the mobile flow the same way', async function () {
      configure()
      matchSnapshot(this, (await mobileFlow()).callback)
    })
  })

  describe('logout (POST /logout)', () => {
    const loginViaOidc = async (flow = 'web') => {
      await patchUser(users.user, { extraData: { authOpenIDSub: 'idp-user-1', seriesHideFromContinueListening: [] } })
      return flow === 'web' ? webFlow() : mobileFlow()
    }

    it('returns the provider end-session url with id_token_hint and the post-logout redirect for a web login', async function () {
      configure()
      await loginViaOidc('web')
      const out = await abs('POST', '/logout')
      matchSnapshot(this, { res: view(out), logoutUrl: out.body.redirect_url && authorizeView(out.body.redirect_url) })
    })

    it('omits the post-logout redirect for a mobile login', async function () {
      configure()
      await loginViaOidc('mobile')
      const out = await abs('POST', '/logout')
      matchSnapshot(this, { res: view(out), logoutUrl: out.body.redirect_url && authorizeView(out.body.redirect_url) })
    })

    it('returns redirect_url null when the provider has no end-session endpoint, and for a local login', async function () {
      configure({ authOpenIDLogoutURL: null })
      await loginViaOidc('web')
      const noEndpoint = await abs('POST', '/logout')
      jar = {}
      const local = await api.authRequest('POST', '/login', { json: { username: 'user', password: 'user-pass' } })
      storeCookies(local.cookies)
      const localOut = await abs('POST', '/logout')
      matchSnapshot(this, { noEndpoint: view(noEndpoint), local: view(localOut) })
    })
  })

  describe('strategy lifecycle', () => {
    it('unuse() removes the strategy: the callback then fails because passport does not know openid-client', async function () {
      configure()
      const start = await abs('GET', '/auth/openid?callback=/login')
      const back = await visitIdp(start.headers.location)
      api.auth.oidcAuthStrategy.unuse()
      const res = await abs('GET', toPath(back.location))
      matchSnapshot(this, { res: view(res) })
    })

    it('init() with invalid settings logs an error and registers nothing', async function () {
      Object.assign(Database.serverSettings, { authOpenIDIssuerURL: null })
      global.ServerSettings = Database.serverSettings.toJSON()
      api.auth.oidcAuthStrategy.unuse()
      api.auth.oidcAuthStrategy.init()
      expect(api.auth.oidcAuthStrategy.strategy).to.equal(null)
      expect(() => api.auth.oidcAuthStrategy.getClient()).to.throw('OpenID Connect settings are not valid')
    })

    it('getScope() and isValidRedirectUri()', async function () {
      configure({ authOpenIDGroupClaim: 'groups', authOpenIDAdvancedPermsClaim: 'perms', authOpenIDMobileRedirectURIs: ['app://a', 'app://b'] })
      const s = api.auth.oidcAuthStrategy
      matchSnapshot(this, { scope: s.getScope(), a: s.isValidRedirectUri('app://a'), c: s.isValidRedirectUri('app://c'), star: s.isValidRedirectUri('*') })
    })
  })
})
