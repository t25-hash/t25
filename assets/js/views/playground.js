/* Playground (PLAY) — 自由実験 */
(function (NSCode) {
  'use strict';
  var C = NSCode.C;
  var tabs = [
    { id: 'llm', label: 'LLM Playground', route: '#/playground/llm' },
    { id: 'prompt', label: 'Prompt Playground', route: '#/playground/prompt' }
  ];
  var sel = '<select class="ns-input"><option>claude-opus-4-8</option><option>claude-sonnet-4-6</option><option>claude-haiku-4-5</option></select>';
  var slider = '<input class="ns-range" type="range" min="0" max="1" step="0.1" value="0.7">';

  NSCode.registerLab({
    module: 'playground', title: 'Playground', purpose: '自由実験', tabs: tabs,
    screens: {
      '#/playground/llm': { title: 'LLM Playground', purpose: 'モデル・パラメータを変えて比較実行', panels: [
        { title: '設定', body: C.Controls([
            { label: 'Model', control: sel },
            { label: 'Temperature', control: slider },
            { label: 'System Prompt', control: '<textarea class="ns-input" rows="2" placeholder="System prompt..."></textarea>' }
          ]) },
        { title: 'Prompt', body: '<textarea class="ns-input" rows="4" placeholder="ここにプロンプトを入力..."></textarea><div class="ns-actions"><button class="ns-btn">実行</button><button class="ns-btn ns-btn--ghost">比較実行</button></div>' },
        { title: '出力', empty: 'backend 未接続のため応答は表示されません（雛形）。' }
      ] },
      '#/playground/prompt': { title: 'Prompt Playground', purpose: 'プロンプトの比較・評価・改善', panels: [
        { title: 'Prompt 比較', empty: '2つ以上のプロンプトを並べて比較します。' },
        { title: 'Prompt 評価', empty: '明確さ・具体性・制約などをスコア化。' },
        { title: 'Prompt 改善', empty: '改善提案を生成して差分表示。' }
      ] }
    }
  });
})(window.NSCode);
