import json,re,os,glob,sys
from datetime import datetime,timedelta,timezone
D=os.path.expanduser('~/mnt/Project/po-session-backup/PO-S09'); SID='9d365d79-d2df-436f-9cce-424144a1527e'
def mask(s): return re.sub(r'(?i)(users(?:\\\\|\\|/))[^\\/"\s]+',r'\1<user>',s)
def nz(t): return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=13))).strftime('%H:%M:%S')
def load(p): return [json.loads(l) for l in open(p,encoding='utf-8',errors='replace')]
def blocks(r):
    c=r.get('message',{}).get('content'); return c if isinstance(c,list) else []
main=load(f'{D}/{SID}.jsonl')
uses={}; res={}
for r in main:
    if r.get('type')=='assistant':
        for b in blocks(r):
            if b.get('type')=='tool_use': uses[b['id']]=(r['timestamp'],b)
    if r.get('type')=='user':
        for b in blocks(r):
            if b.get('type')=='tool_result':
                c=b.get('content'); t=c if isinstance(c,str) else ' '.join(x.get('text','') for x in c if isinstance(x,dict))
                res[b['tool_use_id']]=t
want=sys.argv[1:]
for tid,(ts,b) in uses.items():
    t=nz(ts)
    if any(t.startswith(w) for w in want):
        print('=====',t,b['name']); 
        inp=b['input']
        print(mask(inp.get('command') or json.dumps(inp))[:int(os.environ.get('CL','1800'))])
        print('--- result:'); print(mask(res.get(tid,'(none)'))[:int(os.environ.get('RL','2500'))])
