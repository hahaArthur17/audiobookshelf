/**
 * A small fake OpenID Connect identity provider for characterizing the OIDC login flow against the real openid-client + passport code.
 *
 *   const idp = await startFakeIdp()
 *   idp.settings()                      // the authOpenID* server settings that point at it
 *   idp.user = { sub: 'abc', email: 'a@b.c', preferred_username: 'abc' }   // the claims it issues (id_token and userinfo)
 *   idp.requests                        // every request it received: { endpoint, method, query, form, headers }
 *   await idp.stop()
 *
 * Endpoints: /.well-known/openid-configuration, /authorize (redirects straight back with a code), /token (checks the client secret,
 * redirect_uri and the PKCE verifier), /jwks, /userinfo, /logout. Failure modes are switched with the idp.fail* fields.
 */
const http = require('http')
const crypto = require('crypto')

const b64u = (buf) => Buffer.from(buf).toString('base64url')

async function startFakeIdp({ clientId = 'abs-client', clientSecret = 'abs-secret' } = {}) {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const otherKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }

  const idp = {
    clientId,
    clientSecret,
    user: { sub: 'idp-user-1', preferred_username: 'idpuser', email: 'idpuser@example.com', email_verified: true },
    requests: [],
    codes: new Map(),
    /** one-shot or sticky failure switches */
    denyAuthorize: false, // /authorize answers with error=access_denied
    tokenStatus: null, // /token answers with this status and an oauth error body
    idTokenIssuer: null, // override the iss claim of the id_token
    idTokenAudience: null, // override the aud claim
    idTokenExpired: false,
    idTokenSignedWithOtherKey: false,
    idTokenSub: null, // override the sub claim in the id_token only (userinfo keeps user.sub)
    userinfoStatus: null,
    endSession: true // advertise an end_session_endpoint
  }
  let base = ''

  const sign = (claims, key) => {
    const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' }))
    const payload = b64u(JSON.stringify(claims))
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key)
    return `${header}.${payload}.${b64u(sig)}`
  }
  const idToken = (user) => {
    const now = Math.floor(Date.now() / 1000)
    return sign({ ...user, sub: idp.idTokenSub || user.sub, iss: idp.idTokenIssuer || base, aud: idp.idTokenAudience || clientId, iat: now - 5, exp: idp.idTokenExpired ? now - 600 : now + 600 }, (idp.idTokenSignedWithOtherKey ? otherKeys : keys).privateKey)
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    })
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    const raw = req.method === 'POST' ? await readBody(req) : ''
    const form = raw ? Object.fromEntries(new URLSearchParams(raw)) : undefined
    const endpoint = url.pathname
    idp.requests.push({ endpoint, method: req.method, query: Object.fromEntries(url.searchParams), form, headers: { authorization: req.headers.authorization, 'content-type': req.headers['content-type'] } })

    if (endpoint === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        userinfo_endpoint: `${base}/userinfo`,
        jwks_uri: `${base}/jwks`,
        ...(idp.endSession ? { end_session_endpoint: `${base}/logout` } : {}),
        id_token_signing_alg_values_supported: ['RS256'],
        response_types_supported: ['code'],
        extra_field_not_forwarded: true
      })
    }
    if (endpoint === '/jwks') return json(res, 200, { keys: [jwk] })
    if (endpoint === '/authorize') {
      const q = url.searchParams
      const redirect = new URL(q.get('redirect_uri'))
      if (idp.denyAuthorize) {
        redirect.searchParams.set('error', 'access_denied')
        redirect.searchParams.set('error_description', 'user said no')
      } else {
        const code = `code-${idp.codes.size + 1}`
        idp.codes.set(code, { challenge: q.get('code_challenge'), method: q.get('code_challenge_method'), redirectUri: q.get('redirect_uri'), user: { ...idp.user } })
        redirect.searchParams.set('code', code)
      }
      if (q.get('state')) redirect.searchParams.set('state', q.get('state'))
      res.writeHead(302, { location: redirect.toString() })
      return res.end()
    }
    if (endpoint === '/token') {
      if (idp.tokenStatus) return json(res, idp.tokenStatus, { error: 'invalid_grant', error_description: 'forced failure' })
      const basic = (req.headers.authorization || '').replace(/^Basic /, '')
      const [id, secret] = Buffer.from(basic, 'base64').toString().split(':').map(decodeURIComponent)
      if (id !== clientId || secret !== clientSecret) return json(res, 401, { error: 'invalid_client' })
      const entry = idp.codes.get(form?.code)
      if (!entry || form.grant_type !== 'authorization_code') return json(res, 400, { error: 'invalid_grant', error_description: 'unknown code' })
      if (form.redirect_uri !== entry.redirectUri) return json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
      const verifierHash = crypto.createHash('sha256').update(form.code_verifier || '').digest('base64url')
      if (entry.challenge && verifierHash !== entry.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' })
      idp.codes.delete(form.code)
      return json(res, 200, { access_token: `at-${form.code}`, token_type: 'Bearer', expires_in: 3600, id_token: idToken(entry.user) })
    }
    if (endpoint === '/userinfo') {
      if (idp.userinfoStatus) return json(res, idp.userinfoStatus, { error: 'forced' })
      if (!/^Bearer at-code-/.test(req.headers.authorization || '')) return json(res, 401, { error: 'invalid_token' })
      return json(res, 200, idp.user)
    }
    if (endpoint === '/logout') {
      res.writeHead(200)
      return res.end('logged out')
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  idp.base = base
  idp.port = server.address().port

  /** the server settings (authOpenID*) that point at this provider */
  idp.settings = (extra = {}) => ({
    authActiveAuthMethods: ['local', 'openid'],
    authOpenIDIssuerURL: base,
    authOpenIDAuthorizationURL: `${base}/authorize`,
    authOpenIDTokenURL: `${base}/token`,
    authOpenIDUserInfoURL: `${base}/userinfo`,
    authOpenIDJwksURL: `${base}/jwks`,
    authOpenIDLogoutURL: `${base}/logout`,
    authOpenIDClientID: clientId,
    authOpenIDClientSecret: clientSecret,
    authOpenIDTokenSigningAlgorithm: 'RS256',
    authOpenIDSubfolderForRedirectURLs: '',
    ...extra
  })
  idp.stop = () => new Promise((resolve) => server.close(resolve))
  return idp
}

module.exports = { startFakeIdp }
