// Extra facts from one agent run: how the prompt was wrapped, what the log holds after the final message,
// model time against tool time per phase, and the longest single waits.
// Usage: node more-facts.js <session folder> <prompt file> <output file>
const fs = require('fs')
const os = require('os')
const path = require('path')
const dir = process.argv[2]
const promptFile = process.argv[3]
const outFile = process.argv[4]
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
  if (path.dirname(f) !== dir) return
  fs.readFileSync(f, 'utf8').split('\n').forEach((l) => {
    if (!l.trim()) return
    try { entries.push(JSON.parse(l)) } catch (e) { /* skip */ }
  })
})
const main = entries.filter((e) => (e.type === 'user' || e.type === 'assistant') && !e.isSidechain && e.timestamp && e.message)
function rawText(e) {
  const c = e.message && e.message.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return ''
}
function cleanText(e) { return rawText(e).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim() }

// find the prompt message and the final text message
const userMsgs = main.filter((e) => e.type === 'user' && cleanText(e))
const promptEntry = userMsgs.find((e) => cleanText(e).includes('Audiobookshelf server'))
if (!promptEntry) { say('No prompt message found.'); fs.writeFileSync(outFile, out.join('\n') + '\n'); process.exit(0) }
const P = promptEntry.timestamp
let F = P
main.forEach((e) => {
  if (e.type === 'assistant' && Array.isArray(e.message.content) && e.message.content.some((b) => b.type === 'text' && b.text.trim())) F = e.timestamp
})

say('== 1. How the prompt reached the agent ==')
const raw = cleanText(promptEntry)
say('  Raw message length (characters): ' + raw.length)
say('  Raw message, first 160 characters: ' + clip(raw.slice(0, 160), 160))
say('  Raw message, last 160 characters: ' + clip(raw.slice(-160), 160))
const sent = norm(raw.replace(/<pasted_content[^>]*>/g, '').replace(/<\/pasted_content>/g, ''))
let want = ''
try { want = norm(fs.readFileSync(promptFile, 'utf8')) } catch (e) { say('  (prompt file not readable)') }
if (want) {
  const idx = sent.indexOf(want)
  if (idx >= 0) {
    say('  The sent text contains the committed file text. Text before it: [' + clip(sent.slice(0, idx), 300) + ']  Text after it: [' + clip(sent.slice(idx + want.length), 300) + ']')
  } else {
    say('  The sent text does NOT contain the committed file text.')
    let k = 0
    while (k < sent.length && k < want.length && sent[k] === want[k]) k++
    say('  First difference at character ' + k + '. Sent: [' + clip(sent.slice(Math.max(0, k - 40), k + 80), 140) + ']  File: [' + clip(want.slice(Math.max(0, k - 40), k + 80), 140) + ']')
  }
  say('  Words: sent ' + sent.split(' ').length + ', file ' + want.split(' ').length)
}

say('')
say('== 2. What the log holds after the final message (' + nz(F) + ') ==')
const post = main.filter((e) => e.timestamp > F)
const kinds = {}
post.forEach((e) => { const k = e.type + (Array.isArray(e.message.content) ? ':' + e.message.content.map((b) => b.type).join('+') : ':string'); kinds[k] = (kinds[k] || 0) + 1 })
say('  Entries after the final message: ' + post.length + '  ' + JSON.stringify(kinds))
post.filter((e) => e.type === 'user' && cleanText(e)).forEach((e) => {
  const t = cleanText(e)
  say('  ' + nz(e.timestamp) + '  user message, ' + t.length + ' characters. First 500: ' + clip(t.slice(0, 500), 500))
})

say('')
say('== 3. Model time against tool time (approximate; from the gaps between log entries) ==')
const useById = {}
main.forEach((e) => {
  if (e.type === 'assistant' && Array.isArray(e.message.content)) e.message.content.forEach((b) => { if (b.type === 'tool_use') useById[b.id] = b })
})
const firstChange = main.find((e) => e.timestamp >= P && e.type === 'assistant' && Array.isArray(e.message.content) && e.message.content.some((b) => b.type === 'tool_use' && (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(b.name) || (b.name === 'Bash' && /\bgit\s+mv\b|\bgit\s+rm\b/.test(String((b.input || {}).command || ''))))))
let lastConv = null
main.forEach((e) => {
  if (e.timestamp >= P && e.type === 'assistant' && Array.isArray(e.message.content) && e.message.content.some((b) => b.type === 'tool_use' && b.name === 'Bash' && /git\s+commit/.test(String((b.input || {}).command || '')) && /Convert/.test(String((b.input || {}).command || '')))) lastConv = e
})
const T1 = firstChange ? firstChange.timestamp : P
const T2 = lastConv ? lastConv.timestamp : F
const phases = [
  { name: 'A orientation', from: P, to: T1, model: 0, tool: 0, other: 0 },
  { name: 'B conversion', from: T1, to: T2, model: 0, tool: 0, other: 0 },
  { name: 'C checking and report', from: T2, to: F, model: 0, tool: 0, other: 0 }
]
const gaps = []
let prev = null
main.forEach((e) => {
  if (e.timestamp < P) { prev = e; return }
  if (prev && prev.timestamp >= P && e.timestamp <= F) {
    const mins = (new Date(e.timestamp) - new Date(prev.timestamp)) / 60000
    const ph = phases.find((p) => e.timestamp > p.from && e.timestamp <= p.to)
    let kind = 'other'
    let label = ''
    const c = e.message && e.message.content
    if (e.type === 'assistant') {
      kind = 'model'
      const u = e.message.usage || {}
      const blk = Array.isArray(c) ? c.map((b) => b.type + (b.type === 'tool_use' ? ':' + b.name : '')).join('+') : 'text'
      label = 'blocks=' + blk + ' output_tokens=' + (u.output_tokens || 0) + ' thinking=' + ((u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0)
    } else if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) {
      kind = 'tool'
      const tr = c.find((b) => b.type === 'tool_result')
      const tu = useById[tr.tool_use_id]
      label = tu ? tu.name + ': ' + clip(tu.input.command || tu.input.file_path || tu.input.pattern || '', 150) : 'tool'
    }
    if (ph) ph[kind] += mins
    gaps.push({ mins, kind, ts: e.timestamp, label })
  }
  prev = e
})
phases.forEach((ph) => {
  const tot = ph.model + ph.tool + ph.other
  say('  ' + ph.name + ': total ' + tot.toFixed(1) + ' min | model ' + ph.model.toFixed(1) + ' | tools ' + ph.tool.toFixed(1) + ' | other ' + ph.other.toFixed(1))
})
const tm = phases.reduce((a, p) => a + p.model, 0)
const tt = phases.reduce((a, p) => a + p.tool, 0)
const to = phases.reduce((a, p) => a + p.other, 0)
say('  All phases: model ' + tm.toFixed(1) + ' min, tools ' + tt.toFixed(1) + ' min, other ' + to.toFixed(1) + ' min')

say('')
say('== 4. The 10 longest waits for the model ==')
gaps.filter((g) => g.kind === 'model').sort((a, b) => b.mins - a.mins).slice(0, 10).forEach((g) => say('  ' + g.mins.toFixed(1) + ' min  ' + nz(g.ts).slice(11) + '  ' + g.label))
say('')
say('== 5. The 10 longest tool calls ==')
gaps.filter((g) => g.kind === 'tool').sort((a, b) => b.mins - a.mins).slice(0, 10).forEach((g) => say('  ' + g.mins.toFixed(1) + ' min  ' + nz(g.ts).slice(11) + '  ' + g.label))
fs.writeFileSync(outFile, out.join('\n') + '\n')