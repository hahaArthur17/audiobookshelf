import json,re,os,glob
from datetime import datetime,timedelta,timezone
D=os.path.expanduser('~/mnt/Project/po-session-backup/PO-S09'); SID='9d365d79-d2df-436f-9cce-424144a1527e'
def mask(s): return re.sub(r'(?i)(users(?:\\\\|\\|/))[^\\/"\s]+',r'\1<user>',s)
def nz(t): return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=13))).strftime('%H:%M:%S')
def load(p): return [json.loads(l) for l in open(p,encoding='utf-8',errors='replace')]
def blocks(r):
    c=r.get('message',{}).get('content'); return c if isinstance(c,list) else []
O=[]
O.append('PO-S09: messages between the main agent and the four sub-agents, copied from the saved logs (session 9d365d79). Times are NZDT. The Windows user name is masked as <user>.\n')
main=load(f'{D}/{SID}.jsonl')
for r in main:
    if r.get('type')=='assistant':
        for b in blocks(r):
            if b.get('type')=='tool_use' and b['name'] in('Agent','SendMessage'):
                i=b['input']
                O.append('='*100); O.append('%s  main agent -> %s  [%s]'%(nz(r['timestamp']),b['name'],i.get('description') or i.get('to')))
                O.append(mask(i.get('prompt') or i.get('message') or json.dumps(i))); O.append('')
for jp in sorted(glob.glob(f'{D}/{SID}/subagents/*.jsonl')):
    name=json.load(open(jp[:-6]+'.meta.json'))['description']
    for r in load(jp):
        if r.get('type')=='assistant':
            for b in blocks(r):
                if b.get('type')=='tool_use' and b['name']=='SubagentHandback':
                    O.append('='*100); O.append('%s  HAND-BACK of sub-agent "%s"'%(nz(r['timestamp']),name))
                    O.append(mask(b['input'].get('message') or json.dumps(b['input']))); O.append('')
open(os.path.expanduser('~/work/out/PO-S09-agent-messages.txt'),'w',encoding='utf-8').write('\n'.join(O))
print(len('\n'.join(O)),'chars')
