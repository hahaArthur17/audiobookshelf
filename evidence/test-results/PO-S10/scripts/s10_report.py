import json,re,os,glob,collections,subprocess
from datetime import datetime,timedelta,timezone
D=os.path.expanduser('~/mnt/Project/po-session-backup/PO-S10'); SID='bca2b50b-ca0f-4d85-ae6b-75f7bfb74f79'
REPO=os.path.expanduser('~/mnt/Project/audiobookshelf-po')
OUT=os.path.expanduser('~/work/out')
def mask(s): return re.sub(r'(?i)(users(?:\\\\|\\|/))[^\\/"\s]+',r'\1<user>',s)
def nz(t): return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=13))).strftime('%H:%M:%S')
def load(p): return [json.loads(l) for l in open(p,encoding='utf-8',errors='replace')]
def blocks(r):
    c=r.get('message',{}).get('content'); return c if isinstance(c,list) else []
files=[('main',f'{D}/{SID}.jsonl')]
for jp in sorted(glob.glob(f'{D}/{SID}/subagents/*.jsonl')):
    files.append((json.load(open(jp[:-6]+'.meta.json'))['description'],jp))
L=[]
def P(s=''): L.append(s)
P('PO-S10 session log analysis (made by Claude from the saved Claude Code logs; numbers are counted by a script)')
P('Source: po-session-backup/PO-S10 (session bca2b50b, main log + 6 sub-agent logs). Times are NZDT, 2026-10-11. The Windows user name is masked.')
P()
P('1. Timeline')
ev=[]
main=load(files[0][1])
for r in main:
    if r.get('type')=='user' and not r.get('isMeta'):
        c=r.get('message',{}).get('content')
        bl=c if isinstance(c,list) else [{'type':'text','text':c}] if isinstance(c,str) else []
        for b in bl:
            t=b.get('text','') if isinstance(b,dict) else ''
            if 'Continue the JavaScript to TypeScript migration' in t: ev.append((nz(r['timestamp']),'User pastes the prompt (%d characters)'%len(t)))
            if t.startswith('<command-name>/'): ev.append((nz(r['timestamp']),'Command: '+t.split('</command-name>')[0].replace('<command-name>','')))
    if r.get('type')=='assistant':
        for b in blocks(r):
            if b.get('type')=='tool_use':
                i=b['input']
                if b['name']=='Agent': ev.append((nz(r['timestamp']),'Agent started: %s (brief %d characters)'%(i.get('description'),len(i.get('prompt','')))))
                if b['name']=='SendMessage': ev.append((nz(r['timestamp']),'Main agent -> sub-agent %s: %s'%(i.get('to'),i.get('summary'))))
                if b['name']=='TaskStop': ev.append((nz(r['timestamp']),'TaskStop (timer stopped)'))
                if b['name']=='Bash' and i.get('command','').lstrip().startswith('date'): ev.append((nz(r['timestamp']),'First command: date (as the prompt asked)'))
for name,p in files[1:]:
    rows=load(p)
    ts=[r['timestamp'] for r in rows if r.get('timestamp')]
    ev.append((nz(min(ts)),'Sub-agent first log line: '+name)); ev.append((nz(max(ts)),'Sub-agent last log line: '+name))
    for r in rows:
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use' and b['name']=='SubagentHandback':
                    t=json.dumps(b['input'])
                    ev.append((nz(r['timestamp']),'Hand-back from %s (%d characters)'%(name,len(t))))
for r in main:
    if r.get('type')=='system': ev.append((nz(r['timestamp']),'System: '+str(r.get('subtype'))))
g=subprocess.run(['git','--no-optional-locks','-C',REPO,'log','--format=%cd|%h|%s','--date=format-local:%H:%M:%S','6752a047..3dfc6779'],capture_output=True,text=True,env={**os.environ,'TZ':'Pacific/Auckland'})
for l in g.stdout.strip().splitlines():
    t,h,s=l.split('|',2); ev.append((t,'Commit %s %s'%(h,s)))
for t,e in sorted(ev): P('  %s  %s'%(t,e))
P()
P('2. Agents: API messages and tokens counted in the logs (one row per API message, no double counting)')
P('   %-46s %5s %8s %8s %12s %10s %8s'%('agent','msgs','input','output','cache read','cache wr','wall min'))
tot=collections.Counter(); per={}; models=collections.Counter()
for name,p in files:
    rows=load(p); best={}
    for r in rows:
        if r.get('type')=='assistant':
            m=r['message']; u=m.get('usage',{}) or {}; k=m.get('id') or r.get('uuid')
            models[m.get('model')]+=1
            if k not in best or u.get('output_tokens',0)>=best[k].get('output_tokens',0): best[k]=u
    c=collections.Counter()
    for u in best.values():
        for f in('input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'): c[f]+=u.get(f,0) or 0
    ts=[r['timestamp'] for r in rows if r.get('timestamp')]
    w=(datetime.fromisoformat(max(ts).replace('Z','+00:00'))-datetime.fromisoformat(min(ts).replace('Z','+00:00'))).total_seconds()/60
    P('   %-46s %5d %8d %8d %12d %10d %8.1f'%(name[:46],len(best),c['input_tokens'],c['output_tokens'],c['cache_read_input_tokens'],c['cache_creation_input_tokens'],w))
    for f in c: tot[f]+=c[f]
    per[name]=(len(best),c)
