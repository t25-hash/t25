#!/usr/bin/env python3
"""
normalize-kb-punct.py — Restore Japanese sentence punctuation in KB docs.

The PDF re-extraction (tools/pdf2md.py) ran unicodedata.normalize('NFKC', ...),
which converts the source PDFs' full-width Japanese punctuation 「．」(U+FF0E) /
「，」(U+FF0C) into ASCII '.' (U+002E) / ',' (U+002C). The Ask engine detects
sentence boundaries with ENDER = /[。．！？!?]/ and splits CJK text on those —
ASCII '.' is NOT a boundary (and splitSentences only breaks on '.' before a
space, which space-less Japanese never has). Result: no sentences are
extracted, every answer is rejected as weak, and the KB "can't answer".

This rewrites ASCII '.'/',' back to Japanese 「。」/「、」, but ONLY in Japanese
context, so western citations / decimals (c.365, Reuleaux,F., 0.5) are kept:
  '.' -> 「。」 when preceded by a CJK/kana char or a closing bracket
  ',' -> 「、」 when preceded by, OR followed by, a CJK/kana char or a JP bracket

Usage: python scripts/normalize-kb-punct.py [--check]
  (no args) rewrites assets/kb/docs/*.md in place
  --check   reports how many files/chars would change, writes nothing
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'assets', 'kb', 'docs')

# hiragana+katakana block, CJK unified, halfwidth katakana — matches the engine's
# CJK class used in gram()/terms().
CJK = '぀-ヿ一-鿿ｦ-ﾟ'
CLOSE = '）)」』】〕｝'
OPEN = '（(「『【〔｛'

RE_PERIOD = re.compile(r'(?<=[' + CJK + CLOSE + r'])\.')
RE_COMMA_PRE = re.compile(r'(?<=[' + CJK + CLOSE + r']),')
RE_COMMA_POST = re.compile(r',(?=[' + CJK + OPEN + r'])')


def normalize_punct(text):
    text = RE_PERIOD.sub('。', text)
    text = RE_COMMA_PRE.sub('、', text)
    text = RE_COMMA_POST.sub('、', text)
    return text


def main():
    check = '--check' in sys.argv
    files = sorted(f for f in os.listdir(DOCS) if re.match(r'^\d+\.md$', f))
    changed = 0
    period_fixed = comma_fixed = 0
    for f in files:
        p = os.path.join(DOCS, f)
        with open(p, 'r', encoding='utf-8') as fh:
            txt = fh.read()
        nt = normalize_punct(txt)
        if nt != txt:
            changed += 1
            period_fixed += txt.count('.') - nt.count('.')
            comma_fixed += txt.count(',') - nt.count(',')
            if not check:
                with open(p, 'w', encoding='utf-8') as fh:
                    fh.write(nt)
    verb = 'would change' if check else 'changed'
    print(f'{verb} {changed}/{len(files)} files | '
          f'. -> 。 : {period_fixed} | , -> 、 : {comma_fixed}')


if __name__ == '__main__':
    main()
