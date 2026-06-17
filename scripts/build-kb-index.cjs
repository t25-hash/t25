#!/usr/bin/env node
/* Build the prebuilt KB search index (assets/kb/index.json) from the Markdown
 * documents in assets/kb/docs/NNNN.md.
 *
 * The index is a pruned TF-IDF inverted index consumed at runtime by
 * NSCode.askEngine.searchKB (assets/js/ask-engine.js). Term extraction MUST stay
 * identical to the runtime gram(): latin words [a-z][a-z0-9-]+ plus CJK character
 * bigrams (consecutive CJK chars, punctuation/space skipped).
 *
 * Output shape: { n, meta:[title per doc], post:{ term: [[docIdx, weight], …] } }
 *   - docIdx i  ↔  assets/kb/docs/(i+1).md  (4-digit, 1-based)
 *   - meta[i]   ↔  that doc's first「# …」heading
 *   - weight    = BM25 term weight (k1=1.2, b=0.5), 3 decimals. searchKB sums
 *                 these per-term weights. BM25 saturates term frequency and applies
 *                 MODERATE length normalization, so it recalls short topic docs
 *                 (尺貫系) yet still ranks long on-topic docs well (軸受) — better
 *                 than plain tf·idf (favours dense reference docs) or ltc cosine
 *                 (over-boosts short/generic docs).
 *
 * Pruning (tuned for recall vs size — ~12MB raw / ~3.7MB gzip):
 *   K=8     keep at most 8 docs per term (by weight)
 *   DFMIN=2 drop terms occurring in fewer than 2 docs (hapax noise)
 *   DFCAP=0.30 drop terms occurring in more than 30% of docs (generic: 仕組/特徴 …)
 *
 * Usage: node scripts/build-kb-index.cjs [K] [DFCAP] [DFMIN] [OUT]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'assets/kb/docs');
const K = +process.argv[2] || 8;
const DFCAP = +(process.argv[3] || 0.30);
const DFMIN = +(process.argv[4] || 2);
const OUT = process.argv[5] || path.join(ROOT, 'assets/kb/index.json');

function gram(t) {
  const g = (t.toLowerCase().match(/[a-z][a-z0-9\-]{1,}/g) || []);
  const cjk = t.match(/[぀-ヿ一-鿿ｦ-ﾟ]/g) || [];
  for (let i = 0; i < cjk.length - 1; i++) g.push(cjk[i] + cjk[i + 1]);
  return g;
}
function titleOf(text) {
  const m = String(text).match(/^\s*#\s+(.+)\s*$/m);
  return m ? m[1].trim() : '';
}

const files = fs.readdirSync(DOCS).filter(f => /^\d+\.md$/.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b));
const N = files.length;
console.log('docs:', N, '| K=' + K, 'DFCAP=' + DFCAP, 'DFMIN=' + DFMIN);

const tfs = new Array(N), meta = new Array(N), df = new Map();
for (let i = 0; i < N; i++) {
  const txt = fs.readFileSync(path.join(DOCS, files[i]), 'utf8');
  meta[i] = titleOf(txt);
  const tf = new Map();
  for (const t of gram(txt)) tf.set(t, (tf.get(t) || 0) + 1);
  tfs[i] = tf;
  for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  if ((i + 1) % 1000 === 0) process.stdout.write(' ' + (i + 1));
}
process.stdout.write('\n');

const dfMax = Math.floor(DFCAP * N), idf = new Map();
for (const [t, d] of df) idf.set(t, Math.log(1 + (N - d + 0.5) / (d + 0.5)));   // BM25 idf

// document lengths (in terms) for BM25 length normalization
const dl = new Array(N); let sumdl = 0;
for (let i = 0; i < N; i++) { let s = 0; for (const c of tfs[i].values()) s += c; dl[i] = s; sumdl += s; }
const avgdl = sumdl / N, k1 = 1.2, b = 0.5;

const post = new Map();
for (let i = 0; i < N; i++) {
  const tf = tfs[i], lenNorm = k1 * (1 - b + b * dl[i] / avgdl);
  for (const [t, c] of tf) {
    const d = df.get(t);
    if (d > dfMax || d < DFMIN) continue;
    const w = idf.get(t) * (c * (k1 + 1)) / (c + lenNorm);     // BM25 term weight
    let arr = post.get(t); if (!arr) { arr = []; post.set(t, arr); }
    arr.push([i, w]);
  }
  tfs[i] = null;
}

const postObj = {}; let total = 0;
for (const [t, arr] of post) {
  arr.sort((a, b) => b[1] - a[1]);
  postObj[t] = arr.slice(0, K).map(e => [e[0], +e[1].toFixed(3)]);
  total += postObj[t].length;
}
const json = JSON.stringify({ n: N, meta: meta, post: postObj });
fs.writeFileSync(OUT, json);
console.log('terms:', Object.keys(postObj).length, '| postings:', total,
  '| size:', (json.length / 1048576).toFixed(2), 'MB ->', OUT);
