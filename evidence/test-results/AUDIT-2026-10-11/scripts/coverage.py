import subprocess, re, sys
repo = sys.argv[1]
def git(*a):
    return subprocess.run(['git','--no-optional-locks','-C',repo]+list(a),capture_output=True).stdout
def count(commit, mode):
    names = git('ls-tree','-r','--name-only',commit).decode().splitlines()
    ts=js=0; nts=njs=0
    for n in names:
        if not n.startswith('server/'): continue
        if n.startswith('server/libs/'): continue
        if n.endswith('.d.ts'):
            if mode=='withd': pass
            else: continue
        if n.endswith('.ts') or n.endswith('.js'):
            b = git('show', f'{commit}:{n}')
            c = sum(1 for l in b.splitlines() if l.strip())
            if n.endswith('.ts'): ts+=c; nts+=1
            else: js+=c; njs+=1
    return ts, js, nts, njs
for label, c in [('start 9f4ff460','9f4ff460'),('before PO-S08 50d46876','50d46876'),('after PO-S08 d89acaf7','d89acaf7')]:
    for mode in ('withd',):
        ts,js,nts,njs = count(c,mode)
        print(f"{label}: ts_lines={ts} js_lines={js} total={ts+js} share={100*ts/(ts+js):.1f}% ts_files={nts} js_files={njs}")
