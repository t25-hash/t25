#!/usr/bin/env node
/* 穴埋め: for docs whose section heading UNIQUELY matches the clean source .txt,
 * replace the body with the source text. Upstream already drove garbage to 0 by
 * STRIPPING the mojibake, but that deleted real text in many docs (avg source is
 * ~20% longer). This restores the full clean prose from source for those docs.
 * Non-matching docs are left untouched (already clean upstream).
 *
 * Usage: node scripts/fill-kb-from-txt.cjs <txt...>           # dry-run
 *        node scripts/fill-kb-from-txt.cjs --apply <txt...>   # write
 * Then:  node scripts/build-kb-index.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'assets/kb/docs');
const args = process.argv.slice(2);
const APPLY = args.indexOf('--apply') >= 0;
const TXT = args.filter(a => a !== '--apply');

// PUA + Hangul (defensive; the clean source has none)
const GARBAGE = new RegExp('[' + String.fromCharCode(0xE000) + '-' + String.fromCharCode(0xF8FF) +
  String.fromCharCode(0xAC00) + '-' + String.fromCharCode(0xD7A3) +
  String.fromCharCode(0x1100) + '-' + String.fromCharCode(0x11FF) + '�]', 'g');
const H3 = /^([0-9０-９]+(?:・[0-9０-９]+){2})\s+(.+)$/;
const STOP = /^(第[0-9０-９]+章|[0-9０-９]+・[0-9０-９]+\s+\S|[0-9０-９]+(?:・[0-9０-９]+){2}\s+\S|天アキ|\d+mm)/;
const norm = s => String(s).replace(/^#\s*/, '').replace(/\s+/g, '').trim();

// half-width 「.」「,」 (Japanese punctuation, no following space) → 「。」「、」 to match
// the upstream convention so split/segmentation works.
function jpPunct(t) {
  return t.replace(/([ぁ-んァ-ヶ一-鿿々ー）)」』])\.(?=$|[^0-9A-Za-z])/gm, '$1。')
          .replace(/([ぁ-んァ-ヶ一-鿿々ー）)」』]),(?=$|[^0-9A-Za-z])/gm, '$1、');
}
function clean(t) {
  t = t.replace(GARBAGE, '');
  t = jpPunct(t);
  t = t.replace(/[（(]\s*[)）]/g, '').replace(/「\s*」|『\s*』/g, '');
  t = t.replace(/[ \t　]{2,}/g, ' ');
  t = t.replace(/，{2,}/g, '，').replace(/、{2,}/g, '、').replace(/。{2,}/g, '。').replace(/．{2,}/g, '．');
  t = t.replace(/\s+([，。、．）)」』])/g, '$1').replace(/[ \t]+$/gm, '');
  return t.trim();
}

// heading -> source body (unique headings only)
const body = {}, count = {};
TXT.forEach(f => {
  if (!fs.existsSync(f)) { console.error('missing:', f); return; }
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(H3); if (!m) continue;
    const k = norm(m[0]); const b = [];
    for (let j = i + 1; j < lines.length; j++) { if (STOP.test(lines[j].trim())) break; b.push(lines[j]); }
    count[k] = (count[k] || 0) + 1;
    body[k] = b.join('\n');
  }
});

const files = fs.readdirSync(DOCS).filter(f => /^\d+\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
let filled = 0, longer = 0;
files.forEach(f => {
  const p = path.join(DOCS, f);
  const raw = fs.readFileSync(p, 'utf8');
  const head = [], lines = raw.split('\n');
  let key = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*#/.test(l)) { if (!key) key = norm(l); head.push(l); continue; }
    if (/^\s*>/.test(l)) { head.push(l); continue; }
    if (l.trim() === '') { head.push(l); continue; }
    break;
  }
  if (!key || count[key] !== 1 || !body[key]) return;            // leave non-matching docs untouched
  const src = clean(body[key]);
  if (src.length < 20) return;
  const curBody = lines.filter(l => !/^\s*[#>]/.test(l)).join('').replace(/\s/g, '').length;
  if (src.replace(/\s/g, '').length > curBody * 1.15) longer++;
  const out = head.join('\n').replace(/\n+$/, '') + '\n\n' + src + '\n';
  if ((out.match(GARBAGE) || []).length) { console.error('garbage in filled', f); return; }
  if (APPLY) fs.writeFileSync(p, out);
  filled++;
});
console.log((APPLY ? 'APPLIED' : 'DRY-RUN') + ': filled ' + filled + ' docs from source (' + longer + ' restored >15% more text).');
if (!APPLY) console.log('Re-run with --apply <txt...>, then: node scripts/build-kb-index.cjs');