P('   %-46s %5d %8d %8d %12d %10d'%('TOTAL in the logs',sum(v[0] for v in per.values()),tot['input_tokens'],tot['output_tokens'],tot['cache_read_input_tokens'],tot['cache_creation_input_tokens']))
P('   Models named in the assistant lines: '+str(dict(models)))
P('   /usage at the end (Opus 5.5, from the terminal): input 816.3k, output 1.0m, cache read 100.9m, cache write 2.8m, cost $59.35 (Haiku 5.5: input 2.9k, output 25, $0.0003)')
gap={'input':816300-tot['input_tokens'],'output':1000000-tot['output_tokens'],'cache read':100900000-tot['cache_read_input_tokens'],'cache write':2800000-tot['cache_creation_input_tokens']}
P('   Not found in the logs (usage minus logs): '+', '.join('%s %.1fk'%(k,v/1000) for k,v in gap.items()))
cl=0
for name,p in files:
    for r in load(p):
        d=r.get('permissionDecision')
        if d and d.get('reasonType')=='classifier': cl+=1
P('   Permission decisions made by the auto-mode classifier in the logs: %d.'%cl)
wl=lambda i,o,cr,cw: i+5*o+0.1*cr+2*cw
wlog=wl(tot['input_tokens'],tot['output_tokens'],tot['cache_read_input_tokens'],tot['cache_creation_input_tokens'])
wgap=wl(gap['input'],gap['output'],gap['cache read'],gap['cache write'])
P('   Weighted tokens (input 1 : output 5 : cache read 0.1 : cache write 2, an assumption): the part not found in the logs is %.0f%% of the total.'%(100*wgap/(wgap+wlog)))
P('   Share of the logged weighted tokens by agent (same ratios):')
for name,(n,c) in per.items(): P('     %-46s %4.1f%%'%(name[:46],100*wl(c['input_tokens'],c['output_tokens'],c['cache_read_input_tokens'],c['cache_creation_input_tokens'])/wlog))
P()
P('3. Tool calls per agent')
for name,p in files:
    c=collections.Counter(); gv=collections.Counter()
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use':
                    c[b['name']]+=1
                    if b['name']=='Bash':
                        for m in re.finditer(r'\bgit\s+(?:--no-optional-locks\s+)?([a-z-]+)',b['input'].get('command','')): gv[m.group(1)]+=1
    P('   %-46s %s'%(name[:46],dict(c.most_common())))
    P('   %-46s git verbs: %s'%('',dict(gv.most_common())))
P()
P('4. Permissions')
for name,p in files:
    c=collections.Counter()
    for r in load(p):
        d=r.get('permissionDecision')
        if d: c[(d.get('decision'),d.get('reasonType'))]+=1
    P('   %-46s %s'%(name[:46],{('%s/%s'%k):v for k,v in c.items()}))
P()
P('5. Did any agent touch evidence/, the hold folder, or git history of the notes? (any tool, any agent)')
pat=re.compile(r'evidence|PO-S[01]\d-notes|PO-S[01]\d-prompt|po-s09-hold|po-s10-hold|po-s10-store|po-session-backup|_to_delete|git\s+(?:--no-optional-locks\s+)?(?:show|log|cat-file|diff|grep|ls-tree)\b',re.I)
for name,p in files:
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use':
                    s=json.dumps(b['input'])
                    if pat.search(s) and b['name'] in('Bash','Read','Grep','Glob','Edit','Write'):
                        P('   %s  %-34s %s %s'%(nz(r['timestamp']),name[:34],b['name'],mask(s).replace('\\n',' ')[:260]))
P()
P('6. Writes outside the repo and shell writes')
P('   Write/Edit tool calls whose path is not inside the repo (memory files and the like):')
for name,p in files:
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use' and b['name'] in('Write','Edit'):
                    fp=mask(b['input'].get('file_path','')); 
                    if not re.search(r'audiobookshelf-po',fp,re.I) and 'scratchpad' not in fp.lower():
                        P('     %s  %-30s %s %s'%(nz(r['timestamp']),name[:30],b['name'],fp))
P('   Shell commands that write in place, by agent (sed -i, perl -i, python or node file writes, redirects into server/, tee, rm, git checkout/restore/stash/reset):')
wp=re.compile(r'\bsed\s+(-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|open\([^)]*[\'"]w|writeFileSync|writeFile\(|\btee\b|>\s*server/|\brm\s|git\s+(?:--no-optional-locks\s+)?(?:checkout|restore|stash|reset|clean)\b')
for name,p in files:
    cnt=collections.Counter()
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use' and b['name']=='Bash':
                    cmd=b['input'].get('command','')
                    for m in wp.finditer(cmd): cnt[re.sub(r'\s+',' ',m.group(0))[:30]]+=1
    P('     %-40s %s'%(name[:40],dict(cnt)))
P()
P('7. Memory use by the main agent (Write/Edit/Read/Bash paths that contain "memory")')
for name,p in files:
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use':
                    s=json.dumps(b['input'])
                    if re.search(r'memory|MEMORY',s) and b['name']!='Agent':
                        P('     %s %-30s %s %s'%(nz(r['timestamp']),name[:30],b['name'],mask(s)[:230]))
open(OUT+'/s10-session-log-analysis.txt','w',encoding='utf-8').write('\n'.join(L)+'\n')
print('\n'.join(L))
