#!/usr/bin/env python3
"""
build-kb-index.py — Python port of build-kb-index.cjs.

Builds the BM25 inverted index (assets/kb/index.json) from the Markdown
documents in assets/kb/docs/NNNN.md.

Usage: python scripts/build-kb-index.py [K] [DFCAP] [DFMIN] [OUT]
"""
import os
import sys
import re
import json
import math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'assets', 'kb', 'docs')
K = int(sys.argv[1]) if len(sys.argv) > 1 else 8
DFCAP = float(sys.argv[2]) if len(sys.argv) > 2 else 0.30
DFMIN = int(sys.argv[3]) if len(sys.argv) > 3 else 2
OUT = sys.argv[4] if len(sys.argv) > 4 else os.path.join(ROOT, 'assets', 'kb', 'index.json')

LATIN_RE = re.compile(r'[a-z][a-z0-9\-]+')
CJK_RE = re.compile(r'[぀-ヿ一-鿿ｦ-ﾟ]')

def gram(text):
    t = text.lower()
    g = LATIN_RE.findall(t)
    cjk = CJK_RE.findall(text)
    for i in range(len(cjk) - 1):
        g.append(cjk[i] + cjk[i + 1])
    return g

def title_of(text):
    m = re.search(r'^\s*#\s+(.+)\s*$', text, re.MULTILINE)
    return m.group(1).strip() if m else ''

files = sorted(
    [f for f in os.listdir(DOCS) if re.match(r'^\d+\.md$', f)],
    key=lambda f: int(f.replace('.md', ''))
)
N = len(files)
print(f'docs: {N} | K={K} DFCAP={DFCAP} DFMIN={DFMIN}')

meta = [None] * N
tfs = [None] * N
df = {}

for i in range(N):
    with open(os.path.join(DOCS, files[i]), 'r', encoding='utf-8') as f:
        txt = f.read()
    meta[i] = title_of(txt)
    tf = {}
    for t in gram(txt):
        tf[t] = tf.get(t, 0) + 1
    tfs[i] = tf
    for t in tf:
        df[t] = df.get(t, 0) + 1
    if (i + 1) % 1000 == 0:
        print(f'  {i + 1}', end='', flush=True)

print()

dfMax = int(DFCAP * N)
idf = {}
for t, d in df.items():
    idf[t] = math.log(1 + (N - d + 0.5) / (d + 0.5))

# Document lengths for BM25
dl = [0] * N
sumdl = 0
for i in range(N):
    s = sum(tfs[i].values())
    dl[i] = s
    sumdl += s
avgdl = sumdl / N
k1 = 1.2
b = 0.5

post = {}
for i in range(N):
    tf = tfs[i]
    lenNorm = k1 * (1 - b + b * dl[i] / avgdl)
    for t, c in tf.items():
        d = df[t]
        if d > dfMax or d < DFMIN:
            continue
        w = idf[t] * (c * (k1 + 1)) / (c + lenNorm)
        if t not in post:
            post[t] = []
        post[t].append([i, w])
    tfs[i] = None

postObj = {}
total = 0
for t, arr in post.items():
    arr.sort(key=lambda e: -e[1])
    postObj[t] = [[e[0], round(e[1], 3)] for e in arr[:K]]
    total += len(postObj[t])

result = json.dumps({'n': N, 'meta': meta, 'post': postObj}, ensure_ascii=False, separators=(',', ':'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(result)

size_mb = len(result.encode('utf-8')) / 1048576
print(f'terms: {len(postObj)} | postings: {total} | size: {size_mb:.2f} MB -> {OUT}')
