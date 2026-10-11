import json,re,os,glob,collections
D=os.path.expanduser('~/mnt/Project/po-session-backup/PO-S09'); SID='9d365d79-d2df-436f-9cce-424144a1527e'
def mask(s): return re.sub(r'(?i)(users(?:\\\\|\\|/))[^\\/"\s]+',r'\1<user>',s)
def load(p): return [json.loads(l) for l in open(p,encoding='utf-8',errors='replace')]
def blocks(r):
    c=r.get('message',{}).get('content'); return c if isinstance(c,list) else []
files=[('main',f'{D}/{SID}.jsonl')]
for jp in sorted(glob.glob(f'{D}/{SID}/subagents/*.jsonl')):
    files.append((json.load(open(jp[:-6]+'.meta.json'))['description'],jp))
print('A. memory files written by the main agent')
for r in load(files[0][1]):
    if r.get('type')=='assistant':
        for b in blocks(r):
            if b.get('type')=='tool_use' and b['name']=='Write' and 'memory' in b['input'].get('file_path',''):
                print('---',mask(b['input']['file_path'])); print(b['input']['content'])
print()
print('B. Edit/Write paths by agent (repo-relative), counts')
for name,p in files:
    c=collections.Counter()
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use' and b['name'] in('Edit','Write'):
                    fp=mask(b['input'].get('file_path','')).replace('\\','/')
                    fp=re.sub(r'(?i)^.*audiobookshelf-po/','REPO/',fp)
                    fp=re.sub(r'(?i)^.*scratchpad/','SCRATCH/',fp)
                    c[(b['name'],fp)]+=1
    print(' ',name)
    for k,v in sorted(c.items()): print('     %3d %s %s'%(v,k[0],k[1]))
print()
print('C. sub-agent Bash commands with npm / node build / commit / tsc build / rm / writeFileSync / git config')
pat=re.compile(r'npm |npx (?!tsc -p tsconfig\.check)|git commit|tsc -p tsconfig\.server|\brm\b|writeFileSync|git config|git add|git stash|git restore|git checkout|git reset')
for name,p in files:
    for r in load(p):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use' and b['name']=='Bash':
                    cmd=b['input'].get('command','')
                    ms=sorted(set(m.group(0) for m in pat.finditer(cmd)))
                    if ms:
                        c2=re.sub(r'/c/Users/[^/]+/AppData/Local/Temp/claude/[^/]+/[^/]+/scratchpad','<scratch>',mask(cmd)).replace('\n',' ')
                        for m in pat.finditer(c2):
                            s=max(0,m.start()-60); print('   %-28s %-14s ...%s'%(name[:28],m.group(0),c2[s:m.end()+110])); break
