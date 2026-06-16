/* Claude Code Explorer (CCEX) — an OFFLINE, DETERMINISTIC, EDUCATIONAL
 * visualization of Claude Code's architecture.
 *
 * HONESTY NOTE: This is a *conceptual model* built from PUBLIC analyses of
 * Claude Code. It illustrates well-known public points (the agent while-loop,
 * the permission gate, the deterministic-infrastructure-vs-AI-logic split,
 * context/memory composition). It does NOT reproduce any private/proprietary
 * internals, and any numeric figures shown are approximate, public estimates.
 *
 * SINGLE PAGE: per the user rule「サイドバー1項目=1ページ、タブ複数禁止」,
 * everything lives on ONE page (#/claude-code) with NO tabs — stacked C.Panel
 * sections (Architecture / Execution / Session / Tool / Memory / Mini Harness).
 * render() returns a STRING; all DOM wiring happens in onMount. Former
 * sub-routes are registered as aliases pointing at the same render+onMount. */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;

  var DISCLAIMER = '教育用の概念モデル（Claude Code の公開分析に基づく・概数）';

  /* ---- persisted state ---- */
  var state = NSCode.api.labState('#/claude-code') || {};
  state = Object.assign({
    selectedSystem: 'Permission System',
    execStep: 0,
    execToolType: 'read',     // 'read' (read-only) | 'write'
    openTurn: 1,
    restored: false,
    compacted: false,
    harnessMode: 'auto'
  }, state);

  function persist() { NSCode.api.labState('#/claude-code', state); }
  function el(id) { return document.getElementById(id); }

  /* =====================================================================
   * DATA — the 10 systems (conceptual descriptions from public analyses)
   * ===================================================================== */
  var SYSTEMS = [
    { id: 'Context System', tag: 'infra', desc:
      'モデル呼び出しの前に、システムプロンプト・利用可能なツール定義・会話履歴・現在の作業状態を1つのコンテキストへ組み立てる役割。Claude Code は毎ループの先頭でコンテキストを再構築する（パイプラインではなくフィードバック制御の入力段）。トークン予算の管理もここが担う。' },
    { id: 'Permission System', tag: 'infra', desc:
      'エージェントループとツール実行の「間」に常駐する承認ゲート。すべてのツール要求はここを必ず通過する。読み取り専用ツールは自動承認しうるが、書き込み/実行系は確認を要求する。複数の権限モード（既定 / 自動承認 / 計画専用など）が存在し、安全性の中核を成す決定論的な仕組み。' },
    { id: 'Tool System', tag: 'infra', desc:
      'モデルが要求した tool-use を実際の関数呼び出しへルーティングし、結果（観測）を構造化して返す。ファイル読取・編集・コマンド実行・検索・サブエージェント起動などのカテゴリを持ち、入力検証や出力整形といった定型処理を担う。' },
    { id: 'Memory System', tag: 'infra', desc:
      'コンテキストウィンドウが満杯に近づいたとき、古いターンを要約（コンパクション）して空間を確保する。プロジェクト固有の指示などの永続メモリも扱う。会話を「忘れずに縮める」ための決定論的な管理機構。' },
    { id: 'Planning', tag: 'ai', desc:
      'ゴールをサブタスクへ分解する推論。AI（モデル）の判断が関わる数少ない領域の1つ。計画専用モードでは、変更を加える前に計画だけを提示することもできる。' },
    { id: 'Reflection', tag: 'ai', desc:
      '実行結果（観測）を踏まえて次の行動を見直す自己点検。失敗やテスト結果を読み、方針を修正する。モデルの推論に依存する部分。' },
    { id: 'Retry', tag: 'infra', desc:
      '一時的な失敗（ネットワーク等）に対し、指数バックオフなどで再試行する定型ロジック。何回・どれだけ待つかは決定論的なルールで決まる。' },
    { id: 'Recovery', tag: 'infra', desc:
      'ツール失敗・不正な出力・中断などからの回復処理。エラーを観測としてループへ戻し、安全な状態を保ったまま継続できるようにする。大半が定型の例外処理。' },
    { id: 'Checkpoint', tag: 'infra', desc:
      '会話やファイル状態のスナップショットを取り、必要なら以前の地点へ巻き戻せるようにする。ターン境界で状態を確定（コミット）する仕組みと結びつく。' },
    { id: 'SubAgent', tag: 'infra', desc:
      '大きな/専門的なタスクを、隔離されたコンテキストを持つ子エージェントへ委譲する仕組み。親のコンテキストを汚さずに探索や調査を並行できる。委譲の判断にはAIが関わるが、起動・隔離・結果回収の枠組みは定型インフラ。' }
  ];
  function findSystem(id) {
    for (var i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].id === id) return SYSTEMS[i];
    return SYSTEMS[0];
  }

  // Approx. public estimate of the AI-logic vs infrastructure split.
  var AI_PCT = 1.6, INFRA_PCT = 98.4;

  /* =====================================================================
   * EXECUTION DATA — step-through of the agent while-loop
   * The Permission Gate / Execute outcome depends on tool type.
   * ===================================================================== */
  function execSteps(toolType) {
    var isWrite = toolType === 'write';
    return [
      { key: 'context', icon: '🧩', title: 'Build Context', kind: 'infra',
        text: 'システムプロンプト + ツール定義 + 履歴 + 現在の状態を1つのコンテキストへ組み立てる。' },
      { key: 'model', icon: '🧠', title: 'Call Model', kind: 'ai',
        text: 'モデルにコンテキストを渡し、次の一手（テキスト or tool-use）を生成させる。' },
      { key: 'requested', icon: '❓', title: 'Tool requested?', kind: 'infra',
        text: 'モデルの出力が tool-use を含むか判定。含まなければ応答を返してループ終了。今回は ' +
          (isWrite ? '「書き込み系」' : '「読み取り専用」') + 'ツールが要求されたとする。' },
      { key: 'gate', icon: '🛡️', title: 'Permission Gate', kind: 'infra',
        text: isWrite
          ? '書き込み/実行系ツールのため自動承認できない → ユーザーに確認を要求（許可されると先へ進む）。'
          : '読み取り専用ツールのため、安全と判断して自動承認（確認なしで先へ進む）。',
        gate: isWrite ? 'ask' : 'auto' },
      { key: 'execute', icon: '⚙️', title: 'Execute Tool', kind: 'infra',
        text: '承認済みのツールを実行する。' + (isWrite ? '（ファイル編集・コマンド実行など）' : '（ファイル読取・検索など）') },
      { key: 'observe', icon: '👀', title: 'Observe', kind: 'infra',
        text: 'ツールの結果（観測）を構造化し、次ループのコンテキストへ戻す。' },
      { key: 'commit', icon: '💾', title: 'Commit State', kind: 'infra',
        text: 'ターンの状態を確定（必要ならチェックポイント）。→ 先頭へ戻ってループ、またはゴール達成で終了。' }
    ];
  }

  /* =====================================================================
   * SESSION DATA — turns -> messages -> checkpoints
   * ===================================================================== */
  var SESSION = [
    { turn: 1, checkpoint: 'cp-1', messages: [
      { role: 'user', text: '認証バグを調べて修正して' },
      { role: 'assistant', text: '関連ファイルを探索します（read-only ツール → 自動承認）。' },
      { role: 'tool', text: 'Grep "login" → 3 件ヒット' }
    ] },
    { turn: 2, checkpoint: 'cp-2', messages: [
      { role: 'assistant', text: 'auth.js の比較演算子の誤りを特定。修正を提案します。' },
      { role: 'assistant', text: 'Edit auth.js（書き込み系 → 確認を要求）' },
      { role: 'user', text: '承認' },
      { role: 'tool', text: 'Edit 適用済み（cp-2 を作成）' }
    ] },
    { turn: 3, checkpoint: 'cp-3', messages: [
      { role: 'assistant', text: 'テストを実行して検証します（exec → 確認を要求）。' },
      { role: 'tool', text: 'npm test → 全 12 件成功 ✓' },
      { role: 'assistant', text: '修正完了。テストは緑です。' }
    ] }
  ];
  var ROLE_LABEL = { user: 'user', assistant: 'assistant', tool: 'tool' };

  /* =====================================================================
   * TOOL DATA — tool categories x permission mode
   * ===================================================================== */
  var TOOLS = [
    { cat: 'read', label: '読み取り (read)', ex: 'Read / view file', mode: 'auto',
      why: '副作用がなく安全。デフォルトで自動承認されうる。' },
    { cat: 'search', label: '検索 (search)', ex: 'Grep / Glob', mode: 'auto',
      why: '読み取りのみで状態を変えないため自動承認されうる。' },
    { cat: 'edit', label: '編集 (edit)', ex: 'Edit / Write file', mode: 'confirm',
      why: 'ファイルを変更するため、原則ユーザー確認が必要。' },
    { cat: 'exec', label: '実行 (exec)', ex: 'Bash / run command', mode: 'confirm',
      why: '任意コマンドの実行は影響が大きいため確認が必要。' },
    { cat: 'subagent', label: 'サブエージェント (subagent)', ex: 'Task / spawn agent', mode: 'confirm',
      why: '隔離コンテキストで別エージェントを起動。内部のツールも各々ゲートを通る。' }
  ];

  /* =====================================================================
   * MEMORY DATA — context-window composition + compaction
   * conceptual token shares (approx., for illustration only)
   * ===================================================================== */
  var CTX_BEFORE = [
    { key: 'system', label: 'システムプロンプト', pct: 10 },
    { key: 'tools', label: 'ツール定義', pct: 15 },
    { key: 'history', label: '会話履歴', pct: 62 },
    { key: 'current', label: '現在のターン', pct: 13 }
  ];
  var CTX_AFTER = [
    { key: 'system', label: 'システムプロンプト', pct: 10 },
    { key: 'tools', label: 'ツール定義', pct: 15 },
    { key: 'summary', label: '要約（旧履歴を圧縮）', pct: 18 },
    { key: 'history', label: '直近の履歴', pct: 30 },
    { key: 'current', label: '現在のターン', pct: 13 },
    { key: 'free', label: '確保された空き', pct: 14 }
  ];
  function stackBar(parts) {
    return '<div class="cc-stack">' + parts.map(function (p) {
      return '<div class="cc-stack__seg cc-seg--' + p.key + '" style="width:' + p.pct + '%" title="' +
        C.esc(p.label + ' ≈ ' + p.pct + '%') + '"><span class="cc-stack__lbl">' + C.esc(p.label) + ' ' + p.pct + '%</span></div>';
    }).join('') + '</div>';
  }

  /* =====================================================================
   * MINI HARNESS — runnable in-browser port of examples/minimal_claude_code.py
   * ===================================================================== */
  var H = NSCode.harness;
  var hs = null;          // current harness session
  var pyCache = null;     // fetched Python reference source

  /* =====================================================================
   * RENDER — one string for the whole page (no tabs).
   * Section IDs are unique across the merged page (cc* + h*).
   * ===================================================================== */
  function render() {
    return C.PageHeader({
      title: 'Claude Code Explorer',
      purpose: 'Claude Code の仕組みを1ページで学ぶ（アーキテクチャ → 実行 → セッション → ツール → メモリ → ミニ・ハーネス）',
      breadcrumb: ['Claude Code Explorer']
    }) +

    /* (a) ARCHITECTURE ------------------------------------------------- */
    C.Panel({ title: '① Architecture — 主要システムと AI/インフラ比', hint: '公開分析による概数', body:
      '<div class="cc-split">' +
        '<div class="ns-metric">' +
          '<div class="ns-metric__row"><span>AI 判断ロジック</span><span>≈ ' + AI_PCT + '%</span></div>' +
          '<div class="ns-progress cc-split__bar"><div class="ns-progress__fill cc-split__fill--ai" style="width:' + AI_PCT + '%"></div></div>' +
        '</div>' +
        '<div class="ns-metric">' +
          '<div class="ns-metric__row"><span>決定論的インフラ</span><span>≈ ' + INFRA_PCT + '%</span></div>' +
          '<div class="ns-progress cc-split__bar"><div class="ns-progress__fill cc-split__fill--infra" style="width:' + INFRA_PCT + '%"></div></div>' +
        '</div>' +
      '</div>' +
      '<p class="ns-empty__hint">Claude Code の大部分（権限ゲート・コンテキスト管理・ツールルーティング・回復処理など）は決定論的インフラで、AIの判断ロジックはごく一部、という公開分析の見立て。数値は概数（公開分析・approx.）であり正確な内部仕様ではありません。</p>' +
      '<div class="cc-arch-grid"><h4 class="cc-detail__title">主要システム（クリックで詳細）</h4>' +
        '<p class="ns-empty__hint">青=AI判断 / グレー=決定論的インフラ</p>' +
        '<div id="ccSysGrid"></div></div>' +
      '<div id="ccSysDetail"></div>' }) +

    /* (b) EXECUTION ---------------------------------------------------- */
    C.Panel({ title: '② Execution — エージェントの while ループ', hint: DISCLAIMER, body:
      '<div class="ns-actions">' +
        '<button id="ccNext" class="ns-btn">次へ ▶</button>' +
        '<button id="ccReset" class="ns-btn ns-btn--ghost">最初から</button>' +
        '<label class="ns-control ns-control--inline"><span>ツール種別の切替</span>' +
          '<button id="ccToggle" type="button" class="ns-btn ns-btn--ghost"></button></label>' +
      '</div>' +
      '<p class="ns-empty__hint">Claude Code の中核は「コンテキスト構築 → モデル呼出 → ツール要求の振り分け → 権限ゲート → 実行 → 観測 → 状態確定」を繰り返す while ループ（フィードバック制御）。タイプ切替で権限ゲートの結果が変わります。</p>' +
      '<div id="ccExecSummary"></div>' +
      '<div id="ccExecSteps"></div>' }) +

    /* (c) SESSION ------------------------------------------------------ */
    C.Panel({ title: '③ Session — ターン → メッセージ → チェックポイント', hint: DISCLAIMER, body:
      '<p class="ns-empty__hint">セッションは複数の「ターン」から成り、各ターンは user / assistant / tool のメッセージを含みます。ターン境界で状態を確定し、チェックポイント（スナップショット）を作成します。任意のチェックポイントへ「復元」すると、その時点の会話・ファイル状態へ巻き戻せます。</p>' +
      '<div class="ns-actions"><button id="ccRestore" class="ns-btn ns-btn--ghost"></button></div>' +
      '<div id="ccRestoreNote"></div>' +
      '<div id="ccSession"></div>' }) +

    /* (d) TOOL --------------------------------------------------------- */
    C.Panel({ title: '④ Tool — カテゴリ × 権限モード', hint: DISCLAIMER, body:
      '<p class="ns-empty__hint">すべてのツール要求は、エージェントループとツール実行の「間」にある権限ゲートを通過します。読み取り専用は自動承認されうる一方、書き込み・実行・サブエージェントは原則ユーザー確認が必要です（権限モードにより挙動は変わります）。</p>' +
      toolTable() }) +

    /* (e) MEMORY ------------------------------------------------------- */
    C.Panel({ title: '⑤ Memory — コンテキスト構成とコンパクション', hint: DISCLAIMER, body:
      '<p class="ns-empty__hint">毎ループの先頭で、システムプロンプト / ツール定義 / 会話履歴 / 現在のターン を1つのコンテキストへ組み立てます（割合は説明用の概数）。</p>' +
      stackBar(CTX_BEFORE) +
      '<div class="ns-actions"><button id="ccCompact" class="ns-btn"></button></div>' +
      '<div id="ccCompactState"></div>' }) +

    /* (f) MINI HARNESS ------------------------------------------------- */
    C.Panel({ title: '⑥ Mini Harness — examples/minimal_claude_code.py を実行', hint: 'ループは本物・テスト実行はシミュレーション（実Python不要）', body:
      C.Controls([
        { label: '権限モード', control: '<select id="hMode" class="ns-input">' +
          harnessModeOpt('auto', 'auto（安全な操作は自動許可）') +
          harnessModeOpt('dontAsk', 'dontAsk（hard deny以外は許可）') +
          harnessModeOpt('default', 'default（毎回確認）') + '</select>' }
      ]) +
      '<div class="ns-actions">' +
        '<button id="hStep" class="ns-btn">ステップ実行</button>' +
        '<button id="hRun" class="ns-btn ns-btn--ghost">最後まで実行</button>' +
        '<button id="hReset" class="ns-btn ns-btn--ghost">リセット</button>' +
      '</div><div id="hPending"></div>' +
      '<div class="ns-grid" style="--cols:2">' +
        C.Panel({ title: 'ループ（turns）', hint: 'mockLLM → 権限ゲート → tool → tool_result', body: '<div id="hLog"></div>' }) +
        C.Panel({ title: 'ワークスペース（in-memory FS）', body: '<div id="hFs"></div>' }) +
      '</div>' +
      C.Panel({ title: 'コンテキスト（次のLLMに渡る visible 履歴）', hint: '古い履歴は compact_summary に圧縮', body: '<div id="hCtx"></div>' }) +
      C.Panel({ title: 'Python 参照ソース（examples/minimal_claude_code.py）',
        body: '<div class="ns-actions"><button id="hDl" class="ns-btn ns-btn--ghost">ダウンロード</button></div><pre id="hPy" class="ns-code">読み込み中…</pre>' }) });
  }

  function harnessModeOpt(v, l) {
    return '<option value="' + v + '"' + (state.harnessMode === v ? ' selected' : '') + '>' + l + '</option>';
  }

  function toolTable() {
    var rows = TOOLS.map(function (t) {
      var badge = t.mode === 'auto'
        ? '<span class="cc-gate cc-gate--auto">自動承認</span>'
        : '<span class="cc-gate cc-gate--ask">確認を要求</span>';
      return '<tr>' +
        '<td><b>' + C.esc(t.label) + '</b></td>' +
        '<td>' + C.esc(t.ex) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td class="cc-why">' + C.esc(t.why) + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="ns-table-wrap"><table class="ns-table"><thead>' +
      '<tr><th>カテゴリ</th><th>例</th><th>権限モード</th><th>理由</th></tr>' +
      '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* =====================================================================
   * ON MOUNT — all DOM wiring for every section.
   * ===================================================================== */
  function onMount() {
    mountArchitecture();
    mountExecution();
    mountSession();
    mountMemory();
    mountHarness();
  }

  /* ---- (a) Architecture ---- */
  function mountArchitecture() {
    function renderGrid() {
      var grid = el('ccSysGrid'); if (!grid) return;
      grid.innerHTML = '<div class="ns-grid" style="--cols:3">' + SYSTEMS.map(function (s) {
        var active = s.id === state.selectedSystem ? ' is-active' : '';
        return '<button type="button" class="cc-sys cc-sys--' + s.tag + active + '" data-sys="' + C.esc(s.id) + '">' +
          '<span class="cc-sys__tag">' + (s.tag === 'ai' ? 'AI' : 'infra') + '</span>' +
          '<span class="cc-sys__name">' + C.esc(s.id) + '</span>' +
        '</button>';
      }).join('') + '</div>';
      var btns = grid.querySelectorAll('.cc-sys');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          state.selectedSystem = this.getAttribute('data-sys'); persist();
          renderGrid(); renderDetail();
        });
      }
    }
    function renderDetail() {
      var out = el('ccSysDetail'); if (!out) return;
      var s = findSystem(state.selectedSystem);
      out.innerHTML =
        '<div class="cc-detail">' +
          '<div class="cc-detail__head">' +
            '<span class="ns-tag">' + (s.tag === 'ai' ? 'AI判断ロジック' : '決定論的インフラ') + '</span>' +
            '<h4 class="cc-detail__title">' + C.esc(s.id) + '</h4>' +
          '</div>' +
          '<p class="cc-detail__body">' + C.esc(s.desc) + '</p>' +
        '</div>';
    }
    renderGrid(); renderDetail();
  }

  /* ---- (b) Execution ---- */
  function mountExecution() {
    function steps() { return execSteps(state.execToolType); }
    function clamp() {
      var n = steps().length;
      if (state.execStep < 0) state.execStep = 0;
      if (state.execStep > n) state.execStep = n; // n == fully done
    }
    function renderToggle() {
      var b = el('ccToggle'); if (!b) return;
      b.textContent = state.execToolType === 'write' ? '書き込み系' : '読み取り専用';
    }
    function renderSummary() {
      var sum = el('ccExecSummary'); if (!sum) return;
      var n = steps().length;
      var shown = Math.min(state.execStep, n);
      var done = state.execStep >= n;
      sum.innerHTML = '<div class="ns-grid" style="--cols:3">' +
        C.Metric({ label: 'ステップ', value: shown + ' / ' + n }) +
        C.Metric({ label: 'ツール種別', value: state.execToolType === 'write' ? '書き込み系' : '読み取り専用' }) +
        C.Metric({ label: '状態', value: done ? '1周完了 ↺' : '実行中' }) +
      '</div>';
    }
    function renderSteps() {
      var out = el('ccExecSteps'); if (!out) return;
      var list = steps();
      out.innerHTML = '<div class="cc-flow">' + list.map(function (s, i) {
        var on = i < state.execStep;
        var current = i === state.execStep - 1;
        var cls = 'cc-flowcard cc-flowcard--' + s.kind +
          (on ? ' is-on' : ' is-off') + (current ? ' is-current' : '');
        var gate = '';
        if (s.gate) {
          gate = '<span class="cc-gate cc-gate--' + s.gate + '">' +
            (s.gate === 'auto' ? '自動承認' : '確認を要求') + '</span>';
        }
        return '<div class="' + cls + '">' +
          '<div class="cc-flowcard__head">' +
            '<span class="cc-flowcard__icon">' + s.icon + '</span>' +
            '<span class="cc-flowcard__title">' + C.esc(s.title) + '</span>' +
            '<span class="ns-tag">' + (s.kind === 'ai' ? 'AI' : 'infra') + '</span>' +
            gate +
          '</div>' +
          '<p class="cc-flowcard__text">' + C.esc(s.text) + '</p>' +
        '</div>';
      }).join('') +
        '<div class="cc-flow__loop' + (state.execStep >= list.length ? ' is-on' : '') + '">↺ 先頭の Build Context へ戻る（または応答を返して終了）</div>' +
      '</div>';
    }
    function renderAll() { clamp(); renderToggle(); renderSummary(); renderSteps(); }

    el('ccNext').addEventListener('click', function () {
      var n = steps().length;
      state.execStep = state.execStep >= n ? 0 : state.execStep + 1;
      persist(); renderAll();
    });
    el('ccReset').addEventListener('click', function () {
      state.execStep = 0; persist(); renderAll();
    });
    el('ccToggle').addEventListener('click', function () {
      state.execToolType = state.execToolType === 'write' ? 'read' : 'write';
      // re-run from the gate so the changed outcome is visible
      persist(); renderAll();
    });
    renderAll();
  }

  /* ---- (c) Session ---- */
  function mountSession() {
    function renderRestore() {
      var b = el('ccRestore'), note = el('ccRestoreNote');
      if (b) b.textContent = state.restored ? 'cp-1 から再開中 — 最新へ戻す' : 'cp-1 へ復元する';
      if (note) note.innerHTML = state.restored
        ? '<div class="cc-restore-note">復元: <b>cp-1</b> へ巻き戻した状態（ターン2以降は破棄された、という概念図）。</div>'
        : '';
    }
    function renderSession() {
      var out = el('ccSession'); if (!out) return;
      var maxTurn = state.restored ? 1 : SESSION.length;
      out.innerHTML = '<div class="cc-turns">' + SESSION.map(function (t) {
        var dropped = t.turn > maxTurn;
        var open = t.turn === state.openTurn && !dropped;
        return '<div class="cc-turn' + (dropped ? ' is-dropped' : '') + (open ? ' is-open' : '') + '">' +
          '<button type="button" class="cc-turn__head" data-turn="' + t.turn + '"' + (dropped ? ' disabled' : '') + '>' +
            '<span class="cc-turn__no">Turn ' + t.turn + '</span>' +
            '<span class="ns-tag">' + C.esc(t.checkpoint) + '</span>' +
            '<span class="cc-turn__meta">' + t.messages.length + ' messages</span>' +
            '<span class="cc-turn__chev">' + (open ? '▾' : '▸') + '</span>' +
          '</button>' +
          (open ? '<div class="cc-turn__body">' + t.messages.map(function (m) {
            return '<div class="cc-msg cc-msg--' + m.role + '">' +
              '<span class="cc-msg__role">' + ROLE_LABEL[m.role] + '</span>' +
              '<span class="cc-msg__text">' + C.esc(m.text) + '</span>' +
            '</div>';
          }).join('') + '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
      var heads = out.querySelectorAll('.cc-turn__head');
      for (var i = 0; i < heads.length; i++) {
        heads[i].addEventListener('click', function () {
          var t = +this.getAttribute('data-turn');
          state.openTurn = state.openTurn === t ? 0 : t;
          persist(); renderSession();
        });
      }
    }
    el('ccRestore').addEventListener('click', function () {
      state.restored = !state.restored;
      if (state.restored && state.openTurn > 1) state.openTurn = 1;
      persist(); renderRestore(); renderSession();
    });
    renderRestore(); renderSession();
  }

  /* ---- (e) Memory ---- */
  function mountMemory() {
    function renderCompact() {
      var btn = el('ccCompact'), out = el('ccCompactState');
      if (btn) btn.textContent = state.compacted ? '元の状態に戻す' : 'コンパクションを実行 ▶';
      if (!out) return;
      if (!state.compacted) {
        out.innerHTML = '<p class="cc-step-note">⚠ 会話履歴が膨らみ、空き容量が逼迫している状態（圧縮前）。</p>' +
          stackBar(CTX_BEFORE);
      } else {
        out.innerHTML = '<p class="cc-step-note is-ok">✓ 古いターンを要約に置き換え、直近の履歴と空きを確保した状態（圧縮後）。</p>' +
          stackBar(CTX_AFTER) +
          '<p class="ns-empty__hint">古い会話は失われるのではなく「要約」として保持され、必要な情報を残しつつトークンを節約します。割合は説明用の概数です。</p>';
      }
    }
    el('ccCompact').addEventListener('click', function () {
      state.compacted = !state.compacted; persist(); renderCompact();
    });
    renderCompact();
  }

  /* ---- (f) Mini Harness ---- */
  function mountHarness() {
    if (!hs) { hs = H.createSession({ mode: state.harnessMode || 'auto' }); H.record(hs, { type: 'user_prompt', content: hs.prompt }); }
    el('hMode').addEventListener('change', function () {
      state.harnessMode = el('hMode').value; persist();
      hs = H.createSession({ mode: state.harnessMode }); H.record(hs, { type: 'user_prompt', content: hs.prompt });
      renderHarness();
    });
    el('hStep').addEventListener('click', function () { stepHarness(); });
    el('hRun').addEventListener('click', function () {
      var guard = 0;
      while (!hs.done && !hs.pending && guard++ < 30) { stepHarness(true); }
      renderHarness();
    });
    el('hReset').addEventListener('click', function () {
      hs = H.createSession({ mode: state.harnessMode || 'auto' }); H.record(hs, { type: 'user_prompt', content: hs.prompt });
      renderHarness();
    });
    loadPython();
    renderHarness();
  }

  function stepHarness(quiet) {
    if (hs.done || hs.pending) { if (!quiet) renderHarness(); return; }
    var a = H.propose(hs);
    if (a.type === 'finish') { hs.done = true; hs.finished = a.summary; if (!quiet) renderHarness(); return; }
    var d = H.decide(hs, a);
    H.record(hs, { type: 'permission', action_id: a.id, decision: d[0], reason: d[1] });
    if (d[0] === 'ask') { hs.pending = a; if (!quiet) renderHarness(); return; }
    if (d[0] === 'allow') H.execute(hs, a);
    else H.record(hs, { type: 'tool_result', action_id: a.id, tool: a.tool, result: { ok: false, error: d[1] } });
    if (!quiet) renderHarness();
  }

  function resolvePending(allow) {
    var a = hs.pending; hs.pending = null;
    H.record(hs, { type: 'permission', action_id: a.id, decision: allow ? 'allow' : 'deny', reason: allow ? 'approved by user' : 'rejected by user' });
    if (allow) H.execute(hs, a);
    else H.record(hs, { type: 'tool_result', action_id: a.id, tool: a.tool, result: { ok: false, error: 'rejected by user' } });
    renderHarness();
  }

  function permBadge(d) {
    var cls = d === 'allow' ? 'is-ok' : (d === 'deny' ? 'is-bad' : '');
    return '<span class="cc-perm ' + cls + '">' + d + '</span>';
  }

  function renderHarness() {
    var log = el('hLog'); if (!log) return;
    // build per-turn cards from events
    var evs = hs.events, html = '', i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'llm_reply') {
        var a = e.action;
        html += '<div class="cc-turn"><div class="cc-turn__head"><span class="ns-tag">turn ' + e.turn + '</span>' +
          '<b>' + C.esc(a.tool) + '</b>' + (a.type === 'finish' ? ' <span class="cc-perm is-ok">finish</span>' : '') + '</div>' +
          '<p class="cc-turn__think">💭 ' + C.esc(a.thought) + '</p>';
      } else if (e.type === 'permission') {
        html += '<p class="cc-turn__perm">permission: ' + permBadge(e.decision) + ' <span class="ns-empty__hint">' + C.esc(e.reason) + '</span></p>';
      } else if (e.type === 'tool_result') {
        var r = e.result, out = r.stdout || r.stderr || (r.files ? r.files.join('\n') : '') || r.content || (r.error || '');
        html += '<pre class="cc-turn__out ' + (r.ok ? '' : 'is-bad') + '">' + C.esc((out || (r.ok ? 'ok' : 'failed')).slice(0, 700)) + '</pre></div>';
      }
    }
    if (hs.finished) html += '<div class="ns-qa-answer"><b>assistant:</b> ' + C.esc(hs.finished) + '</div>';
    log.innerHTML = html || C.EmptyState({ message: '「ステップ実行」または「最後まで実行」を押してください。' });

    // pending permission prompt (default mode)
    var pend = el('hPending');
    if (pend) {
      pend.innerHTML = hs.pending
        ? '<div class="ns-qa-answer">権限申請: <b>' + C.esc(hs.pending.tool) + '</b> — ' + C.esc(JSON.stringify(hs.pending.args)) +
          '<div class="ns-actions"><button id="hAllow" class="ns-btn">許可</button><button id="hDeny" class="ns-btn ns-btn--ghost">拒否</button></div></div>'
        : '';
      if (hs.pending) {
        el('hAllow').addEventListener('click', function () { resolvePending(true); });
        el('hDeny').addEventListener('click', function () { resolvePending(false); });
      }
    }

    // workspace FS
    var fsEl = el('hFs');
    if (fsEl) {
      fsEl.innerHTML = Object.keys(hs.fs).map(function (f) {
        var body = C.esc(hs.fs[f]).replace(/&quot;secret&quot;/g, '<mark>"secret"</mark>').replace(/&quot;wrong&quot;/g, '<mark>"wrong"</mark>');
        return '<div class="cc-file"><span class="ns-tag">' + C.esc(f) + '</span><pre class="ns-code">' + body + '</pre></div>';
      }).join('');
    }

    // context (visible)
    var ctxEl = el('hCtx');
    if (ctxEl) {
      var vis = H.contextVisible(hs);
      ctxEl.innerHTML = '<p class="ns-empty__hint">transcript 全 ' + hs.transcript.length + ' 件 / visible ' + vis.length + ' 件（keepLast=' + hs.keepLast + '）</p>' +
        '<div class="cc-ctx">' + vis.map(function (e) {
          if (e.type === 'compact_summary') return '<div class="cc-ctx__row cc-ctx__row--sum">🗜 ' + C.esc(e.content) + '</div>';
          var label = e.type === 'llm_reply' ? ('llm_reply: ' + e.action.tool) : e.type;
          return '<div class="cc-ctx__row">' + C.esc(label) + '</div>';
        }).join('') + '</div>';
    }
  }

  function loadPython() {
    var py = el('hPy'); if (!py) return;
    var apply = function (txt) { py.textContent = txt; el('hDl').onclick = function () { downloadText(txt, 'minimal_claude_code.py'); }; };
    if (pyCache) { apply(pyCache); return; }
    fetch('examples/minimal_claude_code.py').then(function (r) { return r.text(); })
      .then(function (t) { pyCache = t; apply(t); })
      .catch(function () { py.textContent = '(ソースの取得に失敗しました。リポジトリの examples/minimal_claude_code.py を参照してください)'; });
  }

  function downloadText(text, name) {
    var blob = new Blob([text], { type: 'text/x-python' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  /* =====================================================================
   * REGISTER — same render+onMount for the BASE route and every former
   * sub-route (now aliases of the single page).
   * ===================================================================== */
  var ROUTES = [
    '#/claude-code',
    '#/claude-code/architecture',
    '#/claude-code/execution',
    '#/claude-code/session',
    '#/claude-code/tool',
    '#/claude-code/memory',
    '#/claude-code/harness'
  ];
  for (var ri = 0; ri < ROUTES.length; ri++) {
    NSCode.registerView({
      route: ROUTES[ri], module: 'claude-code', title: 'Claude Code Explorer',
      render: render, onMount: onMount
    });
  }

})(window.NSCode);
