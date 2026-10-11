# usage: s10_v8cov.py <coverage.json> <files.txt> : per converted file, how many functions were called at least once in the smoke run (V8 function coverage of the compiled js)
import json,sys,re,os
cov=json.load(open(sys.argv[1]))
names=[l.split('\t')[-1].strip() for l in open(sys.argv[2]) if l.startswith('R') or l.startswith('A')]
res={}
for e in cov['result']:
    u=e['url']
    for n in names:
        js=n.replace('.ts','.js')
        if u.endswith('/dist-server/'+js):
            fns=[f for f in e['functions'] if f['functionName']!='']  # named functions only
            allf=e['functions']
            called=[f for f in fns if f['ranges'][0]['count']>0]
            res[n]=(len(fns),len(called),sorted(f['functionName'] for f in called))
for n in names:
    r=res.get(n)
    if r is None: print('%-52s NOT LOADED'%n)
    else: print('%-52s named functions %3d, called %3d'%(n,r[0],r[1]), ' ' + ', '.join(r[2][:6]))
