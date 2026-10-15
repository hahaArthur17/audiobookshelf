# usage: python3 sample11d.py <repo> <base commit> <head commit> <seed> <n>
# Reads git diff -U0 <base> <head> (all files except MIGRATION.md) and prints two parts:
#  PART 1: comment lines that were replaced (removed line and added line in the same hunk) where at least half of
#          the words of the old comment are missing from the new comment (possible loss of information).
#  PART 2: every added comment with "assumed:" plus N other added cast( comments chosen with the given seed,
#          each with the comment line (and the old comment if it replaced one) and the code lines below it.
import subprocess, sys, re, random
repo, base, head, seed, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
def git(*a):
    return subprocess.run(['git', '-C', repo, *a], capture_output=True, text=True, check=True).stdout
diff = git('diff', '-U0', base, head, '--', '.', ':(exclude)MIGRATION.md')
hunks = []  # dicts: file, removed [str], added [(lineno, str)]
cur_file = None; cur = None
for line in diff.split('\n'):
    if line.startswith('+++ '):
        cur_file = line[6:] if line.startswith('+++ b/') else line[4:]
    elif line.startswith('@@'):
        m = re.match(r'@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@', line)
        cur = {'file': cur_file, 'removed': [], 'added': [], 'next': int(m.group(1))}
        hunks.append(cur)
    elif cur is not None and line.startswith('-') and not line.startswith('--- '):
        cur['removed'].append(line[1:])
    elif cur is not None and line.startswith('+') and not line.startswith('+++ '):
        cur['added'].append((cur['next'], line[1:])); cur['next'] += 1
def words(t):
    ws = re.findall(r'[a-z0-9_]+', t.lower())
    stop = {'cast', 'the', 'is', 'are', 'of', 'to', 'in', 'by', 'as', 'it', 'its', 'be', 'and', 'or', 'on', 'for', 'that', 'this', 'with', 'at', 'so', 'from', 'not', 'no', 'was', 'when', 'if', 'then', 'there', 'than', 'an', 'has', 'have', 'which', 'but'}
    return {w for w in ws if w not in stop and len(w) > 1}
print('PART 1: rewritten comments that lost at least half of their words')
lost = 0; rewritten = 0
for h in hunks:
    if not h['removed'] or not h['added']:
        continue
    rewritten += len(h['removed'])
    old = ' '.join(h['removed']); new = ' '.join(t for _, t in h['added'])
    ow = words(old); nw = words(new)
    if ow and len(ow - nw) / len(ow) >= 0.5:
        lost += 1
        print('-', h['file'] + ':' + str(h['added'][0][0]))
        for r in h['removed']: print('   old:', r.strip()[:260])
        for _, a in h['added']: print('   new:', a.strip()[:260])
print('removed comment lines in hunks that also add lines:', rewritten, '| flagged hunks:', lost)
print()
cands = []
for h in hunks:
    for ln, t in h['added']:
        if 'cast(' in t and t.strip().startswith('//'):
            cands.append((h, ln, t))
assumed = [c for c in cands if 'assumed:' in c[2]]
rest = [c for c in cands if 'assumed:' not in c[2]]
random.Random(seed).shuffle(rest)
chosen = assumed + rest[:n]
print('PART 2: %d added cast( comments in total, %d with assumed:, showing %d' % (len(cands), len(assumed), len(chosen)))
cache = {}
def lines_of(f):
    if f not in cache:
        cache[f] = git('show', head + ':' + f).split('\n')
    return cache[f]
for h, ln, t in chosen:
    print('=' * 100)
    print(h['file'] + ':' + str(ln))
    if h['removed']:
        for r in h['removed']: print('  old comment:', r.strip()[:260])
    print('  comment :', t.strip()[:400])
    L = lines_of(h['file'])
    for k in range(ln, min(ln + 3, len(L))):
        print('  %5d| %s' % (k + 1, L[k][:200]))
