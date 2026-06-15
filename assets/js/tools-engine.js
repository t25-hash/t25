/* NSCode Tool Calling engine — offline, deterministic mock tool registry.
 * No backend / no LLM. Tool outputs are fabricated but stable: latency and
 * generated content are derived from a hash of the args, so the same input
 * always yields the same result. Tool selection ranks tools by lexical keyword
 * overlap between the goal and each tool's name/description/category.
 * All results are simulated — the UI labels them as such. */
(function (NSCode) {
  'use strict';

  /* ---------- deterministic helpers ---------- */
  function hash(str) {
    var h = 2166136261; // FNV-1a 32bit
    str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0);
  }
  function latencyFor(seed) {
    // 40–520ms, deterministic per seed
    return 40 + (hash('lat:' + seed) % 481);
  }
  function terms(text) {
    var out = [];
    var latin = String(text).toLowerCase().match(/[a-z][a-z0-9_\-]{1,}/g) || [];
    for (var i = 0; i < latin.length; i++) out.push(latin[i]);
    var cjk = String(text).match(/[぀-ヿ一-鿿ｦ-ﾟ]/g) || [];
    for (var j = 0; j < cjk.length - 1; j++) out.push(cjk[j] + cjk[j + 1]);
    return out;
  }
  function argString(args) {
    args = args || {};
    var keys = [];
    for (var k in args) { if (args.hasOwnProperty(k)) keys.push(k); }
    keys.sort();
    return keys.map(function (k) { return k + '=' + args[k]; }).join('&');
  }

  /* ---------- tool registry ---------- */
  var TOOLS = [
    {
      name: 'Search', icon: '🔎', category: 'read',
      description: 'キーワードでコードベースや文書を全文検索し、関連スニペットをランキングして返す。grep / find / lookup query。',
      keywords: 'search find grep lookup query 検索 探す 一覧 list 全文 keyword スニペット',
      params: [
        { name: 'query', type: 'text', placeholder: 'TODO' },
        { name: 'path', type: 'text', placeholder: 'src/' }
      ],
      execute: function (args) {
        var q = (args.query || '').trim() || 'TODO';
        var path = (args.path || '.').trim() || '.';
        var seed = 'Search|' + argString(args);
        var n = 3 + (hash(seed) % 3); // 3–5 hits
        var files = ['app.js', 'utils/format.ts', 'views/home.jsx', 'lib/parser.py', 'README.md', 'config/index.json'];
        var lines = [];
        var steps = [
          'インデックスを参照: ' + path,
          'クエリ "' + q + '" をトークン化',
          n + ' 件の候補をスコアリング',
          '関連度順に並べ替え'
        ];
        for (var i = 0; i < n; i++) {
          var f = files[hash(seed + ':' + i) % files.length];
          var ln = 1 + (hash(seed + 'L' + i) % 240);
          var score = (1 - i * 0.13 - (hash(seed + 'S' + i) % 7) / 100).toFixed(2);
          lines.push('[' + score + '] ' + path.replace(/\/$/, '') + '/' + f + ':' + ln + ' — // ' + q + ' を含む行');
        }
        return {
          ok: true,
          latency_ms: latencyFor(seed),
          steps: steps,
          output: n + ' 件ヒット (query="' + q + '")\n' + lines.join('\n')
        };
      }
    },
    {
      name: 'ReadFile', icon: '📄', category: 'read',
      description: 'ファイルパスを指定して内容を読み取り、本文を返す。read open cat ファイル 読み込み。',
      keywords: 'read open cat file ファイル 読む 読み込み 内容 開く content view',
      params: [
        { name: 'path', type: 'text', placeholder: 'src/index.js' }
      ],
      execute: function (args) {
        var path = (args.path || 'src/index.js').trim() || 'src/index.js';
        var seed = 'ReadFile|' + argString(args);
        var totalLines = 8 + (hash(seed) % 20);
        var ext = (path.split('.').pop() || 'txt').toLowerCase();
        var body = [];
        var samples = {
          js: ['export function main() {', '  const cfg = loadConfig();', '  return run(cfg);', '}'],
          py: ['def main():', '    cfg = load_config()', '    return run(cfg)'],
          json: ['{', '  "name": "nscode",', '  "version": "1.0.0"', '}'],
          txt: ['# notes', 'line of plain text content', 'more content here']
        };
        var tpl = samples[ext] || samples.txt;
        for (var i = 0; i < tpl.length; i++) body.push((i + 1) + '  ' + tpl[i]);
        body.push('… (' + totalLines + ' 行)');
        return {
          ok: true,
          latency_ms: latencyFor(seed),
          steps: ['パス解決: ' + path, 'ファイル存在チェック (simulated)', totalLines + ' 行を読み込み', 'UTF-8 としてデコード'],
          output: '── ' + path + ' (' + ext + ', ' + totalLines + ' lines) ──\n' + body.join('\n')
        };
      }
    },
    {
      name: 'WriteFile', icon: '✏️', category: 'write',
      description: 'ファイルパスに内容を書き込み・保存する。write save edit create 上書き 作成 保存。',
      keywords: 'write save edit create update 書き込み 保存 作成 上書き 変更 出力 file',
      params: [
        { name: 'path', type: 'text', placeholder: 'notes/todo.md' },
        { name: 'content', type: 'text', placeholder: '- [ ] 例: タスク' }
      ],
      execute: function (args) {
        var path = (args.path || 'output.txt').trim() || 'output.txt';
        var content = args.content == null ? '' : String(args.content);
        var seed = 'WriteFile|' + argString(args);
        var bytes = content.length + (hash(seed) % 8);
        return {
          ok: true,
          latency_ms: latencyFor(seed),
          steps: ['親ディレクトリ確認 (simulated)', content.length + ' 文字をエンコード', path + ' へ書き込み', 'fsync (simulated)'],
          output: '✓ wrote ' + bytes + ' bytes to ' + path + '\n--- preview ---\n' + (content.slice(0, 200) || '(empty)')
        };
      }
    },
    {
      name: 'Terminal', icon: '💻', category: 'exec',
      description: 'シェルコマンドを実行し標準出力を返す。run exec shell bash command コマンド 実行。',
      keywords: 'run exec shell bash command terminal コマンド 実行 build test ビルド npm git',
      params: [
        { name: 'command', type: 'text', placeholder: 'npm test' }
      ],
      execute: function (args) {
        var cmd = (args.command || 'echo hello').trim() || 'echo hello';
        var seed = 'Terminal|' + argString(args);
        var exit = (hash(seed) % 10 === 0) ? 1 : 0; // ~10% fail
        var out;
        if (/^npm test|^pytest|^jest/.test(cmd)) {
          var pass = 1 + (hash(seed) % 30), fail = exit ? 1 + (hash(seed) % 3) : 0;
          out = 'Tests: ' + pass + ' passed' + (fail ? ', ' + fail + ' failed' : '') + ', ' + (pass + fail) + ' total';
        } else if (/^git /.test(cmd)) {
          out = 'On branch main\nnothing to commit, working tree clean';
        } else if (/^ls/.test(cmd)) {
          out = 'app.js  package.json  README.md  src/  test/';
        } else {
          out = '$ ' + cmd + '\n(stdout, simulated)';
        }
        return {
          ok: exit === 0,
          latency_ms: latencyFor(seed),
          steps: ['サブシェル起動 (simulated)', '実行: ' + cmd, 'stdout を捕捉', 'exit code ' + exit],
          output: '$ ' + cmd + '\n' + out + '\n[exit ' + exit + ']'
        };
      }
    },
    {
      name: 'Browser', icon: '🌐', category: 'exec',
      description: 'URL を開きページを取得して本文テキストを抽出する。fetch open web page url ブラウザ 閲覧。',
      keywords: 'browser web fetch url open page http www site ブラウザ 閲覧 取得 ページ url',
      params: [
        { name: 'url', type: 'text', placeholder: 'https://example.com' }
      ],
      execute: function (args) {
        var url = (args.url || 'https://example.com').trim() || 'https://example.com';
        var seed = 'Browser|' + argString(args);
        var status = (hash(seed) % 12 === 0) ? 404 : 200;
        var ms = latencyFor(seed);
        var title = 'Example Page #' + (hash(seed) % 1000);
        var out = status === 200
          ? 'HTTP ' + status + ' OK · ' + url + '\n<title>' + title + '</title>\n本文抜粋: このページは ' + (200 + hash(seed) % 800) + ' 語のテキストを含みます (simulated)。'
          : 'HTTP ' + status + ' Not Found · ' + url;
        return {
          ok: status === 200,
          latency_ms: ms,
          steps: ['DNS 解決 (simulated)', 'GET ' + url, 'HTTP ' + status + ' を受信', 'DOM から本文を抽出'],
          output: out
        };
      }
    },
    {
      name: 'Database', icon: '🗄️', category: 'read',
      description: 'SQL クエリを実行してデータベースから行を取得する。sql select query db database テーブル データ。',
      keywords: 'database db sql select query table row data データ クエリ テーブル 取得 select join',
      params: [
        { name: 'sql', type: 'text', placeholder: 'SELECT * FROM users LIMIT 3' }
      ],
      execute: function (args) {
        var sql = (args.sql || 'SELECT * FROM users LIMIT 3').trim() || 'SELECT * FROM users LIMIT 3';
        var seed = 'Database|' + argString(args);
        var isWrite = /^\s*(insert|update|delete)/i.test(sql);
        var rows = 1 + (hash(seed) % 4);
        var out;
        if (isWrite) {
          out = 'OK · ' + rows + ' row(s) affected';
        } else {
          var names = ['Aki', 'Mei', 'Ren', 'Sora', 'Yua'];
          var lines = ['id | name | active'];
          for (var i = 0; i < rows; i++) {
            lines.push((i + 1) + '  | ' + names[hash(seed + i) % names.length] + '  | ' + (hash(seed + 'a' + i) % 2 ? 'true' : 'false'));
          }
          out = lines.join('\n') + '\n(' + rows + ' rows)';
        }
        return {
          ok: true,
          latency_ms: latencyFor(seed),
          steps: ['コネクション取得 (pool, simulated)', 'SQL を解析', 'クエリ実行', rows + ' 行を返却'],
          output: out
        };
      }
    }
  ];

  var BY_NAME = {};
  TOOLS.forEach(function (t) { BY_NAME[t.name] = t; });

  /* ---------- tool selection (lexical keyword overlap) ---------- */
  function selectTool(goal) {
    var gTerms = terms(goal);
    var gSet = {};
    gTerms.forEach(function (t) { gSet[t] = true; });

    var ranked = TOOLS.map(function (tool) {
      var pool = terms(tool.name + ' ' + tool.description + ' ' + tool.category + ' ' + (tool.keywords || ''));
      var seen = {}, matched = [];
      pool.forEach(function (t) {
        if (gSet[t] && !seen[t]) { seen[t] = true; matched.push(t); }
      });
      var denom = Math.max(1, Object.keys(gSet).length);
      var score = matched.length / denom; // 0..1 fraction of goal terms covered
      var reason;
      if (matched.length === 0) {
        reason = 'ゴールとの語彙的な重なりなし（カテゴリ: ' + tool.category + '）。';
      } else {
        reason = '一致キーワード ' + matched.length + ' 件: ' + matched.slice(0, 6).join(', ') +
          ' — ' + tool.category + ' 系ツールとして適合。';
      }
      return { tool: tool, score: score, matched: matched, reason: reason };
    });

    ranked.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.tool.name < b.tool.name ? -1 : 1; // deterministic tie-break
    });
    if (ranked.length && ranked[0].score > 0) ranked[0].chosen = true;
    return ranked;
  }

  NSCode.tools = {
    list: function () { return TOOLS.slice(); },
    get: function (name) { return BY_NAME[name] || null; },
    selectTool: selectTool,
    hash: hash
  };
})(window.NSCode);
