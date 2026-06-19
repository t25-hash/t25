#!/usr/bin/env python3
"""
build-calc-db.py — Build the Calc-Matrix DB (計算式・表) as a SEPARATE store
from the prose KB (assets/kb).

Source: the LLM-reference dump extracted from the JISME 機械工学便覧 PDFs
(uploaded as Calc_Matrix.md). It is one big Markdown file:

    # α編                      ← volume (編)
    ## α01-03章.pdf            ← chapter
    - `PV = mRT`               ← a formula (code-fenced line)
    | … | … |                  ← a table row

This script does two things:

  1. CLEAN the extraction garbage. The PDFs embed footnote/cross-reference
     markers that PyMuPDF rendered as super/subscript runs glued onto words
     and formulas, e.g.  論⁻¹₃·⁻¹³·  or  Ω₁ = 52.76⁻¹₃₃·(52.85)⁻¹₃²·.
     A citation marker is reliably  「super/sub-minus + super/sub-digits +
     middle-dot」 (⁻¹³·). Real exponents/units (s⁻¹, x⁻¹), and dot products
     (𝐅ᵢ·𝐫ᵢ, dt²·d𝐫) have NO leading super/sub-minus or NO trailing middle
     dot, so they survive. Private-Use-Area / Hangul mojibake (defensive;
     this dump has none) is also stripped. A formula line that is nothing but
     a word/citation crumb after cleaning (no '=', Latin, Greek or relational
     operator) is dropped as rubble.

  2. REGISTER one document per chapter under assets/calc/docs/NNNN.md and build
     a pruned BM25 inverted index at assets/calc/index.json — the SAME format
     and tokenizer (gram) the prose KB uses, so the Ask engine can query it
     with the identical hybrid (search → neural → generate) pipeline.

Usage: python scripts/build-calc-db.py <Calc_Matrix.md> [K] [DFCAP] [DFMIN]
"""
import os
import re
import sys
import json
import math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DOCS = os.path.join(ROOT, 'assets', 'calc', 'docs')
OUT_INDEX = os.path.join(ROOT, 'assets', 'calc', 'index.json')

# ---- cleaning ----
SUPSUB = '⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉'
# citation marker: super/sub MINUS + super/sub DIGITS + trailing MIDDLE DOT.
CITATION = re.compile('[⁻₋][' + SUPSUB + ']+[·・]')
# PUA + Hangul syllables/jamo + Yijing + replacement char (defensive mojibake).
GARBAGE = re.compile(
    '[-'      # Private Use Area
    '가-힣'                   # Hangul syllables
    'ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿'  # Hangul jamo
    '䷀-䷿�]'             # Yijing hexagrams + U+FFFD
)
LATIN = re.compile('[A-Za-z]')
GREEK = re.compile('[α-ωΑ-Ω∀-⋿\U0001d400-\U0001d7ff]')  # Greek + math alphanumerics
RELATIONAL = re.compile('[=<>≤≥≈≅≡∝∫∮∑∏√∂∇±×÷→←↔∈]')


def clean_inline(s):
    """Strip citation markers and mojibake from any line (formula/table/prose)."""
    s = GARBAGE.sub('', s)
    s = CITATION.sub('', s)
    return re.sub(r'[ \t]{2,}', ' ', s).strip()


# a lone alphabetic word (optionally with trailing brackets/period) is an
# extraction crumb of a truncated English word (neering) / control) / nique)),
# not a formula.
WORD_CRUMB = re.compile(r'^[A-Za-z]+[)\].,]*$')


def formula_has_signal(s):
    """A cleaned formula is real iff it carries math: '=', a Greek/math symbol,
    or a relational/operator glyph. Bare CJK fragments, citation crumbs, and
    truncated lone English words are dropped."""
    if not s:
        return False
    if '=' in s or GREEK.search(s) or RELATIONAL.search(s):
        return True
    if WORD_CRUMB.match(s):
        return False
    return bool(LATIN.search(s))


# ---- parse source into chapters ----
VOLUME_RE = re.compile(r'^#\s+(\S+編)\s*$')
CHAPTER_RE = re.compile(r'^##\s+(.+?)(?:\.pdf)?\s*$')
FORMULA_RE = re.compile(r'^-\s+`(.*)`\s*$')


