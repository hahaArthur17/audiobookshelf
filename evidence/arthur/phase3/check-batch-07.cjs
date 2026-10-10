// Fixed-input behavior sample for Stage 1 Batch 07.
const path = require('path')
const fs = require('fs')
const os = require('os')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const hls = load('utils/generators/hlsPlaylistGenerator')
const { profile } = load('utils/profiler')
const rateLimiter = load('utils/rateLimiterFactory')
const Logger = load('Logger')

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abs-stage1-hls-'))
  const hlsPath = path.join(tmp, 'playlist.m3u8')
  const originalInfo = Logger.info
  const originalError = Logger.error
  const originalAuthMax = process.env.RATE_LIMIT_AUTH_MAX
  Logger.info = () => {}
  Logger.error = () => {}
  process.env.RATE_LIMIT_AUTH_MAX = '0'
  try {
    await hls(hlsPath, 'segment', 13, 6, 'fmp4')
    const hlsText = fs.readFileSync(hlsPath, 'utf8')
    const options = {}
    const wrapped = profile(async (opts) => {
      await new Promise((resolve) => setTimeout(resolve, 3))
      return { passedSameOptions: opts === options }
    }, true, 'sample')
    const profiledResult = await wrapped(options)
    let failed
    const failing = profile(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3))
      throw new Error('sample failure')
    }, false, 'failing')
    try { await failing() } catch (error) { failed = { name: error.name, message: error.message } }
    let nextCount = 0
    const middleware = rateLimiter.getAuthRateLimiter()
    middleware({}, {}, () => { nextCount++ })
    const sameMiddleware = middleware === rateLimiter.getAuthRateLimiter()
    console.log('BEHAVIOR_JSON=' + JSON.stringify({
      exportTypes: { hls: typeof hls, profiler: typeof profile, rateLimiter: typeof rateLimiter },
      hlsText,
      profiler: { result: profiledResult, benchmark: options.benchmark, hasLogging: typeof options.logging, failed },
      limiter: { ownKeys: Object.keys(rateLimiter), middleware: typeof middleware, sameMiddleware, nextCount }
    }))
  } finally {
    Logger.info = originalInfo
    Logger.error = originalError
    if (originalAuthMax === undefined) delete process.env.RATE_LIMIT_AUTH_MAX
    else process.env.RATE_LIMIT_AUTH_MAX = originalAuthMax
    fs.unlinkSync(hlsPath)
    fs.rmdirSync(tmp)
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
