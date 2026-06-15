/* NSCode Agent simulator (agentSim) — a DETERMINISTIC, OFFLINE ReAct-style
 * agent loop. No network, no LLM. All behavior is rule/keyword-based so the
 * same goal always produces the same trace. Educational, not a real agent. */
(function (NSCode) {
  'use strict';

  /* ---- mock tool set (deterministic, no side effects) ---- */
  var TOOLS = {
    search: function (q) { return 'search("' + q + '") → 3 件の候補を取得'; },
    read_file: function (f) { return 'read_file("' + f + '") → ' + (12 + (f.length % 40)) + ' 行を読み込み'; },
    write_file: function (f) { return 'write_file("' + f + '") → パッチを適用'; },
    run_tests: function () { return 'run_tests() → テストスイートを実行'; }
  };

  /* keyword tables: Japanese + English triggers -> intent */
  var KEYS = [
    { intent: 'test', words: ['テスト', 'test', 'spec', 'ci', '通す', 'green'] },
    { intent: 'fix', words: ['修正', 'バグ', 'fix', 'bug', 'repair', 'debug', '直す'] },
    { intent: 'create', words: ['作成', '作る', 'create', 'add', '追加', 'new', '新規'] },
    { intent: 'search', words: ['検索', '探す', 'search', 'find', 'locate', '調査', '調べる'] },
    { intent: 'refactor', words: ['リファクタ', 'refactor', '整理', 'cleanup', 'clean'] },
    { intent: 'doc', words: ['ドキュメント', 'doc', 'readme', '説明', '文書'] }
  ];

  function detect(goal) {
    var g = String(goal || '').toLowerCase();
    var found = {};
    KEYS.forEach(function (k) {
      for (var i = 0; i < k.words.length; i++) {
        if (g.indexOf(k.words[i].toLowerCase()) !== -1) { found[k.intent] = true; break; }
      }
    });
    return found;
  }

  /* ---- plan(goal) -> array of step strings ---- */
  function plan(goal) {
    var f = detect(goal);
    var steps = [];
    // Investigation always comes first when searching/fixing.
    if (f.search || f.fix) steps.push('関連コードを検索して問題箇所を特定する');
    if (f.fix) {
      steps.push('原因となるファイルを読み込み根本原因を分析する');
      steps.push('修正パッチを書き込む');
    }
    if (f.create) {
      steps.push('要件を満たす新しいファイル／関数を作成する');
    }
    if (f.refactor) {
      steps.push('対象コードを読み込み構造を整理する');
    }
    if (f.doc) {
      steps.push('変更内容に合わせてドキュメントを更新する');
    }
    // Fallback when no keyword matched: a generic decomposition.
    if (!steps.length) {
      steps.push('ゴールを部分課題に分解する');
      steps.push('必要な情報を収集して下準備を行う');
      steps.push('主要な変更を適用する');
    }
    // Always end with an explicit verification step.
    if (f.test) steps.push('テストを実行して結果を確認する（検証）');
    else steps.push('変更を検証して受け入れ条件を満たすか確認する（検証）');
    return steps;
  }

  /* pick a tool + observation for a given plan step (deterministic) */
  function actionFor(step, goal) {
    var s = step;
    if (/検索|特定/.test(s)) return { tool: 'search', obs: TOOLS.search(shortGoal(goal)) };
    if (/読み込|分析|整理/.test(s)) return { tool: 'read_file', obs: TOOLS.read_file(targetFile(goal)) };
    if (/書き込|パッチ|作成|更新/.test(s)) return { tool: 'write_file', obs: TOOLS.write_file(targetFile(goal)) };
    if (/テスト|検証|確認/.test(s)) return { tool: 'run_tests', obs: TOOLS.run_tests() };
    return { tool: 'search', obs: TOOLS.search(shortGoal(goal)) };
  }

  function shortGoal(goal) {
    var g = String(goal || 'タスク').replace(/\s+/g, ' ').trim();
    return g.length > 24 ? g.slice(0, 24) + '…' : g;
  }
  function targetFile(goal) {
    var f = detect(goal);
    if (f.test || f.fix) return 'src/auth.js';
    if (f.create) return 'src/feature.js';
    if (f.doc) return 'README.md';
    return 'src/main.js';
  }

  /* ---- run(goal) -> ordered trace of {phase, text, ok, iter} ----
   * Deterministic loop: one Action+Observation per plan step. The verify
   * step FAILS on the first attempt, triggers a Reflection, then a Retry
   * that succeeds. */
  function run(goal) {
    var steps = plan(goal);
    var trace = [];
    var iter = 0;

    trace.push({ phase: 'Goal', text: String(goal || '(ゴール未設定)'), ok: true, iter: iter });
    trace.push({ phase: 'Plan', text: steps.length + ' ステップの計画を生成:\n' +
      steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'), ok: true, iter: iter });

    for (var i = 0; i < steps.length; i++) {
      iter++;
      var step = steps[i];
      var act = actionFor(step, goal);
      var isVerify = /検証/.test(step) || act.tool === 'run_tests';

      trace.push({ phase: 'Action', text: 'Thought: ' + step + '\nAct: ' + act.tool + '()', ok: true, iter: iter });

      if (isVerify) {
        // First attempt deterministically fails.
        trace.push({ phase: 'Observation', text: act.obs + '\n→ 失敗: 1 件のテストが赤 (assert mismatch)', ok: false, iter: iter });
        trace.push({ phase: 'Reflection', text: '失敗を分析: 期待値と実装の不一致。修正パッチが境界条件を取りこぼしている可能性が高い。エッジケースを補ってから再実行する。', ok: true, iter: iter });
        iter++;
        trace.push({ phase: 'Retry', text: 'Thought: エッジケースを追加で修正\nAct: write_file() → run_tests()  (試行 2)', ok: true, iter: iter });
        trace.push({ phase: 'Observation', text: TOOLS.run_tests() + '\n→ 成功: 全テストが緑 ✓', ok: true, iter: iter });
      } else {
        trace.push({ phase: 'Observation', text: act.obs, ok: true, iter: iter });
      }
    }
    return trace;
  }

  /* ---- reflect(trace) -> improvement suggestion strings (heuristic) ---- */
  function reflect(trace) {
    trace = trace || [];
    var actions = 0, fails = 0, retries = 0, verified = false;
    trace.forEach(function (t) {
      if (t.phase === 'Action') actions++;
      if (t.phase === 'Retry') retries++;
      if (t.ok === false) fails++;
      if (t.phase === 'Observation' && /成功|緑/.test(t.text)) verified = true;
    });
    var out = [];
    if (fails > 0) {
      out.push('最初の検証で失敗が発生: 変更前にローカルでテストを先に書く（テスト駆動）と早期に検知できる。');
    }
    if (retries > 0) {
      out.push('リトライで回復: 失敗原因（境界条件）を計画段階のチェックリストに追加し、同種の失敗を未然に防ぐ。');
    }
    if (actions > 4) {
      out.push('アクション数が ' + actions + ' と多め: 関連ファイルをまとめて読み込み、往復回数を減らせる。');
    } else {
      out.push('アクション数は ' + actions + ' と適度: 各ステップが明確で無駄が少ない。');
    }
    out.push(verified
      ? '最終的に検証ステップが成功: 受け入れ条件を満たしたことを明示的に確認できている。'
      : '検証ステップが未完了: 必ず run_tests() などで受け入れ条件を確認する。');
    out.push('観測（Observation）を毎回 Thought に反映し、次のアクションの根拠を残すとトレースの追跡性が上がる。');
    return out;
  }

  /* ---- retryDemo() -> attempts with exponential backoff (deterministic) ---- */
  function retryDemo() {
    var actions = [
      'run_tests() → 接続タイムアウト',
      'run_tests() → flaky な 1 件が赤',
      'run_tests() → 全テスト緑 ✓'
    ];
    var backoffs = [1000, 2000, 4000];
    var out = [];
    for (var n = 1; n <= 3; n++) {
      var ok = (n === 3);
      out.push({
        n: n,
        action: actions[n - 1],
        ok: ok,
        backoff_ms: ok ? 0 : backoffs[n - 1]
      });
    }
    return out;
  }

  NSCode.agentSim = {
    tools: TOOLS,
    plan: plan,
    run: run,
    reflect: reflect,
    retryDemo: retryDemo
  };
})(window.NSCode);
