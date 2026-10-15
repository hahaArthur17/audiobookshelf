# usage: qdiff.py <dirA> <dirB> : compare the saved responses of two qrun.sh runs.
# Extra masks: port numbers, inode numbers in file urls, progressLastUpdate / lastEpisodeCheck times.
# A file that differs only in the order of list elements is reported as ORDER ONLY (ties in sorts on
# timestamps that are equal to the millisecond, or counts), with the diff printed for the strict check.
import sys, os, re, json, difflib
a, b = sys.argv[1], sys.argv[2]
def norm_text(t):
    t = re.sub(r'localhost(%3A|:)\d+', r'localhost\1PORT', t)
    t = re.sub(r'/file/\d+', '/file/INO', t)
    t = re.sub(r'"(progressLastUpdate|lastEpisodeCheck)": \d+', r'"\1": "MASK"', t)
    return t
def parse(p):
    t = norm_text(open(p).read())
    lines = t.split('\n')
    head = [l for l in lines if l.startswith('STATUS') or l.startswith('LOCATION') or l.startswith('SERVER EXITED')]
    rest = '\n'.join(l for l in lines if not (l.startswith('STATUS') or l.startswith('LOCATION') or l.startswith('SERVER EXITED')))
    try: body = json.loads(rest)
    except Exception: body = rest
    return t, head, body
def canon(v):
    if isinstance(v, dict): return {k: canon(x) for k, x in v.items()}
    if isinstance(v, list): return sorted((canon(x) for x in v), key=lambda x: json.dumps(x, sort_keys=True))
    return v
files = sorted(f for f in os.listdir(a) if f.endswith('.txt') and not f.startswith('_'))
same = order = 0; diffs = []
for f in files:
    ta, ha, ba = parse(os.path.join(a, f)); tb, hb, bb = parse(os.path.join(b, f))
    if ta == tb: same += 1; continue
    if ha == hb and canon(ba) == canon(bb):
        order += 1; print('ORDER ONLY', f); continue
    diffs.append(f); print('=== DIFF', f); print('\n'.join(list(difflib.unified_diff(ta.split('\n'), tb.split('\n'), lineterm='', n=1))[:40]))
ca = open(os.path.join(a, '_codes.txt')).read(); cb = open(os.path.join(b, '_codes.txt')).read()
print('requests', len(files), 'identical', same, 'order-only', order, 'different', len(diffs), '| status codes', 'identical' if ca == cb else 'DIFFERENT')
