// Splits one agent run into phases and prints: prompt check, time and tokens per phase, the agent's own text messages, build and test runs, and key verification results.
// Usage: node phase-facts.js <session folder> <prompt file> <run folder> <output file>
const fs = require('fs')
const os = require('os')
const path = require('path')
const dir = process.argv[2]
const promptFile = process.argv[3]
const runRoot = process.argv[4]
const outFile = process.argv[5]
let userName = ''
try { userName = os.userInfo().username } catch (e) { userName = '' }
const userRe = userName.length >= 3 ? new RegExp(userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null
const out = []
function mask(s) {
  s = String(s)
  if (userRe) s = s.replace(userRe, '<user>')
  return s
    .replace(/([\\/]+Users[\\/]+)[^\\/\s"']+/gi, '$1<user>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
}
function say(s) { const m = mask(s); out.push(m); console.log(m) }
function nz(ts) {
  try { return new Date(ts).toLocaleString('sv-SE', { timeZone: 'Pacific/Auckland' }) } catch (e) { return String(ts) }
}
function norm(s) { return String(s).replace(/\s+/g, ' ').trim() }
function clip(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + ' ...' : s }
function listJsonl(d) {
  let r = []
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) r = r.concat(listJsonl(p))
    else if (e.name.endsWith('.jsonl')) r.push(p)
  }
  return r
}
const entries = []
listJsonl(dir).forEach((f) => {
  const isMain = path.dirname(f) === dir
  fs.readFileSync(f, 'utf8').split('\n').forEach((l) => {
    if (!l.trim()) return
    try { const o = JSON.parse(l); o.__main = isMain; entries.push(o) } catch (e) { /* skip */ }
  })
})
function userText(e) {
  const c = e.message && e.message.content
  let t = ''
  if (typeof c === 'string') t = c
  else if (Array.isArray(c)) t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
}

// 1. the prompt
say('== 1. The prompt ==')
const userMsgs = entries.filter((e) => e.type === 'user' && e.__main && !e.isSidechain).map((e) => ({ ts: e.timestamp, t: userText(e) })).filter((p) => p.t)
const promptMsg = userMsgs.find((p) => p.t.includes('Audiobookshelf server'))
if (!promptMsg) { say('  No message containing "Audiobookshelf server" was found.'); fs.writeFileSync(outFile, out.join('\n') + '\n'); process.exit(0) }
const P = promptMsg.ts
const sent = norm(promptMsg.t.replace(/<pasted_content[^>]*>/g, '').replace(/<\/pasted_content>/g, ''))
let want = ''
try { want = norm(fs.readFileSync(promptFile, 'utf8')) } catch (e) { say('  (prompt file not readable)') }
say('  Prompt sent at: ' + nz(P))
say('  Words in the message: ' + sent.split(' ').length)
if (want) say('  Equals the committed prompt file: ' + (sent === want) + '   (message contains file text: ' + sent.includes(want) + ', file contains message text: ' + want.includes(sent) + ')')
const before = userMsgs.filter((p) => p.ts < P)
say('  Messages before the prompt: ' + before.map((p) => clip(p.t, 120)).join(' | '))
const later = userMsgs.filter((p) => p.ts > P)
say('  Messages from the user after the prompt: ' + later.length)
later.slice(0, 5).forEach((p) => say('     ' + nz(p.ts) + '  ' + clip(p.t, 120)))

// tool uses and results
const uses = []
const results = {}
entries.forEach((e) => {
  const c = e.message && e.message.content
  if (!Array.isArray(c)) return
  c.forEach((b) => {
    if (b.type === 'tool_use') uses.push({ ts: e.timestamp, name: b.name, input: b.input || {}, id: b.id })
    if (b.type === 'tool_result') {
      let t = b.content
      if (Array.isArray(t)) t = t.map((x) => x.text || '').join('\n')
      results[b.tool_use_id] = { err: !!b.is_error, text: String(t || '') }
    }
  })
})
uses.sort((a, b) => (a.ts < b.ts ? -1 : 1))
const asst = entries.filter((e) => e.type === 'assistant' && e.__main && !e.isSidechain)

// final text message
const texts = []
const seenText = {}
asst.forEach((e) => {
  const c = e.message && e.message.content
  if (!Array.isArray(c)) return
  const t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  if (!t.trim()) return
  const id = e.message.id || e.uuid
  if (seenText[id] === undefined) { seenText[id] = texts.length; texts.push({ ts: e.timestamp, t }) } else { texts[seenText[id]].t += '\n' + t }
})
const F = texts.length ? texts[texts.length - 1].ts : asst[asst.length - 1].timestamp

// phase boundaries
const isChange = (u) => ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(u.name) || (u.name === 'Bash' && /\bgit\s+mv\b|\bgit\s+rm\b/.test(String(u.input.command || '')))
const after = uses.filter((u) => u.ts >= P)
const firstChange = after.find(isChange)
const convCommits = after.filter((u) => u.name === 'Bash' && /git\s+commit/.test(String(u.input.command || '')) && /Convert/.test(String(u.input.command || '')))
const lastConv = convCommits.length ? convCommits[convCommits.length - 1] : null
const T1 = firstChange ? firstChange.ts : P
const T2 = lastConv ? lastConv.ts : F
say('')
say('== 2. Time and tokens per phase ==')
say('  Prompt: ' + nz(P) + '   First file change: ' + nz(T1) + '   Last conversion commit command: ' + nz(T2) + '   Final message: ' + nz(F))
const phases = [
  { name: 'A orientation (prompt to first file change)', from: P, to: T1 },
  { name: 'B conversion (first change to last conversion commit)', from: T1, to: T2 },
  { name: 'C checking and report (after last conversion commit)', from: T2, to: F }
]
const byId = {}
asst.forEach((e) => {
  const m = e.message || {}
  if (!m.id || !m.usage) return
  const cur = byId[m.id]
  if (!cur || (m.usage.output_tokens || 0) >= (cur.u.output_tokens || 0)) byId[m.id] = { u: m.usage, ts: e.timestamp }
})
const totals = { n: 0, out: 0, think: 0, cr: 0, cw: 0 }
phases.forEach((ph) => { ph.n = 0; ph.out = 0; ph.think = 0; ph.cr = 0; ph.cw = 0; ph.tools = {} })
Object.keys(byId).forEach((id) => {
  const r = byId[id]
  const ph = phases.find((p) => r.ts > p.from && r.ts <= p.to)
  if (!ph) return
  ph.n++; ph.out += r.u.output_tokens || 0; ph.think += (r.u.output_tokens_details && r.u.output_tokens_details.thinking_tokens) || 0
  ph.cr += r.u.cache_read_input_tokens || 0; ph.cw += r.u.cache_creation_input_tokens || 0
  totals.n++; totals.out += r.u.output_tokens || 0; totals.think += (r.u.output_tokens_details && r.u.output_tokens_details.thinking_tokens) || 0
  totals.cr += r.u.cache_read_input_tokens || 0; totals.cw += r.u.cache_creation_input_tokens || 0
})
after.forEach((u) => { const ph = phases.find((p) => u.ts > p.from && u.ts <= p.to); if (ph) ph.tools[u.name] = (ph.tools[u.name] || 0) + 1 })
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-')
phases.forEach((ph) => {
  const mins = ((new Date(ph.to) - new Date(ph.from)) / 60000).toFixed(1)
  say('  ' + ph.name)
  say('     ' + mins + ' min | replies ' + ph.n + ' (' + pct(ph.n, totals.n) + ') | output tokens ' + ph.out + ' (' + pct(ph.out, totals.out) + ') | thinking ' + ph.think + ' | cache read ' + ph.cr + ' (' + pct(ph.cr, totals.cr) + ') | cache write ' + ph.cw + ' (' + pct(ph.cw, totals.cw) + ')')
  say('     tool calls: ' + JSON.stringify(ph.tools))
})
say('  Total from prompt to final message: ' + ((new Date(F) - new Date(P)) / 60000).toFixed(1) + ' min; replies ' + totals.n + '; output tokens ' + totals.out + '; cache read ' + totals.cr)

// 3. narration
say('')
say('== 3. Text messages written by the agent (' + texts.length + ') ==')
texts.forEach((x) => say('  ' + nz(x.ts).slice(11) + '  ' + clip(x.t, 380)))

// 4. build and test runs
say('')
say('== 4. Build and test runs by the agent ==')
const runs = after.filter((u) => u.name === 'Bash' && /npm (run )?(build:server|test)|npm run lint/.test(String(u.input.command || '')))
say('  Number of commands with npm build, test or lint: ' + runs.length)
runs.forEach((u) => {
  const r = results[u.id] ? results[u.id].text : ''
  const pm = r.match(/(\d+) passing/)
  const fm = r.match(/(\d+) failing/)
  const em = (r.match(/error TS/g) || []).length
  say('  ' + nz(u.ts).slice(11) + '  passing=' + (pm ? pm[1] : '-') + ' failing=' + (fm ? fm[1] : '0') + ' errorTS=' + em + '  ' + clip(u.input.command, 90))
})

// 5. key verification results
say('')
say('== 5. Key verification commands and what they printed ==')
const key = after.filter((u) => u.name === 'Bash' && /curl|difftest|smoke|planted|mutat|npm ls|eslint|astdiff|identical|ffmpeg/i.test(String(u.input.command || '')))
say('  Matching commands: ' + key.length + ' (first 45 shown)')
key.slice(0, 45).forEach((u) => {
  say('  ' + nz(u.ts).slice(11) + '  CMD: ' + clip(u.input.command, 170))
  say('            OUT: ' + clip(results[u.id] ? results[u.id].text : '(no result)', 360))
})
fs.writeFileSync(outFile, out.join('\n') + '\n')