/* NSCode Multi-Agent simulator (multiAgent) — DETERMINISTIC, OFFLINE.
 * No network, no LLM, no backend. Every output is derived purely from the
 * goal text via simple keyword rules + a seeded string hash, so the same
 * goal always yields the same task split / transcript / vote. This is a
 * rule-based simulation for learning multi-agent orchestration, NOT a real
 * agent system. */
(function (NSCode) {
  'use strict';

  /* ---- Roles: each has a color + emoji icon ---- */
  var ROLES = {
    Manager:    { name: 'Manager',    icon: '🧭', color: '#6ea8fe', desc: '全体を調整し方針を決める' },
    Planner:    { name: 'Planner',    icon: '🗺️', color: '#a78bfa', desc: 'ゴールを部分課題に分解する' },
    Researcher: { name: 'Researcher', icon: '🔍', color: '#34d399', desc: '情報を収集・調査する' },
    Coder:      { name: 'Coder',      icon: '💻', color: '#f59e0b', desc: '実装する' },
    Reviewer:   { name: 'Reviewer',   icon: '🧐', color: '#f472b6', desc: 'コードと設計をレビューする' },
    Tester:     { name: 'Tester',     icon: '🧪', color: '#22d3ee', desc: 'テストして品質を確認する' }
  };
  var ROLE_ORDER = ['Manager', 'Planner', 'Researcher', 'Coder', 'Reviewer', 'Tester'];

  function role(name) { return ROLES[name] || { name: name, icon: '🤖', color: '#9aa2b8', desc: '' }; }

  /* ---- deterministic seeded hash (FNV-1a-ish) for variety ---- */
  function hash(str) {
    var h = 2166136261;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0);
  }
  function pick(seed, arr) { return arr[seed % arr.length]; }

  /* ---- keyword detection (JP + EN) ---- */
  var KEYS = [
    { intent: 'design', words: ['設計', 'design', 'アーキ', 'architecture', '画面', 'ui', 'デザイン'] },
    { intent: 'implement', words: ['実装', '作成', '作る', 'implement', 'build', 'create', '追加', 'コード', 'code'] },
    { intent: 'test', words: ['テスト', 'test', '検証', 'verify', 'qa', '品質'] },
    { intent: 'fix', words: ['修正', 'バグ', 'fix', 'bug', 'debug', '直す'] },
    { intent: 'research', words: ['調査', '調べ', 'research', '比較', 'survey', '検討'] },
    { intent: 'doc', words: ['ドキュメント', 'doc', 'readme', '文書', '説明'] }
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

  function shortGoal(goal) {
    var g = String(goal || 'タスク').replace(/\s+/g, ' ').trim();
    return g.length > 28 ? g.slice(0, 28) + '…' : (g || 'タスク');
  }

  /* ---- distribute(goal) -> [{id, subtask, role, status, depends_on}] ---- */
  function distribute(goal) {
    var f = detect(goal);
    var sg = shortGoal(goal);
    var tasks = [];
    var id = 0;
    function add(subtask, r, deps) {
      tasks.push({
        id: 't' + id,
        subtask: subtask,
        role: r,
        status: 'todo',
        depends_on: deps || []
      });
      id++;
    }

    // Manager always coordinates first (no deps).
    add('「' + sg + '」のゴールを整理し、担当と進め方を決める', 'Manager', []);
    // Planner decomposes (depends on Manager).
    add('要件を部分課題に分解し、依存関係を洗い出す', 'Planner', ['t0']);
    // Researcher gathers (depends on Planner).
    add(f.research ? '関連事例・既存実装・制約を調査する' : '必要な前提知識と参考情報を収集する', 'Researcher', ['t1']);

    // Coder implements (depends on Researcher). Always present.
    var implIdx = id;
    add(f.design ? '設計に沿って画面/モジュールを実装する'
                 : (f.fix ? '原因を特定し修正パッチを実装する' : '主要な機能を実装する'), 'Coder', ['t2']);

    // Reviewer reviews the implementation.
    var reviewIdx = id;
    add('実装をレビューし、改善点を指摘する', 'Reviewer', ['t' + implIdx]);

    // Tester tests (depends on Coder, and Reviewer if present).
    add(f.test ? 'テストケースを作成して実行し、品質を確認する'
               : '動作確認とテストを行い受け入れ条件を満たすか検証する', 'Tester', ['t' + implIdx, 't' + reviewIdx]);

    // Optional: documentation as a final Planner/Manager wrap-up for doc goals,
    // giving variety while staying deterministic.
    if (f.doc) {
      add('変更内容をまとめ、ドキュメントを更新する', 'Planner', ['t' + reviewIdx]);
    } else {
      // Manager wrap-up to converge the work (keeps ~6-7 tasks).
      add('成果を統合し、完了条件を確認してクローズする', 'Manager', ['t' + (id - 1)]);
    }

    // Deterministically mark early tasks as advanced (done/doing) for a
    // realistic in-progress board, seeded by the goal.
    var seed = hash(goal);
    var progressCount = 1 + (seed % Math.min(3, tasks.length)); // 1..3 done
    for (var i = 0; i < tasks.length; i++) {
      if (i < progressCount) tasks[i].status = 'done';
      else if (i === progressCount) tasks[i].status = 'doing';
      else tasks[i].status = 'todo';
    }
    return tasks;
  }

  /* ---- chat(goal) -> ordered [{role, to, text}] ---- */
  function chat(goal) {
    var tasks = distribute(goal);
    var sg = shortGoal(goal);
    var seed = hash(goal);
    var msgs = [];
    function find(r) {
      for (var i = 0; i < tasks.length; i++) if (tasks[i].role === r) return tasks[i];
      return null;
    }
    var pTask = find('Planner'), rTask = find('Researcher'),
        cTask = find('Coder'), vTask = find('Reviewer'), tTask = find('Tester');

    // 1) Manager kicks off.
    msgs.push({ role: 'Manager', to: 'all',
      text: 'チームの皆さん、今回のゴールは「' + sg + '」です。役割を割り当てます。Planner はまず分解をお願いします。' });

    // 2) Planner reports the plan.
    msgs.push({ role: 'Planner', to: 'Manager',
      text: '了解しました。' + tasks.length + ' 件の部分課題に分解しました。まず「' +
        (pTask ? pTask.subtask : '要件分解') + '」を進め、依存関係を整理します。' });

    // 3) Researcher reports findings.
    msgs.push({ role: 'Researcher', to: 'all',
      text: pick(seed, ['調査の結果、', '関連事例を確認したところ、', '前提を整理すると、']) +
        '「' + (rTask ? rTask.subtask : '情報収集') + '」が完了。実装方針に使える知見を Coder に共有します。' });

    // 4) Coder reports implementation.
    msgs.push({ role: 'Coder', to: 'Reviewer',
      text: '共有ありがとうございます。「' + (cTask ? cTask.subtask : '実装') +
        '」に着手しました。主要部分の実装が一段落したので、Reviewer にレビュー依頼します。' });

    // 5) Reviewer feedback.
    msgs.push({ role: 'Reviewer', to: 'Coder',
      text: 'レビューしました。' + pick(seed >> 2, ['全体の構成は良好です。', '責務分割は妥当です。', '可読性は十分です。']) +
        pick(seed >> 4, ['エラーハンドリングを 1 箇所補ってください。', '命名を一部見直すと良いです。', '境界値の扱いを確認してください。']) });

    // 6) Coder addresses feedback.
    msgs.push({ role: 'Coder', to: 'Reviewer',
      text: '指摘を反映しました。修正をプッシュしたので、Tester に検証を引き継ぎます。' });

    // 7) Tester reports.
    msgs.push({ role: 'Tester', to: 'Manager',
      text: '「' + (tTask ? tTask.subtask : 'テスト') + '」を実施。' +
        pick(seed >> 6, ['全テストが緑です ✓', '主要シナリオは合格、軽微な warning が 1 件です。', 'カバレッジを確保し合格しました ✓']) });

    // 8) Manager converges.
    msgs.push({ role: 'Manager', to: 'all',
      text: '全員ありがとうございます。レビューとテストを通過したので、「' + sg + '」は完了とします。お疲れさまでした。' });

    return msgs;
  }

  /* ---- consensus(goal) -> {proposal, votes:[{role,score,comment}], decision, aggregate} ---- */
  function consensus(goal) {
    var f = detect(goal);
    var sg = shortGoal(goal);
    var seed = hash(goal + '|consensus');

    var proposal = '提案: 「' + sg + '」を ' +
      (f.design ? '設計→実装→レビュー→テスト' : (f.fix ? '原因調査→修正→回帰テスト' : '計画→実装→検証')) +
      ' の順で進め、各フェーズで担当ロールが成果を確認してから次へ進める。';

    // Each role scores the proposal deterministically. Base scores per role
    // reflect their concern, nudged by the seed for variety.
    var base = {
      Manager: 0.86, Planner: 0.82, Researcher: 0.75,
      Coder: 0.78, Reviewer: 0.70, Tester: 0.72
    };
    var comments = {
      Manager:    ['段取りが明確で進めやすい。', '責任分担がはっきりしている。'],
      Planner:    ['分解の粒度が適切。', 'フェーズ移行の基準が明確。'],
      Researcher: ['調査フェーズが先にあるのが良い。', '前提確認の時間が欲しい。'],
      Coder:      ['実装範囲が見通せる。', 'レビュー前提なら安心して書ける。'],
      Reviewer:   ['レビュー観点を事前共有したい。', '受け入れ条件を明文化したい。'],
      Tester:     ['テスト設計の時間を確保したい。', '回帰テストの範囲を決めたい。']
    };

    var votes = ROLE_ORDER.map(function (rn, i) {
      var jitter = (((seed >> (i * 3)) & 7) - 3) / 100; // -0.03 .. +0.04
      var score = Math.max(0, Math.min(1, base[rn] + jitter));
      score = Math.round(score * 100) / 100;
      var cArr = comments[rn];
      return { role: rn, score: score, comment: pick((seed >> i) >>> 0, cArr) };
    });

    var sum = votes.reduce(function (s, v) { return s + v.score; }, 0);
    var aggregate = Math.round((sum / votes.length) * 100) / 100;
    var decision = aggregate >= 0.7 ? 'approved' : 'revise';

    return { proposal: proposal, votes: votes, decision: decision, aggregate: aggregate };
  }

  NSCode.multiAgent = {
    roles: ROLES,
    roleOrder: ROLE_ORDER,
    role: role,
    detect: detect,
    distribute: distribute,
    chat: chat,
    consensus: consensus
  };
})(window.NSCode);
