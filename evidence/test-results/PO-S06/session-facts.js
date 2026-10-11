// Reads a Claude Code session log folder and prints facts about one agent run: prompt, model, effort, mode, tools, commits, files read, access outside the run folder, errors, tokens, cost and the final message.
// Usage: node session-facts.js <session folder> <prompt file> <output file> <final message file> <run folder>
const fs = require('fs')
const path = require('path')
const dir = process.argv[2]
const promptFile = process.argv[3]
const outFile = process.argv[4]
const finalFile = process.argv[5]
const runRoot = process.argv[6]
const out = []
function mask(s) {
  return String(s)
    .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, '$1<user>')
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
const files = listJsonl(dir)
say('Session log facts. Files found: ' + files.length)
files.forEach((f) => say('  ' + path.relative(dir, f) + '  ' + fs.statSync(f).size + ' bytes'))

const runLower = runRoot.replace(/\//g, '\\').toLowerCase()
const entries = []
let badLines = 0
files.forEach((f) => {
  const isMain = path.dirname(f) === dir
  fs.readFileSync(f, 'utf8').split('\n').forEach((l) => {
    if (!l.trim()) return
    try { const o = JSON.parse(l); o.__file = path.relative(dir, f); o.__main = isMain; entries.push(o) } catch (e) { badLines++ }
  })
})
say('Log lines: ' + entries.length + ' (unreadable: ' + badLines + ')')
const counts = {}
entries.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1 })
say('Line types: ' + JSON.stringify(counts))

// time span
const stamps = entries.filter((e) => e.timestamp).map((e) => e.timestamp).sort()
say('First log time: ' + nz(stamps[0]) + '   Last log time: ' + nz(stamps[stamps.length - 1]) + '   (Pacific/Auckland)')

// versions, cwd, model, effort, mode
function tally(vals) { const t = {}; vals.forEach((v) => { if (v !== undefined && v !== null) t[v] = (t[v] || 0) + 1 }); return JSON.stringify(t) }
const asst = entries.filter((e) => e.type === 'assistant')
say('Claude Code version: ' + tally(entries.map((e) => e.version)))
say('Working folder (cwd): ' + tally(entries.map((e) => e.cwd)))
say('Git branch: ' + tally(entries.map((e) => e.gitBranch)))
say('Entry point: ' + tally(entries.map((e) => e.entrypoint)))
say('Model of replies: ' + tally(asst.map((e) => e.message && e.message.model)))
say('Requested model: ' + tally(asst.map((e) => e.requestedModel)))
say('Effort: ' + tally(asst.map((e) => e.effort)) + '   per turn: ' + tally(asst.map((e) => e.perTurnEffort)))
say('Mode lines: ' + tally(entries.filter((e) => e.type === 'mode').map((e) => e.mode)))
say('permissionMode values: ' + tally(entries.map((e) => e.permissionMode)))
const dec = entries.filter((e) => e.permissionDecision).map((e) => JSON.stringify(e.permissionDecision))
say('Permission decisions: ' + tally(dec))
const sidechain = entries.filter((e) => e.isSidechain || !e.__main).length
say('Lines from subagents (sidechain or subfolder): ' + sidechain)

// user prompts
function userText(e) {
  const c = e.message && e.message.content
  let t = ''
  if (typeof c === 'string') t = c
  else if (Array.isArray(c)) t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
}
const prompts = entries.filter((e) => e.type === 'user' && e.__main && !e.isSidechain && !e.isMeta).map((e) => ({ ts: e.timestamp, t: userText(e) })).filter((p) => p.t).sort((a, b) => (a.ts < b.ts ? -1 : 1))
say('')
say('== Messages typed by the user (' + prompts.length + ') ==')
prompts.forEach((p, i) => say('  [' + (i + 1) + '] ' + nz(p.ts) + '  ' + clip(p.t, 260)))
if (prompts.length) {
  let want = ''
  try { want = fs.readFileSync(promptFile, 'utf8') } catch (e) { say('  (prompt file not readable)') }
  if (want) {
    const a = norm(prompts[0].t)
    const b = norm(want)
    say('  First message equals the committed prompt file: ' + (a === b) + '   (log contains file text: ' + a.includes(b) + ', file contains log text: ' + b.includes(a) + ')')
    say('  First message word count: ' + a.split(' ').length)
  }
}

