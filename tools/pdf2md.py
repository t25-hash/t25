#!/usr/bin/env python3
"""
pdf2md.py — Rebuild all KB Markdown files from the original JISME 2-column PDFs.

Extracts text from each PDF page with proper left→right column handling,
detects section boundaries (X・Y・Z), and generates one .md file per section.

Usage:
    python tools/pdf2md.py                      # dry run (prints stats)
    python tools/pdf2md.py --apply              # writes MD files
    python tools/pdf2md.py --apply --limit 5    # process only first 5 PDFs
"""
import fitz
import os
import sys
import re
import glob
import unicodedata

PDF_DIR = r'C:\Users\N9636016\For_dev\kikai\00.JISME'
DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'kb', 'docs')

APPLY = '--apply' in sys.argv
LIMIT = None
if '--limit' in sys.argv:
    idx = sys.argv.index('--limit')
    LIMIT = int(sys.argv[idx + 1])

# ---- noise filters ----
def is_noise_line(text):
    t = text.strip()
    if not t:
        return True
    # Page numbers: 5―1, 1-3, etc. (various dash characters)
    if re.match(r'^[0-9]+\s*[―\-–—ー]\s*[0-9]+$', t):
        return True
    # Bare page numbers
    if re.match(r'^[0-9]{1,4}$', t):
        return True
    if re.match(r'^天アキ', t):
        return True
    if re.match(r'^[0-9]+\s*mm$', t):
        return True
    if '日本機械学会' in t or '©' in t or '(C)' in t:
        return True
    # Volume headers like "α5編 熱工学"
    if re.match(r'^[αβγ][0-9]*編', t):
        return True
    return False

# ---- column-aware page extraction ----
def extract_page_lines(page):
    """Extract text lines from a page, handling 2-column layout.
    Returns list of text lines in correct reading order (left col then right col).
    """
    blocks = page.get_text('blocks')
    mid_x = page.rect.width / 2
    text_blocks = [b for b in blocks if b[6] == 0]  # type 0 = text

    left_blocks = []
    right_blocks = []

    for b in text_blocks:
        x0, y0, x1, y1 = b[0], b[1], b[2], b[3]
        center_x = (x0 + x1) / 2
        if center_x < mid_x:
            left_blocks.append(b)
        else:
            right_blocks.append(b)

    left_blocks.sort(key=lambda b: b[1])
    right_blocks.sort(key=lambda b: b[1])

    def blocks_to_lines(col_blocks, page_height):
        result = []
        for b in col_blocks:
            # Skip blocks in header/footer zones (top 65pt, bottom 30pt)
            if b[1] < 65 and is_noise_line(b[4].strip().split('\n')[0]):
                continue
            if b[1] > page_height - 30 and is_noise_line(b[4].strip().split('\n')[0]):
                continue
            for sub_line in b[4].split('\n'):
                sub_line = sub_line.strip()
                if sub_line and not is_noise_line(sub_line):
                    result.append(sub_line)
        return result

    ph = page.rect.height
    lines = blocks_to_lines(left_blocks, ph)
    lines.extend(blocks_to_lines(right_blocks, ph))
    return lines

# ---- section/chapter detection ----
SEC3_RE = re.compile(r'^([0-9]+・[0-9]+・[0-9]+)\s*(.*)')
SEC2_RE = re.compile(r'^([0-9]+・[0-9]+)\s*(.*)')
CHAP_RE = re.compile(r'^第\s*([0-9０-９]+)\s*章\s*(.*)')

