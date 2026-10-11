/**
 * Boots the REAL server (dist-server/index.js) as a child process on a temp config/metadata dir and a free port.
 * Used where in-process booting is impossible (Server.start() installs process-wide SIGINT / unhandledRejection handlers, and env
 * variables are read once per process). Needs ffmpeg and ffprobe paths (the server refuses to start without them, but does not run them).
 *
 *   if (!childServer.available) this.skip()
 *   const s = await childServer.boot({ env: { RATE_LIMIT_AUTH_MAX: '3' } })
 *   await s.get('/audiobookshelf/ping') -> { status, headers (selected), body }
 *   await s.stop()
 */
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const ROOT = (() => {
  const parts = __dirname.split(path.sep)
  const i = parts.lastIndexOf('dist-server')
  return i > -1 ? parts.slice(0, i).join(path.sep) || path.sep : path.resolve(__dirname, '..', '..', '..')
})()
const INDEX = path.join(ROOT, 'dist-server', 'index.js')
const BP = '/audiobookshelf'

const which = (name, envName) => {
  if (process.env[envName]) return process.env[envName]
  try {
    return execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' }).split('\n')[0].trim() || null
  } catch {
    return null
  }
}
const FFMPEG = which('ffmpeg', 'FFMPEG_PATH')
const FFPROBE = which('ffprobe', 'FFPROBE_PATH')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

const HEADERS = ['content-type', 'ratelimit', 'ratelimit-policy', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining']

/** @param {{ basePath?: string, env?: Record<string,string> }} [o] */
async function boot(o = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abs-child-')))
  const port = await freePort()
  const env = { ...process.env, TZ: 'UTC', NODE_ENV: 'production', HOST: '127.0.0.1', SKIP_BINARIES_CHECK: '1', FFMPEG_PATH: FFMPEG, FFPROBE_PATH: FFPROBE, SOURCE: 'local', ROUTER_BASE_PATH: o.basePath ?? BP, ...o.env }
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k]
  const proc = spawn(process.execPath, [INDEX, '--config', path.join(tmp, 'config'), '--metadata', path.join(tmp, 'metadata'), '--port', String(port)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const lines = []
  let buf = ''
  const onData = (d) => {
    buf += d.toString()
    const parts = buf.split('\n')
    buf = parts.pop()
    lines.push(...parts)
  }
  proc.stdout.on('data', onData)
  proc.stderr.on('data', onData)
  const exit = new Promise((resolve) => proc.on('exit', (code, signal) => resolve({ code, signal })))
  const base = `http://127.0.0.1:${port}`
  const server = {
    proc,
    port,
    base,
    tmp,
    lines,
    exit,
    basePath: env.ROUTER_BASE_PATH,
    /** log lines without timestamps, with the tmp dir and port masked */
    logLines: () => lines.map((l) => l.replace(/^\[[^\]]+\]\s*/, '').split(tmp).join('<tmp>').split(String(port)).join('<port>')),
    /** @param {string} p path incl. base path @param {{ method?: string, json?: any, headers?: Record<string,string> }} [r] */
    async get(p, r = {}) {
      const headers = { ...(r.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(r.headers || {}) }
      const res = await fetch(base + p, { method: r.method || 'GET', headers, body: r.json !== undefined ? JSON.stringify(r.json) : undefined, redirect: 'manual' })
      const text = await res.text()
      let body = text
      try {
        body = text ? JSON.parse(text) : null
      } catch {}
      const out = {}
      for (const n of HEADERS) if (res.headers.get(n) !== null) out[n] = res.headers.get(n)
      return { status: res.status, headers: out, body }
    },
    async stop() {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGINT')
        await Promise.race([exit, sleep(10000).then(() => proc.kill('SIGKILL'))])
        await exit
      }
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
  const deadline = Date.now() + 40000
  for (;;) {
    if (Date.now() > deadline) throw new Error(`server did not become ready:\n${lines.slice(-20).join('\n')}`)
    if (proc.exitCode !== null) throw new Error(`server exited early (${proc.exitCode}):\n${lines.slice(-20).join('\n')}`)
    try {
      if ((await fetch(`${base}${server.basePath}/ping`)).status === 200) break
    } catch {}
    await sleep(150)
  }
  return server
}

module.exports = { boot, available: !!(FFMPEG && FFPROBE), BP, sleep }