// tool uses and results
const uses = []
const results = {}
entries.forEach((e) => {
  const c = e.message && e.message.content
  if (!Array.isArray(c)) return
  c.forEach((b) => {
    if (b.type === 'tool_use') uses.push({ ts: e.timestamp, name: b.name, input: b.input || {}, id: b.id, side: !!e.isSidechain || !e.__main })
    if (b.type === 'tool_result') {
      let t = b.content
      if (Array.isArray(t)) t = t.map((x) => x.text || '').join('\n')
      results[b.tool_use_id] = { err: !!b.is_error, text: String(t || '') }
    }
  })
})
uses.sort((a, b) => (a.ts < b.ts ? -1 : 1))
const toolCount = {}
uses.forEach((u) => { toolCount[u.name] = (toolCount[u.name] || 0) + 1 })
say('')
say('== Tool calls (' + uses.length + ') ==')
say('  ' + JSON.stringify(toolCount))
const firstPromptTs = prompts.length ? prompts[0].ts : stamps[0]

// first file change
const isChange = (u) => ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(u.name) || (u.name === 'Bash' && /\bgit\s+mv\b|\bmv\b|\bgit\s+rm\b/.test(String(u.input.command || '')))
const firstChange = uses.findIndex(isChange)
if (firstChange >= 0) {
  say('  First file change: ' + nz(uses[firstChange].ts) + ' (' + Math.round((new Date(uses[firstChange].ts) - new Date(firstPromptTs)) / 1000) + ' s after the first message), after ' + firstChange + ' earlier tool calls')
}
const lastUse = uses[uses.length - 1]
if (lastUse) say('  Last tool call: ' + nz(lastUse.ts) + ' (' + lastUse.name + ')')

// Bash
const bash = uses.filter((u) => u.name === 'Bash')
say('')
say('== Bash commands (' + bash.length + ') ==')
const verbs = {}
bash.forEach((u) => { const w = String(u.input.command || '').trim().split(/\s+/).slice(0, 2).join(' '); verbs[w] = (verbs[w] || 0) + 1 })
Object.entries(verbs).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => say('  ' + String(v).padStart(4) + '  ' + k))
const buildTest = bash.filter((u) => /npm (run )?(build:server|test)|\btsc\b|mocha/.test(String(u.input.command || '')))
say('  Build, type-check or test commands: ' + buildTest.length)
const tscCheck = bash.filter((u) => /tsc/.test(String(u.input.command || '')) && !/build:server/.test(String(u.input.command || '')))
say('  Direct tsc commands: ' + tscCheck.length)
tscCheck.slice(0, 8).forEach((u) => say('     ' + nz(u.ts) + '  ' + clip(u.input.command, 140)))

// commits
const commits = bash.filter((u) => /git\s+(--no-optional-locks\s+)?commit/.test(String(u.input.command || '')))
say('')
say('== git commit commands (' + commits.length + ') ==')
commits.forEach((u) => say('  ' + nz(u.ts) + '  ' + clip(u.input.command, 150)))

// intervals between commits
const marks = [{ ts: firstPromptTs, label: 'start' }].concat(commits.map((u) => ({ ts: u.ts, label: 'commit' })))
say('')
say('== Tool calls between commits ==')
for (let i = 1; i < marks.length; i++) {
  const from = marks[i - 1].ts
  const to = marks[i].ts
  const inside = uses.filter((u) => u.ts > from && u.ts <= to)
  const tc = {}
  inside.forEach((u) => { tc[u.name] = (tc[u.name] || 0) + 1 })
  const mins = ((new Date(to) - new Date(from)) / 60000).toFixed(1)
  say('  ' + nz(from).slice(11) + ' -> ' + nz(to).slice(11) + '  (' + mins + ' min)  ' + JSON.stringify(tc))
  if (new Date(to) - new Date(from) > 10 * 60000) {
    inside.filter((u) => u.name === 'Bash').slice(0, 40).forEach((u) => say('       ' + nz(u.ts).slice(11) + '  ' + clip(u.input.command, 120)))
  }
}
if (commits.length) {
  const after = uses.filter((u) => u.ts > commits[commits.length - 1].ts)
  const tc = {}
  after.forEach((u) => { tc[u.name] = (tc[u.name] || 0) + 1 })
  say('  After the last commit command: ' + JSON.stringify(tc))
  after.filter((u) => u.name === 'Bash').slice(0, 30).forEach((u) => say('       ' + nz(u.ts).slice(11) + '  ' + clip(u.input.command, 120)))
}

