const { expect } = require('chai')
const { startApi } = require('./helpers/harness')
const { stubAxiosPost } = require('./helpers/seed-delivery-extra')
const NotificationManager = require('../../server/managers/NotificationManager')
const Database = require('../../server/Database')
const Logger = require('../../server/Logger')

// The real NotificationManager runs (settings through the real PATCH/POST routes, events through the real
// onBackupFailed); only axios.post (the apprise call) is stubbed. Every post stays pending until the test settles it, so
// the "sending" state, the queue and the overflow branch can be observed. Waits are on events (a post call, the manager
// going idle), never fixed sleeps.
describe('NotificationManager queue (characterization)', () => {
  let api, axiosPost, posts

  const tick = () => new Promise((r) => global.setImmediate(r))
  // polls on the event loop (no timers); bounded by turns so a regression fails instead of hanging
  const until = async (cond) => {
    for (let i = 0; !cond(); i++) {
      if (i > 20000) throw new Error('condition never became true')
      await tick()
    }
  }
  const waitPosts = (n) => until(() => posts.length >= n)
  const waitIdle = () => until(() => !NotificationManager.sendingNotification && NotificationManager.notificationQueue.length === 0)
  const bodies = () => posts.map((p) => p.payload.body)
  const settle = (i, ok = true) => (ok ? posts[i].resolve({ data: { ok: true } }) : posts[i].reject(new Error('apprise down')))
  const fire = (...msgs) => Promise.all(msgs.map((m) => NotificationManager.onBackupFailed(m)))
  const queued = () => NotificationManager.notificationQueue.map((q) => q.eventData.errorMsg)
  const warns = () => Logger.warn.getCalls().map((c) => c.args)
  const debugs = () => Logger.debug.getCalls().map((c) => c.args[0])
  const errors = () => Logger.error.getCalls().map((c) => c.args[0])
  const updates = () => api.emitted.filter((e) => e.method === 'emitter' && e.args[0] === 'notifications_updated')
  const FULL = '[NotificationManager] Notification queue is full - ignoring event onBackupFailed'

  const configure = async (json) => {
    const res = await api.request('PATCH', '/api/notifications', { as: 'admin', json: { appriseApiUrl: 'http://apprise.example.test/notify', ...json } })
    expect(res.status).to.equal(200)
    Database.notificationSettings.notificationDelay = 1
    const created = await api.request('POST', '/api/notifications', { as: 'admin', json: { eventName: 'onBackupFailed', urls: ['json://hooks.example.test/a'], titleTemplate: 'Failed', bodyTemplate: '{{errorMsg}}', enabled: true, type: 'info' } })
    expect(created.status).to.equal(200)
    api.emitted.splice(0)
    return Database.notificationSettings.notifications[0]
  }

  beforeEach(async () => {
    api = await startApi()
    await api.seed.users()
    NotificationManager.sendingNotification = false
    NotificationManager.notificationQueue = []
    posts = []
    axiosPost = stubAxiosPost((url, payload) => new Promise((resolve, reject) => posts.push({ url, payload, resolve, reject })))
  })

  afterEach(async () => {
    // release anything still pending so the manager can finish
    for (let i = 0; i < 20 && !(!NotificationManager.sendingNotification && !NotificationManager.notificationQueue.length); i++) {
      posts.forEach((p) => p.resolve({ data: {} }))
      await tick()
    }
    NotificationManager.notificationQueue = []
    await waitIdle().catch(() => {})
    await api.stop()
  })

  it('applies maxNotificationQueue from the settings route', async () => {
    await configure({ maxNotificationQueue: 2 })
    expect(Database.notificationSettings.maxNotificationQueue).to.equal(2)
    expect(NotificationManager.sendingNotification).to.equal(false)
  })

  it('queues up to maxNotificationQueue events while one is sending and drops none (exactly at the limit)', async () => {
    await configure({ maxNotificationQueue: 2 })
    await fire('e1', 'e2', 'e3')
    expect(NotificationManager.sendingNotification).to.equal(true)
    expect(axiosPost.callCount).to.equal(1)
    expect(bodies()).to.deep.equal(['e1'])
    expect(queued()).to.deep.equal(['e2', 'e3'])
    expect(NotificationManager.notificationQueue[0]).to.deep.equal({ eventName: 'onBackupFailed', eventData: { errorMsg: 'e2' } })
    expect(warns()).to.deep.equal([])
    expect(debugs()).to.include('[NotificationManager] Queueing notification onBackupFailed (Queue size: 0)')
    expect(debugs()).to.include('[NotificationManager] Queueing notification onBackupFailed (Queue size: 1)')

    // drains in order, each send only after the previous finished and the delay passed
    settle(0)
    await waitPosts(2)
    expect(bodies()).to.deep.equal(['e1', 'e2'])
    expect(queued()).to.deep.equal(['e3'])
    settle(1)
    await waitPosts(3)
    expect(bodies()).to.deep.equal(['e1', 'e2', 'e3'])
    expect(queued()).to.deep.equal([])
    expect(NotificationManager.sendingNotification).to.equal(true)
    settle(2)
    await waitIdle()
    expect(axiosPost.callCount).to.equal(3)
    expect(updates()).to.have.length(3)
    expect(warns()).to.deep.equal([])
  })

  it('drops events once the queue is full (max + 2 events), warns for each, and drains the rest in order', async () => {
    await configure({ maxNotificationQueue: 2 })
    await fire('e1', 'e2', 'e3') // e1 sending, e2 and e3 fill the queue
    expect(warns()).to.deep.equal([])
    await fire('e4', 'e5') // queue length 2 >= 2: both dropped
    expect(queued()).to.deep.equal(['e2', 'e3'])
    expect(warns()).to.deep.equal([[FULL], [FULL]])
    expect(debugs().filter((d) => d.startsWith('[NotificationManager] Queueing notification'))).to.have.length(2)
    expect(axiosPost.callCount).to.equal(1)
    expect(Database.notificationSettings.notifications[0].numTimesFired).to.equal(0)

    settle(0)
    await waitPosts(2)
    expect(queued()).to.deep.equal(['e3'])
    // room was freed by the drain, so a new event is queued again; the next one is dropped
    await fire('e6')
    expect(queued()).to.deep.equal(['e3', 'e6'])
    await fire('e7')
    expect(queued()).to.deep.equal(['e3', 'e6'])
    expect(warns()).to.have.length(3)
    settle(1)
    await waitPosts(3)
    settle(2)
    await waitPosts(4)
    settle(3)
    await waitIdle()
    expect(bodies()).to.deep.equal(['e1', 'e2', 'e3', 'e6']) // e4, e5, e7 were never sent
    expect(Database.notificationSettings.notifications[0].numTimesFired).to.equal(4)
    expect(updates()).to.have.length(4)
  })

  it('with maxNotificationQueue 1 the second waiting event is dropped', async () => {
    await configure({ maxNotificationQueue: 1 })
    await fire('a', 'b', 'c')
    expect(queued()).to.deep.equal(['b'])
    expect(warns()).to.deep.equal([[FULL]])
    settle(0)
    await waitPosts(2)
    settle(1)
    await waitIdle()
    expect(bodies()).to.deep.equal(['a', 'b'])
  })

  it('does not queue or warn when nothing is sending', async () => {
    await configure({ maxNotificationQueue: 1 })
    await fire('a')
    expect(NotificationManager.sendingNotification).to.equal(true)
    settle(0)
    await waitIdle()
    expect(NotificationManager.sendingNotification).to.equal(false)
    await fire('b')
    expect(bodies()).to.deep.equal(['a', 'b'])
    expect(warns()).to.deep.equal([])
    expect(queued()).to.deep.equal([])
  })

  describe('failure counters', () => {
    it('counts consecutive failures, disables at maxFailedAttempts, then stops sending', async () => {
      const n = await configure({ maxFailedAttempts: 2 })
      await fire('f1')
      settle(0, false)
      await waitIdle()
      expect(n.numConsecutiveFailedAttempts).to.equal(1)
      expect(n.lastAttemptFailed).to.equal(true)
      expect(n.numTimesFired).to.equal(1)
      expect(n.enabled).to.equal(true)
      expect(errors()).to.include(`[NotificationManager] triggerNotification: onBackupFailed/${n.id} 1 failed attempts`)

      await fire('f2')
      settle(1, false)
      await waitIdle()
      expect(n.numConsecutiveFailedAttempts).to.equal(2)
      expect(n.enabled).to.equal(false)
      expect(errors()).to.include(`[NotificationManager] triggerNotification: onBackupFailed/${n.id} reached max failed attempts`)

      Logger.debug.resetHistory()
      await fire('f3')
      expect(axiosPost.callCount).to.equal(2)
      expect(NotificationManager.sendingNotification).to.equal(false)
      expect(debugs()).to.include('[NotificationManager] onBackupFailed: No active notifications')
    })

    it('resets the consecutive count after a success', async () => {
      const n = await configure({ maxFailedAttempts: 3 })
      await fire('x1')
      settle(0, false)
      await waitIdle()
      expect(n.numConsecutiveFailedAttempts).to.equal(1)
      await fire('x2')
      settle(1, true)
      await waitIdle()
      expect(n.numConsecutiveFailedAttempts).to.equal(0)
      expect(n.lastAttemptFailed).to.equal(false)
      expect(n.numTimesFired).to.equal(2)
      expect(n.enabled).to.equal(true)
    })

    it('a failed send still lets the queue drain', async () => {
      await configure({ maxNotificationQueue: 2, maxFailedAttempts: 5 })
      await fire('q1', 'q2')
      settle(0, false)
      await waitPosts(2)
      expect(bodies()).to.deep.equal(['q1', 'q2'])
      settle(1)
      await waitIdle()
    })
  })
})