def parse_chapters(text):
    chapters = []
    cur = None
    volume = ''
    stats = {'formulas_in': 0, 'formulas_kept': 0, 'cleaned': 0}
    for raw in text.split('\n'):
        mv = VOLUME_RE.match(raw)
        if mv:
            volume = mv.group(1)
            continue
        mc = CHAPTER_RE.match(raw)
        if mc and not raw.startswith('###'):
            cur = {'title': mc.group(1).strip(), 'volume': volume, 'formulas': [], 'tables': [], 'prose': []}
            chapters.append(cur)
            continue
        if cur is None:
            continue
        mf = FORMULA_RE.match(raw)
        if mf:
            stats['formulas_in'] += 1
            cleaned = clean_inline(mf.group(1))
            if cleaned != mf.group(1):
                stats['cleaned'] += 1
            if formula_has_signal(cleaned):
                cur['formulas'].append(cleaned)
                stats['formulas_kept'] += 1
            continue
        if raw.lstrip().startswith('|'):
            line = clean_inline(raw)
            if line:
                cur['tables'].append(line)
            continue
        if raw.strip() and raw.strip() != '---':
            line = clean_inline(raw)
            if line:
                cur['prose'].append(line)
    return chapters, stats


def render_doc(ch):
    out = ['# ' + ch['title'], '']
    out.append('> **編**: ' + (ch['volume'] or '—'))
    out.append('')
    if ch['prose']:
        out.append('\n'.join(ch['prose']))
        out.append('')
    if ch['formulas']:
        out.append('## 計算式')
        out.append('')
        out.append('\n'.join('- `' + f + '`' for f in ch['formulas']))
        out.append('')
    if ch['tables']:
        out.append('## 表')
        out.append('')
        out.append('\n'.join(ch['tables']))
        out.append('')
    return '\n'.join(out).rstrip() + '\n'


# ---- BM25 index (mirrors build-kb-index.py / the engine's gram tokenizer) ----
LATIN_TOK = re.compile(r'[a-z][a-z0-9\-]+')
CJK_TOK = re.compile(r'[぀-ヿ一-鿿ｦ-ﾟ]')


def gram(text):
    g = LATIN_TOK.findall(text.lower())
    cjk = CJK_TOK.findall(text)
    for i in range(len(cjk) - 1):
        g.append(cjk[i] + cjk[i + 1])
    return g


def build_index(docs, meta, K, DFCAP, DFMIN, out):
    N = len(docs)
    tfs, df = [None] * N, {}
    for i, txt in enumerate(docs):
        tf = {}
        for t in gram(txt):
            tf[t] = tf.get(t, 0) + 1
        tfs[i] = tf
        for t in tf:
            df[t] = df.get(t, 0) + 1
    idf = {t: math.log(1 + (N - d + 0.5) / (d + 0.5)) for t, d in df.items()}
    dl = [sum(tf.values()) for tf in tfs]
    avgdl = (sum(dl) / N) if N else 1
    k1, b, dfMax = 1.2, 0.5, int(DFCAP * N)
    post = {}
    for i in range(N):
        lenNorm = k1 * (1 - b + b * dl[i] / max(1, avgdl))
        for t, c in tfs[i].items():
            d = df[t]
            if d > dfMax or d < DFMIN:
                continue
            w = idf[t] * (c * (k1 + 1)) / (c + lenNorm)
            post.setdefault(t, []).append([i, w])
    postObj, total = {}, 0
    for t, arr in post.items():
        arr.sort(key=lambda e: -e[1])
        postObj[t] = [[e[0], round(e[1], 3)] for e in arr[:K]]
        total += len(postObj[t])
    payload = json.dumps({'n': N, 'meta': meta, 'post': postObj}, ensure_ascii=False, separators=(',', ':'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(payload)
    return len(postObj), total, len(payload.encode('utf-8')) / 1048576


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: build-calc-db.py <Calc_Matrix.md> [K] [DFCAP] [DFMIN]')
    src = sys.argv[1]
    K = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    DFCAP = float(sys.argv[3]) if len(sys.argv) > 3 else 0.30
    DFMIN = int(sys.argv[4]) if len(sys.argv) > 4 else 2

    with open(src, 'r', encoding='utf-8') as f:
        text = f.read()
    chapters, stats = parse_chapters(text)
    chapters = [c for c in chapters if c['formulas'] or c['tables'] or c['prose']]
    print(f'chapters: {len(chapters)} | formulas in/kept/cleaned: '
          f"{stats['formulas_in']}/{stats['formulas_kept']}/{stats['cleaned']}")

    # write docs
    os.makedirs(OUT_DOCS, exist_ok=True)
    for f in os.listdir(OUT_DOCS):
        if re.match(r'^\d+\.md$', f):
            os.remove(os.path.join(OUT_DOCS, f))
    rendered, meta = [], []
    for i, ch in enumerate(chapters):
        body = render_doc(ch)
        with open(os.path.join(OUT_DOCS, f'{i + 1:04d}.md'), 'w', encoding='utf-8') as fh:
            fh.write(body)
        rendered.append(body)
        meta.append(ch['title'])

    terms, postings, size_mb = build_index(rendered, meta, K, DFCAP, DFMIN, OUT_INDEX)
    print(f'docs: {len(rendered)} -> {OUT_DOCS}')
    print(f'index: terms {terms} | postings {postings} | {size_mb:.2f} MB -> {OUT_INDEX}')


if __name__ == '__main__':
    main()
