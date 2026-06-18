/* NSCode lastRun — the most recent Ask pipeline run, shared so every sidebar Lab
 * can visualize the SAME query. Ask is the driver; each Lab is an inspector that
 * shows that one question through its own lens (embedding / retrieval / tool call
 * / memory recall / agent loop …). This is the first step of "LLM visualization":
 * the pieces stop being isolated demos and reflect one real run. */
(function (NSCode) {
  'use strict';
  var KEY = 'ask.lastRun', current = null;
  try { current = NSCode.store ? NSCode.store.get(KEY, null) : null; } catch (e) {}

  function set(run) { current = run; try { if (NSCode.store) NSCode.store.set(KEY, run); } catch (e) {} }
  function get() { return current; }
  function query() { return current && current.query ? current.query : ''; }
  function context(n) {
    if (!current || !current.hits) return '';
    return current.hits.slice(0, n || current.hits.length).map(function (h) { return h.text; }).join('\n\n');
  }

  function esc(s) { return NSCode.C ? NSCode.C.esc(s) : String(s == null ? '' : s); }
  function tags(run) {
    var seen = {}, out = [];
    (run.hits || []).forEach(function (h) { if (!seen[h.source]) { seen[h.source] = 1; out.push('<span class="ns-tag">' + esc(h.source) + '</span>'); } });
    return out.join(' ');
  }
  function hitList(run, n) {
    return '<div>' + (run.hits || []).slice(0, n || 4).map(function (h, i) {
      var t = h.text || '';
      return '<div class="ns-hit"><div class="ns-hit__head"><span>#' + (i + 1) + ' · ' + esc(h.source) + '</span>' +
        '<span class="ns-hit__score">cos ' + (h.score != null ? h.score.toFixed(3) : '—') + '</span></div>' +
        '<p class="ns-hit__text">' + esc(t.slice(0, 160)) + (t.length > 160 ? '…' : '') + '</p></div>';
    }).join('') + '</div>';
  }
  function answerHtml(run) {
    var a = (run.answer && run.answer.length) ? run.answer.map(esc).join('<br>') : esc(run.generated || '');
    return '<p class="ns-qa-answer__lead">' + a + '</p>';
  }

  /* per-Lab lens on the same run */
  var BODY = {
    embedding: function (run) {
      var v = (run.qvec || []).slice(0, 12).map(function (x) { return Number(x).toFixed(2); }).join(', ');
      return '<p class="ns-empty__hint">クエリ「' + esc(run.query) + '」をベクトル化（先頭12次元）:</p>' +
        '<pre class="ns-code">[' + v + ' …]</pre>' +
        '<p class="ns-empty__hint">このベクトルと各チャンクのコサイン類似度で検索 ↓</p>' + hitList(run, 4);
    },
    rag: function (run) {
      return '<p class="ns-empty__hint">「' + esc(run.query) + '」で検索したチャンク（類似度順）:</p>' + hitList(run, 4) +
        '<p class="ns-empty__hint">これらを文脈にして回答を構成しています。</p>';
    },
    neural: function (run) {
      return '<p class="ns-empty__hint">直近の質問「' + esc(run.query) + '」に対する生成:</p>' +
        '<div class="ns-qa-answer__src">起点: <span class="ns-tag">' + esc(run.seed || '') + '</span></div>' +
        '<p class="ns-qa-answer__lead">' + esc(run.generated || '') + '</p>';
    },
    tools: function (run) {
      return '<p class="ns-empty__hint">Ask の検索を「ツール呼び出し」として見ると:</p>' +
        '<pre class="ns-code">search_kb({ query: "' + esc(run.query) + '" })\n→ ' + ((run.hits || []).length) + ' 件ヒット</pre>' + hitList(run, 3);
    },
    mcp: function (run) {
      return '<p class="ns-empty__hint">同じ検索を MCP の tools/call で表すと:</p>' +
        '<pre class="ns-code">{"method":"tools/call",\n "params":{"name":"kb.search",\n  "arguments":{"query":"' + esc(run.query) + '"}}}\n→ ' + ((run.hits || []).length) + ' results</pre>' + hitList(run, 3);
    },
    memory: function (run) {
      return '<p class="ns-empty__hint">「' + esc(run.query) + '」で<b>想起</b>された文脈（検索＝意味メモリの recall）:</p>' + hitList(run, 4);
    },
    agent: function (run) {
      return '<p class="ns-empty__hint">Ask の流れを1ステップのエージェントループとして:</p>' +
        '<pre class="ns-code">Plan    : 知識ベースを検索する\nAction  : search("' + esc(run.query) + '")\nObserve : ' + ((run.hits || []).length) + ' 件の関連チャンク\nAnswer  : 文脈から回答を構成</pre>' + answerHtml(run);
    },
    'multi-agent': function (run) {
      return '<p class="ns-empty__hint">「' + esc(run.query) + '」を複数エージェントで解くなら: Retriever が検索 → Writer が ' +
        ((run.hits || []).length) + ' 件の文脈から回答を構成、という分担になります。</p>' + answerHtml(run);
    },
    evaluation: function (run) {
      var sc = (run.hits || []).map(function (h) { return h.score || 0; });
      var top = sc.length ? Math.max.apply(null, sc) : 0;
      var mean = sc.length ? sc.reduce(function (a, b) { return a + b; }, 0) / sc.length : 0;
      return '<p class="ns-empty__hint">直近検索の指標（「' + esc(run.query) + '」）:</p>' +
        NSCode.C.Table(['指標', '値'], [['ヒット数', String(sc.length)], ['最高 cos', top.toFixed(3)], ['平均 cos', mean.toFixed(3)]]);
    }
  };

  function generic(run) {
    return '<p class="ns-empty__hint">直近の質問:「' + esc(run.query) + '」　参照: ' + tags(run) + '</p>' + answerHtml(run) +
      '<p class="ns-empty__hint"><a href="#/ask">Ask</a> で質問するとここが更新されます。</p>';
  }

  /* HTML panel for a Lab's module key, or '' when there is no run / on Ask itself */
  function card(moduleKey) {
    var run = get();
    if (!run || !run.query || moduleKey === 'ask') return '';
    var body = (BODY[moduleKey] || generic)(run);
    return NSCode.C.Panel({ title: '🔗 Ask 連動ビュー', hint: '同じ質問の実データをこの Lab の観点で表示（Ask が更新元）', body: body });
  }

  /* apply the latest Ask run to a Lab's state ONCE per run (tracked by ts on the
   * state object), so the Lab reflects the question without clobbering later edits.
   * fields: map of stateKey -> 'query' | 'context'. Returns true if it changed. */
  function applyTo(state, fields) {
    if (!current || !current.ts || state._askTs === current.ts) return false;
    Object.keys(fields).forEach(function (k) {
      var src = fields[k];
      var val = src === 'context' ? context() : query();
      if (val) state[k] = val;
    });
    state._askTs = current.ts;
    return true;
  }

  NSCode.lastRun = { set: set, get: get, query: query, context: context, card: card, applyTo: applyTo };
})(window.NSCode);
