#!/usr/bin/env node
/* precision-suite — 精度/品質ハーネスを一括実行し、いずれかが退行したら非ゼロ終了する。
 * 検索(searchKB)・JS式表検索(calc.lookup)・回答品質(ask-eval)・文法/忠実性・意図網羅を
 * まとめて守る回帰ゲート。各ハーネスの「合格条件」を満たすかをパターンで判定する。
 * 使い方: node scripts/precision-suite.cjs */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const DIR = __dirname;

// それぞれ: 実行スクリプトと「合格」を示す出力パターン（しきい値）
const CHECKS = [
  { name: 'hard 検索評価', file: 'ask-eval-hard.cjs', pass: /HARD RETRIEVAL SCORE \[bm25\]: (9[8-9]|100)/ },
  { name: 'recall (title→doc)', file: 'ask-recall-eval.cjs', pass: /Recall@1 : (9[0-9]|100|8[5-9])/ },
  { name: 'ask-eval 品質', file: 'ask-eval.cjs', pass: /QUALITY SCORE: 100\.0/ },
  { name: 'calc 式・表検索', file: 'calc-lookup-eval.cjs', pass: /CALC LOOKUP SCORE: (\d+) \/ \1/ },
  { name: 'junk-filter 判定', file: 'junk-filter-test.cjs', pass: /JUNK FILTER SCORE: (\d+) \/ \1/ },
  { name: 'recombine', file: 'recombine-harness.cjs', pass: /0 failed/ },
  { name: 'grammar-kuromoji', file: 'grammar-kuromoji-harness.cjs', pass: /0 failed/ },
  { name: 'intent 網羅', file: 'intent-coverage-harness.cjs', pass: /問題: なし/ }
];

let allOk = true;
for (const c of CHECKS) {
  let out = '';
  try { out = execFileSync('node', [path.join(DIR, c.file)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }   // 非ゼロ終了でも出力で判定
  const ok = c.pass.test(out);
  if (!ok) allOk = false;
  const metric = (out.match(/(HARD RETRIEVAL SCORE[^\n]*|Recall@1[^\n]*|QUALITY SCORE[^\n]*|CALC LOOKUP SCORE[^\n]*|JUNK FILTER SCORE[^\n]*|\d+ passed[^\n]*|問題: [^\n]*)/) || ['?'])[0].trim();
  console.log((ok ? '  OK   ' : '  FAIL ') + c.name.padEnd(20) + ' | ' + metric);
}
console.log('==== PRECISION SUITE: ' + (allOk ? 'ALL PASS' : 'REGRESSION DETECTED') + ' ====');
process.exit(allOk ? 0 : 1);
