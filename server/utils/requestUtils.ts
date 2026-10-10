type RequestLike = {
  secure?: boolean
  get(name: string): string | undefined
}

/**
 * Whether the request was made over HTTPS.
 * Uses Express `req.secure` and `x-forwarded-proto`
 *
 * @returns {boolean}
 */
function isRequestSecure(req: RequestLike) {
  if (req.secure) return true
  const xfp = (req.get('x-forwarded-proto') || '').toLowerCase()
  // Nginx Proxy Manager sends "http, https"; see https://github.com/advplyr/audiobookshelf/pull/4635
  return (
    xfp === 'https' ||
    xfp
      .split(',')
      .map((s) => s.trim())
      .includes('https')
  )
}

/**
 * @returns {'https' | 'http'}
 */
function getRequestProtocol(req: RequestLike): 'https' | 'http' {
  return isRequestSecure(req) ? 'https' : 'http'
}

/**
 */
function getRequestOrigin(req: RequestLike) {
  const protocol = getRequestProtocol(req)
  const host = req.get('host')
  return { protocol, host, origin: `${protocol}://${host}` }
}

module.exports = {
  isRequestSecure,
  getRequestProtocol,
  getRequestOrigin
}
