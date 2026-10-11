import json,re,glob,os
D=os.path.expanduser('~/mnt/Project/po-session-backup/PO-S10'); SID='bca2b50b-ca0f-4d85-ae6b-75f7bfb74f79'
files=[('main',f'{D}/{SID}.jsonl')]+[(json.load(open(j[:-6]+'.meta.json'))['description'],j) for j in sorted(glob.glob(f'{D}/{SID}/subagents/*.jsonl'))]
pat=re.compile(r'evidence|PO-S0\d|PO-S1\d-(notes|prompt)|po-s\d\d-(hold|store|baseline)|po-session-backup|_to_delete|cat-file|ls-tree|sparse|\.claude[\\/]+(settings|projects)|memory[\\/]',re.I)
hits=0
for name,p in files:
    for l in open(p,encoding='utf-8',errors='replace'):
        r=json.loads(l)
        if r.get('type')!='assistant': continue
        c=r.get('message',{}).get('content'); 
        if not isinstance(c,list): continue
        for b in c:
            if b.get('type')=='tool_use':
                s=json.dumps(b['input'])
                m=pat.search(s)
                if m and b['name'] not in('Agent','SendMessage','SubagentHandback'):
                    hits+=1; print(r['timestamp'][11:19],name[:28],b['name'],m.group(0),'|',re.sub(r'(?i)users[\\/]+[^\\/"]+','users/<user>',s)[:230])
print('hits',hits)
# also tool results mentioning evidence/ paths
rh=0
for name,p in files:
    for l in open(p,encoding='utf-8',errors='replace'):
        r=json.loads(l)
        if r.get('type')!='user': continue
        c=r.get('message',{}).get('content')
        if not isinstance(c,list): continue
        for b in c:
            if b.get('type')=='tool_result':
                t=b.get('content'); t=json.dumps(t) if not isinstance(t,str) else t
                if re.search(r'evidence/(notes|plans|test-results)',t): rh+=1; print('RESULT mentions evidence path',name[:25],r['timestamp'][11:19],t[:150])
print('result hits',rh)
