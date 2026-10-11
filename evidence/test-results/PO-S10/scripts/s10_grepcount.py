# second counting method: line-based regex on the code part of each line (trailing // comment and block-comment lines removed)
import re,sys
tot_nn=tot_as=tot_idx=tot_any=0
for p in sys.argv[1:]:
    nn=a=idx=an=0; inblock=False
    for line in open(p,encoding='utf8'):
        s=line.rstrip('\n')
        if inblock:
            if '*/' in s: inblock=False; s=s.split('*/',1)[1]
            else: continue
        if re.match(r'\s*/\*',s) and '*/' not in s: inblock=True; continue
        s=re.sub(r'/\*.*?\*/','',s)
        s=re.sub(r'\s//\s.*$','',s)
        if re.match(r'\s*//',s): continue
        nn+=len(re.findall(r'[\w\)\]]!(?=[.\[),;\s:]|$)(?!=)',s))
        a+=0 if re.match(r'\s*(import|export)\b',s) else len(re.findall(r'\bas\s+(?!const\b)\w',s))
        idx+=len(re.findall(r'\[\s*\w+\s*:\s*(?:string|number)\s*\]\s*:',s))
        an+=len(re.findall(r':\s*any\b|<any>|\bas any\b',s))
    print('%-34s !=%2d as=%2d idx=%d any=%d'%(p.split('/')[-1],nn,a,idx,an)); tot_nn+=nn;tot_as+=a;tot_idx+=idx;tot_any+=an
print('TOTAL non-null',tot_nn,'casts',tot_as,'index signatures',tot_idx,'any',tot_any)
