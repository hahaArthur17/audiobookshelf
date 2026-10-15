# usage: mask2.py <work-root> <file>  ; masks a saved response (JSON via mask.py rules, else text)
import sys, json, re
sys.path.insert(0, '/home/danny/Code/compx574/a4-context/phase3-evidence/batch11b/smoke')
root, p = sys.argv[1], sys.argv[2]
raw = open(p, 'rb').read()
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
def mstr(v):
    v = v.replace(root, 'ROOT')
    v = re.sub(UUID, 'UUID', v)
    v = re.sub(r'[A-Za-z0-9_-]{40,}', 'RAND', v)
    v = re.sub(r'\b1[6-9]\d{11}\b', 'EPOCHMS', v)
    return v
def m(v, k=''):
    if isinstance(v, dict): return {kk: m(vv, kk) for kk, vv in v.items()}
    if isinstance(v, list): return [m(x) for x in v]
    if isinstance(v, str): v = mstr(v)
    if k == 'id' or k.endswith('Id') or k == 'ino' or k.endswith('At') or k.endswith('Ms') or k in ('lastScan', 'lastUpdate', 'mtime', 'ctime', 'birthtime', 'lastScanVersion', 'startTime', 'date', 'dayOfWeek', 'timeListening', 'lastSeen', 'token', 'accessToken', 'refreshToken', 'uptime'):
        return 'MASK' if v is not None else None
    return v
try:
    d = json.loads(raw)
    d = m(d)
    def sortkey(r): return json.dumps(r, sort_keys=True)
    if isinstance(d, dict) and isinstance(d.get('results'), list) and all(isinstance(r, dict) for r in d['results']):
        d['results'] = sorted(d['results'], key=lambda r: (r.get('relPath', '') or '', r.get('name', '') or '', sortkey(r)))
    print(json.dumps(d, indent=1, sort_keys=True))
except Exception:
    try:
        t = raw.decode('utf8')
        if '\x00' in t: raise ValueError
        print('TEXT', mstr(t))
    except Exception:
        print('BINARY', len(raw), 'bytes')
