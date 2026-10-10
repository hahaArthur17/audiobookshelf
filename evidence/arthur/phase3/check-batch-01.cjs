// Fixed-input CommonJS and behavior sample for Stage 1 Batch 01.
// Usage: node evidence/arthur/phase3/check-batch-01.cjs /absolute/path/to/checkout
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', 'utils', name))

const globals = load('globals')
const LongTimeout = load('longTimeout')
const requestUtils = load('requestUtils')
const stringifySequelizeQuery = load('stringifySequelizeQuery')

const req = (secure, headers) => ({
  secure,
  get(name) { return headers[name] }
})
const requests = [
  req(true, { host: 'localhost:13378' }),
  req(false, { host: 'example.test', 'x-forwarded-proto': 'http, https' }),
  req(false, { host: 'example.test', 'x-forwarded-proto': 'HTTP' }),
  req(false, { host: 'example.test', 'x-forwarded-proto': 'HTTPS' })
]

const timer = new LongTimeout()
let zeroCallbackCount = 0
timer.set(() => { zeroCallbackCount++ }, 0)
const zeroTimer = { timeout: timer.timeout, timer: timer.timer, zeroCallbackCount }
timer.set(() => {}, 10)
const scheduledTimer = { timeout: timer.timeout, hasTimer: Boolean(timer.timer) }
timer.clear()

const symbol = Symbol.for('sample')
class Sample {}
const circular = {}
circular.self = circular
let circularError
try {
  stringifySequelizeQuery(circular)
} catch (error) {
  circularError = { name: error.name, message: error.message }
}

console.log('BEHAVIOR_JSON=' + JSON.stringify({
  exports: {
    globals: typeof globals,
    longTimeout: typeof LongTimeout,
    requestUtils: Object.keys(requestUtils),
    stringifySequelizeQuery: typeof stringifySequelizeQuery
  },
  globals,
  timerOwnKeys: Object.keys(new LongTimeout()),
  zeroTimer,
  scheduledTimer,
  requests: requests.map((request) => ({
    secure: requestUtils.isRequestSecure(request),
    protocol: requestUtils.getRequestProtocol(request),
    origin: requestUtils.getRequestOrigin(request)
  })),
  stringified: stringifySequelizeQuery({ [symbol]: 7, nested: { [symbol]: 8 }, cls: Sample }),
  circularError
}))