def normalize_text(text):
    try:
        text = unicodedata.normalize('NFKC', text)
    except:
        pass
    # Clean up garbled Unicode (Korean jamo artifacts from PDF)
    text = re.sub(r'[웖-웿위-윏우-웕]+', '', text)
    # Normalize spaces
    text = re.sub(r'[　]+', ' ', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()

def extract_pdf_sections(pdf_path):
    """Extract all sections from a PDF file.
    Returns list of dicts: {title, sec_id, chapter, section, body_lines}
    """
    doc = fitz.open(pdf_path)
    all_lines = []
    for pi in range(len(doc)):
        page_lines = extract_page_lines(doc[pi])
        all_lines.extend(page_lines)
    doc.close()

    # Normalize all lines
    all_lines = [normalize_text(l) for l in all_lines]
    all_lines = [l for l in all_lines if l]

    # Parse structure: detect chapters, sections (2-level), subsections (3-level)
    current_chapter = ''
    current_section = ''  # X・Y level
    sections = []
    current_sec = None

    i = 0
    while i < len(all_lines):
        line = all_lines[i]

        # Check for chapter heading: "第X章" possibly with title on same or next line
        m_chap = CHAP_RE.match(line)
        if m_chap:
            chap_num = m_chap.group(1)
            chap_title = m_chap.group(2).strip()
            # If title is empty, check next line
            if not chap_title and i + 1 < len(all_lines):
                next_line = all_lines[i + 1]
                if not SEC3_RE.match(next_line) and not SEC2_RE.match(next_line) and not CHAP_RE.match(next_line):
                    chap_title = next_line
                    i += 1
            current_chapter = f'第{chap_num}章 {chap_title}'.strip()
            i += 1
            continue

        # Check for 2-level section: "X・Y title"
        # Guard: real section headers are short (title part < 40 chars)
        # and don't start with equation/reference artifacts
        m_sec2 = SEC2_RE.match(line)
        if m_sec2 and not SEC3_RE.match(line):
            sec_id = m_sec2.group(1)
            sec_title = m_sec2.group(2).strip()
            if len(sec_title) < 40 and not re.match(r'^[(\[（=<>+\-*/,.]', sec_title):
                if not sec_title and i + 1 < len(all_lines):
                    next_line = all_lines[i + 1]
                    if not SEC3_RE.match(next_line) and not SEC2_RE.match(next_line) and not CHAP_RE.match(next_line):
                        sec_title = next_line
                        i += 1
                current_section = f'{sec_id} {sec_title}'.strip()
                i += 1
                continue

        # Check for 3-level section: "X・Y・Z title"
        m_sec3 = SEC3_RE.match(line)
        if m_sec3:
            sec_id = m_sec3.group(1)
            sec_title = m_sec3.group(2).strip()
            # Guard: reject false positives where "title" is body text
            if len(sec_title) > 80 or re.match(r'^[(\[（=<>+\-*/,.]', sec_title):
                if current_sec is not None:
                    current_sec['body_lines'].append(line)
                i += 1
                continue

            # If title is empty, check next line
            if not sec_title and i + 1 < len(all_lines):
                next_line = all_lines[i + 1]
                if not SEC3_RE.match(next_line) and not SEC2_RE.match(next_line) and not CHAP_RE.match(next_line):
                    sec_title = next_line
                    i += 1

            # Save previous section if exists
            if current_sec is not None:
                sections.append(current_sec)

            current_sec = {
                'sec_id': sec_id,
                'title': sec_title,
                'chapter': current_chapter,
                'section': current_section,
                'body_lines': []
            }
            i += 1
            continue

        # Regular body line
        if current_sec is not None:
            current_sec['body_lines'].append(line)
        i += 1

    # Don't forget the last section
    if current_sec is not None:
        sections.append(current_sec)

    return sections

def format_section_md(sec):
    """Format a section dict as Markdown."""
    title_line = f"# {sec['sec_id']} {sec['title']}"
    lines = [title_line, '']

    # Breadcrumbs
    if sec['chapter']:
        lines.append(f"> **章**: {sec['chapter']}")
    if sec['section']:
        lines.append(f"> **節**: {sec['section']}")
    if sec['chapter'] or sec['section']:
        lines.append('')

    # Body: join wrapped lines into paragraphs
    body = join_paragraphs(sec['body_lines'])
    if body:
        lines.append(body)

    return '\n'.join(lines) + '\n'

def join_paragraphs(body_lines):
    """Join wrapped lines into continuous text."""
    if not body_lines:
        return ''
    return ''.join(body_lines)

# ---- PDF ordering ----
def get_pdf_order():
    """Get all PDFs in natural filesystem order.
    Order: α1→α9, β1→β9, γ1→γ11 (within each, chapters in numeric order).
    """
    pdfs = sorted(glob.glob(os.path.join(PDF_DIR, '**', '*.pdf'), recursive=True))

    def sort_key(p):
        rel = os.path.relpath(p, PDF_DIR)
        parts = rel.replace('\\', '/').split('/')
        # parts: ['α編', 'α1', 'α01-01章.pdf'] or similar
        vol = parts[0]  # α編, β編, γ編
        vol_order = {'α編': 0, 'β編': 1, 'γ編': 2}.get(vol, 9)

        # Sub-volume number (α1, β2, γ11, etc.)
        sub = parts[1] if len(parts) > 1 else ''
        sub_num = int(re.search(r'(\d+)', sub).group(1)) if re.search(r'(\d+)', sub) else 0

        # Chapter number from filename
        fname = parts[-1]
        # Handle patterns like α01-01章.pdf, α08-1-01章.pdf, β04-0-01章.pdf
        nums = re.findall(r'(\d+)', fname)
        chap_key = tuple(int(n) for n in nums) if nums else (0,)

        return (vol_order, sub_num, chap_key)

    pdfs.sort(key=sort_key)
    return pdfs

# ---- main ----
def main():
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    print('Building PDF processing order...')
    ordered_pdfs = get_pdf_order()

    if LIMIT:
        ordered_pdfs = ordered_pdfs[:LIMIT]

    print(f'Processing {len(ordered_pdfs)} PDFs...')

    md_num = 0
    total_sections = 0
    skipped_pdfs = 0

    for pi, pdf_path in enumerate(ordered_pdfs):
        rel = os.path.relpath(pdf_path, PDF_DIR)
        sections = extract_pdf_sections(pdf_path)

        if not sections:
            skipped_pdfs += 1
            print(f'  [{pi+1}/{len(ordered_pdfs)}] {rel}: 0 sections (skipped)')
            continue

        for sec in sections:
            md_num += 1
            md_text = format_section_md(sec)

            if APPLY:
                out_path = os.path.join(DOCS_DIR, f'{md_num:04d}.md')
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write(md_text)

            total_sections += 1

        print(f'  [{pi+1}/{len(ordered_pdfs)}] {rel}: {len(sections)} sections -> MD {md_num-len(sections)+1:04d}-{md_num:04d}')

    print(f'\nDone: {total_sections} sections from {len(ordered_pdfs) - skipped_pdfs} PDFs ({skipped_pdfs} skipped)')
    if APPLY:
        print(f'Wrote {total_sections} MD files to {DOCS_DIR}')

        # Only clean up extra old files when processing ALL PDFs (not limited)
        if not LIMIT:
            removed = 0
            for i in range(md_num + 1, 7000):
                old = os.path.join(DOCS_DIR, f'{i:04d}.md')
                if os.path.exists(old):
                    os.remove(old)
                    removed += 1
            if removed:
                print(f'  Removed {removed} old files beyond {md_num:04d}.md')
    else:
        print('Dry run. Use --apply to write files.')

if __name__ == '__main__':
    main()
