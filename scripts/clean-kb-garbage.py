#!/usr/bin/env python3
"""
clean-kb-garbage.py — Remove font-encoding garbage (mojibake) from KB docs.

The source PDFs embed subset fonts that lack a proper ToUnicode CMap, so when
tools/pdf2md.py (PyMuPDF) extracts math/subscript glyphs it cannot map them to
real Unicode. They come out as Private-Use-Area code points (U+E000-U+F8FF) and,
where glyph IDs collide with the Hangul block, as Hangul syllables/jamo. These
render as tofu boxes in the Ask UI. The corpus is Japanese mechanical
engineering, so any PUA/Hangul/Yijing char is garbage.

We can't re-extract (no source PDFs here), so we clean the extracted .md:
  - Heading / breadcrumb lines (#, >): strip the garbage chars in place.
  - Body: split into sentences; DROP a sentence that is formula rubble
    (garbage ratio > 8% or >= 5 garbage chars), otherwise strip its garbage
    chars and tidy the leftover doubled punctuation. Dropping rubble avoids
    leaving meaningless fragments while keeping the surrounding prose.

Usage: python scripts/clean-kb-garbage.py [--check]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'assets', 'kb', 'docs')

# PUA, Hangul syllables, all Hangul jamo blocks, Yijing hexagrams.
GARBAGE = re.compile(
    '[-'          # Private Use Area (unmapped subset-font glyphs)
    '가-힣'           # Hangul syllables
    'ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿'  # Hangul jamo
    '䷀-䷿]'          # Yijing hexagrams
)
DROP_RATIO = 0.08
DROP_COUNT = 5


def tidy(s):
    s = re.sub(r'[、，][、，]+', '、', s)      # collapsed JP commas from dropped subscripts
    s = re.sub(r',{2,}', ',', s)             # collapsed ASCII commas
    s = re.sub(r'^[、，。\s]+', '', s)        # stray leading punctuation
    return s


def clean_body(body):
    parts = re.split(r'(?<=。)', body)
    out = []
    for s in parts:
        if not s:
            continue
        g = len(GARBAGE.findall(s))
        if g == 0:
            out.append(s)
            continue
        if g >= DROP_COUNT or g / max(1, len(s)) > DROP_RATIO:
            continue                          # formula rubble -> drop whole sentence
        out.append(tidy(GARBAGE.sub('', s)))
    return ''.join(out)


def clean_file(text):
    out = []
    for line in text.split('\n'):
        if not line:
            out.append(line)
        elif line[0] in '#>':                 # heading / breadcrumb: strip chars only
            out.append(GARBAGE.sub('', line))
        else:
            out.append(clean_body(line))
    return '\n'.join(out)


def main():
    check = '--check' in sys.argv
    files = sorted(f for f in os.listdir(DOCS) if re.match(r'^\d+\.md$', f))
    changed = removed_chars = 0
    for f in files:
        p = os.path.join(DOCS, f)
        with open(p, 'r', encoding='utf-8') as fh:
            txt = fh.read()
        nt = clean_file(txt)
        if nt != txt:
            changed += 1
            removed_chars += len(GARBAGE.findall(txt))
            if not check:
                with open(p, 'w', encoding='utf-8') as fh:
                    fh.write(nt)
    verb = 'would clean' if check else 'cleaned'
    print(f'{verb} {changed}/{len(files)} files | garbage chars removed: {removed_chars}')


if __name__ == '__main__':
    main()
