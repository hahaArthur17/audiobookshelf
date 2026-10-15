import sys, json, re
root = sys.argv[1]
def m(v, k=''):
    if isinstance(v, dict): return {kk: m(vv, kk) for kk, vv in v.items()}
    if isinstance(v, list): return [m(x) for x in v]
    if isinstance(v, str):
        v = v.replace(root, 'ROOT')
        v = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'UUID', v)
    if k == 'id' or k.endswith('Id') or k == 'ino' or k.endswith('At') or k.endswith('Ms') or k in ('lastScan', 'lastUpdate', 'mtime', 'ctime', 'birthtime', 'lastScanVersion'):
        return 'MASK' if v is not None else None
    return v
d = json.load(sys.stdin)
d = m(d)
def sk(x): return json.dumps(x, sort_keys=True)
if isinstance(d, dict) and 'results' in d: d['results'] = sorted(d['results'], key=lambda r: r.get('relPath', '') )
print(json.dumps(d, indent=1, sort_keys=True))