// files read and changed
const rel = (p) => {
  const s = String(p).replace(/\//g, '\\')
  return s.toLowerCase().startsWith(runLower) ? s.slice(runRoot.length).replace(/^\\/, '') : s
}
const reads = {}
uses.filter((u) => u.name === 'Read').forEach((u) => { const p = rel(u.input.file_path || ''); reads[p] = (reads[p] || 0) + 1 })
say('')
say('== Files read with the Read tool (' + Object.keys(reads).length + ' different files) ==')
Object.entries(reads).sort((a, b) => b[1] - a[1]).slice(0, 70).forEach(([k, v]) => say('  ' + String(v).padStart(3) + '  ' + k))
const edits = {}
uses.filter((u) => ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(u.name)).forEach((u) => { const p = rel(u.input.file_path || ''); edits[p] = (edits[p] || 0) + 1 })
say('')
say('== Files changed with Edit or Write (' + Object.keys(edits).length + ' different files) ==')
Object.entries(edits).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => say('  ' + String(v).padStart(3) + '  ' + k))
const searches = uses.filter((u) => ['Grep', 'Glob'].includes(u.name))
say('')
say('Grep and Glob calls: ' + searches.length)

// access outside the run folder
say('')
say('== Paths used outside the run folder ==')
const outside = {}
const dots = []
uses.forEach((u) => {
  const s = JSON.stringify(u.input).replace(/\\\\/g, '\\')
  const m = s.match(/[A-Za-z]:[\\/][^\s"'<>|*?`]+/g) || []
  m.forEach((p) => {
    const q = p.replace(/\//g, '\\').replace(/\\+/g, '\\').replace(/[\\.,;)\]]+$/, '')
    if (!q.toLowerCase().startsWith(runLower)) outside[q] = (outside[q] || 0) + 1
  })
  if (u.name === 'Bash' && /(^|[\s"'=])\.\.[\\/]/.test(String(u.input.command || ''))) dots.push(u)
})
const outKeys = Object.keys(outside)
say('  Different absolute paths outside the run folder: ' + outKeys.length)
outKeys.sort((a, b) => outside[b] - outside[a]).slice(0, 40).forEach((k) => say('  ' + String(outside[k]).padStart(3) + '  ' + k))
say('  Bash commands with a ../ path: ' + dots.length)
dots.slice(0, 15).forEach((u) => say('     ' + nz(u.ts) + '  ' + clip(u.input.command, 140)))

// subagents and other special tools
say('')
say('== Subagents, questions, skills, web ==')
const sub = uses.filter((u) => ['Agent', 'Task'].includes(u.name))
say('  Subagent calls: ' + sub.length)
sub.slice(0, 15).forEach((u) => say('     ' + nz(u.ts) + '  ' + clip(u.input.subagent_type || '', 30) + '  ' + clip(u.input.description || '', 60) + '  | ' + clip(u.input.prompt || '', 160)))
const ask = uses.filter((u) => u.name === 'AskUserQuestion')
say('  Questions asked to the user: ' + ask.length)
ask.slice(0, 10).forEach((u) => say('     ' + nz(u.ts) + '  ' + clip(JSON.stringify(u.input), 260)))
;['Skill', 'WebSearch', 'WebFetch', 'ToolSearch', 'TaskCreate', 'TaskUpdate', 'EnterPlanMode'].forEach((n) => {
  const x = uses.filter((u) => u.name === n)
  if (x.length) { say('  ' + n + ': ' + x.length); x.slice(0, 4).forEach((u) => say('     ' + nz(u.ts) + '  ' + clip(JSON.stringify(u.input), 150))) }
})

// errors and denials
say('')
say('== Errors and refusals ==')
const errs = uses.filter((u) => results[u.id] && results[u.id].err)
say('  Tool results marked as errors: ' + errs.length)
errs.slice(0, 12).forEach((u) => say('     ' + nz(u.ts) + '  ' + u.name + '  ' + clip(results[u.id].text, 170)))
const deny = uses.filter((u) => results[u.id] && /denied|not allowed|permission|blocked by|auto mode|classifier|requires approval/i.test(results[u.id].text) && results[u.id].text.length < 2000)
say('  Results mentioning denied, permission or blocked: ' + deny.length)
deny.slice(0, 12).forEach((u) => say('     ' + nz(u.ts) + '  ' + u.name + '  ' + clip(JSON.stringify(u.input), 90) + '  =>  ' + clip(results[u.id].text, 150)))
const interrupts = entries.filter((e) => JSON.stringify(e.message || '').includes('Request interrupted')).length
say('  Interrupted by the user: ' + interrupts)

// words that show where knowledge came from
say('')
say('== Mentions of names that should not be known to the agent (log lines containing them) ==')
const words = ['SP-S01', 'PO-S01', 'audiobookshelf-po', 'po-session-backup', 'po-s06-baseline', 'CLAUDE.md', 'superpowers', 'tailwind']
const rawLines = entries.map((e) => JSON.stringify(e))
words.forEach((w) => {
  const hit = rawLines.filter((l) => l.includes(w))
  say('  ' + w + ': ' + hit.length)
  hit.slice(0, 3).forEach((l) => { const i = l.indexOf(w); say('       ...' + clip(l.slice(Math.max(0, i - 90), i + 110), 200)) })
})

// tokens (one count per message id)
const byId = {}
asst.forEach((e) => {
  const m = e.message || {}
  const u = m.usage
  if (!m.id || !u) return
  const cur = byId[m.id]
  if (!cur || (u.output_tokens || 0) >= (cur.output_tokens || 0)) byId[m.id] = u
})
const ids = Object.keys(byId)
const sum = (f) => ids.reduce((a, i) => a + (f(byId[i]) || 0), 0)
say('')
say('== Tokens counted from the log (one count per reply) ==')
say('  Replies: ' + ids.length)
say('  Input: ' + sum((u) => u.input_tokens) + '   Output: ' + sum((u) => u.output_tokens) + '   of which thinking: ' + sum((u) => u.output_tokens_details && u.output_tokens_details.thinking_tokens))
say('  Cache read: ' + sum((u) => u.cache_read_input_tokens) + '   Cache write: ' + sum((u) => u.cache_creation_input_tokens))
const cs = entries.filter((e) => e.type === 'cost-state')
if (cs.length) {
  const l = cs[cs.length - 1]
  say('  Last cost line in the log: total cost ' + l.totalCostUSD + ' USD; API time ' + Math.round(l.totalAPIDuration / 1000) + ' s; wall ' + Math.round(l.totalDuration / 1000) + ' s; lines added ' + l.totalLinesAdded + ', removed ' + l.totalLinesRemoved + '; session start ' + nz(l.startTime))
  say('  Model usage: ' + clip(JSON.stringify(l.modelUsage), 600))
} else {
  say('  No cost line in the log.')
}

// final message
const textByMsg = []
const seen = {}
asst.filter((e) => e.__main && !e.isSidechain).forEach((e) => {
  const c = e.message && e.message.content
  if (!Array.isArray(c)) return
  const t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  if (!t.trim()) return
  const id = e.message.id || e.uuid
  if (seen[id] === undefined) { seen[id] = textByMsg.length; textByMsg.push({ ts: e.timestamp, t }) } else { textByMsg[seen[id]].t += '\n' + t }
})
say('')
if (textByMsg.length) {
  const fin = textByMsg[textByMsg.length - 1]
  say('== Final message of the agent (' + nz(fin.ts) + ') ==')
  say(fin.t)
  fs.writeFileSync(finalFile, mask(fin.t) + '\n')
  say('== End of final message ==')
  say('Agent replies that contain text: ' + textByMsg.length)
} else {
  say('No agent text message found.')
}
fs.writeFileSync(outFile, out.join('\n') + '\n')