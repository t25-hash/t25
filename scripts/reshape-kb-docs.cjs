#!/usr/bin/env node
/* Reshape the existing KB markdown (assets/kb/docs/NNNN.md) in place, fixing the
 * two-column PDF interleaving WITHOUT needing the original PDF. It applies the
 * SAME de-interleave logic the runtime uses (parity split of body lines = the two
 * columns, equation-line skip, soft-wrap re-join), choosing the original vs
 * de-interleaved order by clean-sentence yield + an in-domain language model
 * (fluency, loaded from ask-engine). Only documents that read clearly better
 * de-interleaved are rewritten; single-column / unrecoverable docs are untouched.
 *
 * Note: this can only recover what is still present in the .md (regular
 * line-alternating two-column). Characters dropped at extraction cannot be
 * restored — that needs the source PDF.
 *
 * Usage:
 *   node scripts/reshape-kb-docs.cjs           # dry run (report only)
 *   node scripts/reshape-kb-docs.cjs --apply   # rewrite the files
 * Then rebuild the index:  node scripts/build-kb-index.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'assets/kb/docs');
const APPLY = process.argv.indexOf('--apply') >= 0;

// in-domain fluency LM (char bigrams over the clean DEFAULT_DOCS) — same model the
// runtime uses for the de-interleave decision.
global.window = { NSCode: { store: { get: (k, d) => d, set() {} } } };
require(path.join(ROOT, 'assets/js/ask-engine.js'));
const fluency = window.NSCode.askEngine.fluency;

// ---- replicas of the runtime helpers (assets/js/ask-engine.js) ----
const ENDER = /[。．！？!?]/;
function cleanLine(l) { return l.replace(/^[ \t]*#{1,6}[ \t]+/, '').replace(/^[ \t]*>[ \t]?/, '').replace(/[*_`]+/g, '').trim(); }
function splitSentences(text) {
  const t = text.replace(/\s+/g, ' ').trim(); const out = []; let buf = '';
  for (let i = 0; i < t.length; i++) { const c = t.charAt(i); buf += c;
    if ('。．！？!?'.indexOf(c) >= 0) { out.push(buf); buf = ''; }
    else if (c === '.') { const nx = t.charAt(i + 1); if (nx === '' || nx === ' ') { out.push(buf); buf = ''; } } }
  if (buf) out.push(buf);
  return out.map(s => s.trim()).filter(s => s.replace(/[\s、,]/g, '').length >= 8);
}
function sanitizeSent(s) {
  s = String(s || '');
  s = s.replace(/^[A-Za-z][^。．！？]*?[（(]\s*(?:19|20)\d{2}\s*[)）][^。．！？]*?[.．](?=\s*[一-鿿ぁ-ヿ])/, '');
  s = s.replace(/[（(]\s*(?:19|20)\d{2}\s*[)）]\s*,?\s*\d*\.?/g, '');
  s = s.replace(/[（(]\s*(?:図|表|式)[^）)]*[）)]/g, '');
  s = s.replace(/式\s*\([^)]*\)/g, '');
  s = s.replace(/[（(]\s*[ⅰ-ⅹⅠ-Ⅹ]+\s*[）)]/g, '');
  s = s.replace(/[（(]\s*[0-9０-９]{1,2}\s*[）)]/g, '');
  s = s.replace(/β\s*\d+\s*[－-]\s*\d+|β\s*\d+\s*編|[一-鿿]\d+\s*編/g, '');
  s = s.replace(/^[\s.．。・･,，、:：;；)\]】」』>＞〕）]+/, '');
  s = s.replace(/[ \t　]{2,}/g, ' ').replace(/\s+([、。，．）)」』])/g, '$1').trim();
  return s;
}
function isJunkSent(s) {
  if (!ENDER.test(s)) return true;
  if (s.replace(/[\s、，]/g, '').length < 14) return true;
  if (/^[をはがのにへともでやゝ々、，。・ー）)】」』＞ァィゥェォッャュョヮぁぃぅぇぉっゃゅょゎｧｨｩｪｫｬｭｮｯ]/.test(s)) return true;
  if (/^\s*(?:表|図|式|付表|付図|第\s*[0-9０-９]+\s*[章節項表図])/.test(s)) return true;
  if (/^\s*(?:[（(]?\s*[0-9０-９a-zａ-ｚ]+\s*[)）.\．、]|[①-⑳]|[・･\-*▪◦])/.test(s)) return true;
  if ((s.match(/：/g) || []).length >= 2) return true;
  if (/[＝∫∑Σ∏Γ∇√]/.test(s)) return true;
  if (/[（(]\s*[0-9０-９]{1,2}\s*[）)]\s*\S/.test(s)) return true;
  if (/[βα]\s*\d|－\s*\d{2,}|\d+\s*編\b/.test(s)) return true;
  if ((s.match(/[、，][ 　\t]/g) || []).length >= 2) return true;
  if ((s.match(/[一-鿿ぁ-ヿ][ 　\t][一-鿿ぁ-ヿ]/g) || []).length >= 2) return true;
  if (((s.match(/[（(]/g) || []).length) !== ((s.match(/[）)]/g) || []).length)) return true;
  const letters = (s.match(/[一-鿿ぁ-ヶ゠-ヿ]/g) || []).length;
  if (letters < s.length * 0.55) return true;
  return false;
}
function isHeadingLine(l) {
  if (ENDER.test(l)) return false;
  if (l.length <= 9) return true;
  if (/^\s*(?:表|図|式|付表|付図|第\s*[0-9０-９]+\s*[章節項表図])/.test(l)) return true;
  if (/^[0-9０-９]+[.．・]/.test(l)) return true;
  return false;
}
function isMathLine(l) {
  const jp = (l.match(/[一-鿿ぁ-ヿ]/g) || []).length;
  if (jp >= l.length * 0.35) return false;
  return /[=＝＋×÷∫∑√σεγτθλμνπρω()（）0-9]/.test(l);
}
function emitSentences(lines) {
  const out = []; let buf = '';
  lines.forEach(line => {
    if (isMathLine(line)) return;
    if (!line || isHeadingLine(line)) { buf = ''; return; }
    buf += line;
    let last = -1; for (let i = 0; i < buf.length; i++) if ('。．！？!?'.indexOf(buf.charAt(i)) >= 0) last = i;
    if (last >= 0) { splitSentences(buf.slice(0, last + 1)).forEach(s => { s = sanitizeSent(s); if (s) out.push(s); }); buf = buf.slice(last + 1); }
    else if (buf.length > 180) buf = '';
  });
  return out;
}
function cleanYield(ss) { let n = 0; for (const s of ss) if (s.length >= 18 && !isJunkSent(s)) n++; return n; }

// returns { sentences, deint } where deint=true if de-interleaved order was chosen
function reshapeBody(body) {
  const A = emitSentences(body);
  if (body.length < 6) return { sentences: A, deint: false };
  const odd = [], even = [];
  for (let i = 0; i < body.length; i++) (i % 2 ? even : odd).push(body[i]);
  const B = emitSentences(odd.concat(even));
  const ya = cleanYield(A), yb = cleanYield(B);
  if (yb === 0) return { sentences: A, deint: false };
  if (ya === 0) return { sentences: B, deint: true };
  if (yb > ya * 1.2) return { sentences: B, deint: true };
  const fa = fluency(A.join('')), fb = fluency(B.join(''));
  if (fb > fa && yb >= ya * 0.7) return { sentences: B, deint: true };
  if (fa > fb && ya >= yb * 0.7) return { sentences: A, deint: false };
  return yb > ya ? { sentences: B, deint: true } : { sentences: A, deint: false };
}

// ---- run ----
const files = fs.readdirSync(DOCS).filter(f => /^\d+\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
let changed = 0, skipped = 0;
for (const f of files) {
  const raw = fs.readFileSync(path.join(DOCS, f), 'utf8');
  let titleLine = '', crumbLines = [], body = [];
  raw.split('\n').forEach(line => {
    if (/^\s*#/.test(line)) { if (!titleLine) titleLine = line.replace(/\s+$/, ''); return; }   // keep first heading verbatim
    if (/^\s*>/.test(line)) { if (line.trim()) crumbLines.push(line.replace(/\s+$/, '')); return; }  // keep breadcrumb verbatim
    const cl = cleanLine(line); if (cl) body.push(cl);
  });
  const r = reshapeBody(body);
  if (!r.deint || r.sentences.length < 2) { skipped++; continue; }   // only rewrite clear de-interleave wins
  let md = (titleLine || '# ' + (f.replace('.md', ''))) + '\n\n';
  if (crumbLines.length) md += crumbLines.join('\n') + '\n\n';
  md += r.sentences.join('\n') + '\n';
  if (APPLY) fs.writeFileSync(path.join(DOCS, f), md);
  changed++;
}
console.log((APPLY ? 'APPLIED' : 'DRY-RUN') + ': de-interleaved & rewrote ' + changed + ' docs, left ' + skipped + ' unchanged (of ' + files.length + ').');
if (!APPLY) console.log('Re-run with --apply to write, then: node scripts/build-kb-index.cjs');
