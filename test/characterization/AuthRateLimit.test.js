const { expect } = require('chai')
const { matchSnapshot } = require('./helpers/snapshot')
const childServer = require('./helpers/child-server')

const { BP, sleep } = childServer

// The auth rate limiter (utils/rateLimiterFactory.js, express-rate-limit) is a process-wide singleton configured from environment variables
// when it is first used, so it is characterized through the real server in a child process (see helpers/child-server.js). The in-process
// harnesses bypass or share it (see CHARACTERIZATION.md). Root user and a password are created through POST /init, which is not limited.
describe('Auth rate limit (characterization)', function () {
  this.timeout(90000)

  let srv = null
  before(function () {
    if (!childServer.available) this.skip()
  })
  afterEach(async () => {
    if (srv) await srv.stop()
    srv = null
  })

  const boot = async (env = {}, init = true) => {
    srv = await childServer.boot({ env })
    if (init) await srv.get(`${BP}/init`, { method: 'POST', json: { newRoot: { username: 'root', password: 'root-pass' } } })
    return srv
  }
  const login = (password = 'wrong', username = 'root', headers) => srv.get(`${BP}/login`, { method: 'POST', json: { username, password }, headers })
  /** status, body and the rate limit headers (the reset time varies by a second) */
  const view = (res) => {
    const headers = { ...res.headers }
    delete headers['content-type']
    for (const k of ['ratelimit-reset', 'retry-after']) if (headers[k] !== undefined) headers[k] = /^\d+$/.test(headers[k]) ? '<seconds>' : headers[k]
    if (headers.ratelimit) headers.ratelimit = headers.ratelimit.replace(/reset=\d+/, 'reset=<seconds>')
    return { status: res.status, headers, body: res.body?.user ? { user: res.body.user.username } : res.body }
  }
  const mask = (v) => JSON.parse(JSON.stringify(v).split(srv.tmp).join('<tmp>').split(String(srv.port)).join('<port>'))
  const isRes = (v) => v && typeof v === 'object' && typeof v.status === 'number'
  // one snapshot entry per response ({ res }), so the audit can see the mix of success and error statuses; anything else gets its own entry too
  const snap = (ctx, v) => {
    const parts = Array.isArray(v) ? v.map((x, i) => [`#${i + 1}`, x]) : Object.entries(v)
    for (const [key, part] of parts) {
      if (Array.isArray(part) && part.every(isRes)) part.forEach((r, i) => matchSnapshot(ctx, { res: mask(r) }, { label: `${key}[${i}]` }))
      else matchSnapshot(ctx, isRes(part) ? { res: mask(part) } : mask(part), { label: key })
    }
  }

  describe('limit and message', () => {
    it('answers 429 with a json error after RATE_LIMIT_AUTH_MAX requests, and reports the budget in the headers', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '3' })
      const results = []
      for (let i = 0; i < 5; i++) results.push(view(await login()))
      const lines = srv.logLines().filter((l) => /RateLimit/.test(l))
      snap(this, { results, lines })
    })

    it('counts successful logins too, and blocks even the correct password once the budget is used', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '3' })
      const results = []
      for (let i = 0; i < 3; i++) results.push(view(await login('root-pass')))
      results.push(view(await login('root-pass')))
      snap(this, results)
    })

    it('uses RATE_LIMIT_AUTH_MESSAGE as the error text', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '1', RATE_LIMIT_AUTH_MESSAGE: 'slow down' })
      await login()
      snap(this, { blocked: view(await login()), lines: srv.logLines().filter((l) => /RateLimiterFactory/.test(l)) })
    })

    it('defaults to 40 requests per window', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: undefined })
      const statuses = []
      for (let i = 0; i < 42; i++) statuses.push((await login('wrong', 'nobody')).status)
      const first429 = statuses.indexOf(429)
      snap(this, { first429, count401: statuses.filter((s) => s === 401).length, count429: statuses.filter((s) => s === 429).length, lines: srv.logLines().filter((l) => /RateLimiterFactory/.test(l)) })
    })

    it('is disabled by RATE_LIMIT_AUTH_MAX=0', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '0' })
      const statuses = []
      for (let i = 0; i < 45; i++) statuses.push((await login('wrong', 'nobody')).status)
      snap(this, { distinct: [...new Set(statuses)], lines: srv.logLines().filter((l) => /RateLimiterFactory/.test(l)) })
    })

    it('ignores a RATE_LIMIT_AUTH_MAX that is not a positive number and keeps the default', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: 'abc' })
      const res = await login('wrong', 'nobody')
      snap(this, { res: view(res), lines: srv.logLines().filter((l) => /RateLimiterFactory/.test(l)) })
    })
  })

  describe('window', () => {
    it('lets requests through again once RATE_LIMIT_AUTH_WINDOW (ms) has passed', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '2', RATE_LIMIT_AUTH_WINDOW: '2500' })
      const before = [view(await login()), view(await login()), view(await login())]
      await sleep(2800)
      const after = view(await login())
      snap(this, { before, after, lines: srv.logLines().filter((l) => /RateLimiterFactory/.test(l)) })
    })
  })

  describe('which routes share the budget', () => {
    it('counts /login, /auth/refresh, /auth/openid and PATCH /me/password against one budget; other routes are not limited', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '4' })
      // the first login uses one of the four requests
      const ok = await login('root-pass')
      const token = ok.body.user.accessToken
      const auth = { authorization: `Bearer ${token}` }
      const results = { login: view(ok) }
      // routes that are NOT limited, called many times
      const free = []
      for (let i = 0; i < 6; i++) free.push((await srv.get(`${BP}/api/libraries`, { headers: auth })).status, (await srv.get(`${BP}/ping`)).status, (await srv.get(`${BP}/status`)).status)
      results.unlimitedStatuses = [...new Set(free)]
      results.refresh = view(await srv.get(`${BP}/auth/refresh`, { method: 'POST' }))
      results.openid = view(await srv.get(`${BP}/auth/openid?code_challenge=x&callback=y`))
      results.password = view(await srv.get(`${BP}/api/me/password`, { method: 'PATCH', json: { password: 'root-pass', newPassword: 'new-pass' }, headers: auth }))
      results.blockedLogin = view(await login('root-pass'))
      results.blockedRefresh = view(await srv.get(`${BP}/auth/refresh`, { method: 'POST' }))
      results.blockedOpenidConfig = view(await srv.get(`${BP}/auth/openid/config`, { headers: auth }))
      results.blockedPassword = view(await srv.get(`${BP}/api/me/password`, { method: 'PATCH', json: { password: 'x', newPassword: 'y' }, headers: auth }))
      results.stillFree = view(await srv.get(`${BP}/api/libraries`, { headers: auth }))
      results.stillPing = view(await srv.get(`${BP}/ping`))
      snap(this, results)
    })

    it('limits before authentication is checked (/login, /auth/refresh) but not /logout', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '1' })
      await login()
      snap(this, { badLogin: view(await login()), logout: view(await srv.get(`${BP}/logout`, { method: 'POST' })), refreshNoToken: view(await srv.get(`${BP}/auth/refresh`, { method: 'POST' })) })
    })
  })

  describe('client identity', () => {
    it('keys the limit on the X-Forwarded-For address, so each forwarded address has its own budget (and the header can be spoofed)', async function () {
      await boot({ RATE_LIMIT_AUTH_MAX: '2' })
      const from = (ip) => login('wrong', 'root', { 'x-forwarded-for': ip })
      const results = {
        a1: view(await from('10.0.0.1')),
        a2: view(await from('10.0.0.1')),
        a3: view(await from('10.0.0.1')),
        b1: view(await from('10.0.0.2')),
        spoofed: view(await from('10.0.0.3')),
        direct: view(await login()),
        directAgain: view(await login()),
        directBlocked: view(await login())
      }
      snap(this, results)
      expect(results.a3.status).to.equal(429)
      expect(results.b1.status).to.not.equal(429)
    })
  })
})
