/* NSCode harness engine — a faithful in-browser port of examples/minimal_claude_code.py.
 * Same loop: mock LLM reply -> permission gate -> tool execution -> tool_result
 * -> transcript/context -> next reply. The filesystem is in-memory and the test
 * runner is SIMULATED (no real Python), so it runs offline in the browser.
 * The permission gate, transcript, and context-compaction logic mirror the Python. */
(function (NSCode) {
  'use strict';

  var DEMO_FILES = {
    'auth.py': 'def login(username, password):\n    return username == "admin" and password == "wrong"\n',
    'test_auth.py': 'import unittest\nfrom auth import login\n\nclass AuthTest(unittest.TestCase):\n    def test_admin_login(self):\n        self.assertTrue(login("admin", "secret"))\n\n    def test_wrong_password(self):\n        self.assertFalse(login("admin", "wrong"))\n\nif __name__ == "__main__":\n    unittest.main()\n'
  };

  // Mock LLM fixtures (mirror the Python MOCK_LLM_REPLIES).
  var MOCK = [
    { type: 'tool_use', thought: 'Inspect the workspace before acting.', tool: 'list_files', args: { glob: '**/*.py' } },
    { type: 'tool_use', thought: 'Run the tests to observe the failure.', tool: 'run_command', args: { argv: ['python', '-m', 'unittest', 'discover', '-v'] } },
    { type: 'tool_use', thought: 'Read the implementation file imported by the test.', tool: 'read_file', args: { path: 'auth.py' } },
    { type: 'tool_use', thought: 'Apply the minimal textual fix visible in auth.py.', tool: 'replace_in_file', args: { path: 'auth.py', old: '"wrong"', new: '"secret"' } },
    { type: 'tool_use', thought: 'Rerun tests after the edit.', tool: 'run_command', args: { argv: ['python', '-m', 'unittest', 'discover', '-v'] } },
    { type: 'finish', thought: 'The observed tests pass.', tool: 'none', args: {}, summary: 'Done. The mocked LLM replies led the harness to fix the demo test.' }
  ];

  var DANGER = { rm: 1, rmdir: 1, del: 1, erase: 1, format: 1, shutdown: 1, sudo: 1, curl: 1, wget: 1 };
  var KNOWN = { list_files: 1, read_file: 1, replace_in_file: 1, run_command: 1 };

  function uid(p) { return (p || '') + Math.random().toString(16).slice(2, 12); }

  function createSession(opts) {
    opts = opts || {};
    var fs = {}; for (var k in DEMO_FILES) fs[k] = DEMO_FILES[k];
    return {
      mode: opts.mode || 'auto',
      keepLast: opts.keepLast || 12,
      prompt: opts.prompt || 'Fix the failing Python test. Keep the change minimal.',
      fs: fs, i: 0, turn: 0, done: false, finished: null,
      events: [], transcript: []
    };
  }

  function record(s, ev) {
    ev = Object.assign({ time: new Date().toISOString() }, ev);
    s.events.push(ev); s.transcript.push(ev);
    return ev;
  }

  /* Context.visible() — keep last N, older folded into a compact summary. */
  function contextVisible(s) {
    if (s.events.length <= s.keepLast) return s.events.slice();
    var hidden = s.events.length - s.keepLast;
    return [{ type: 'compact_summary', content: hidden + ' earlier events summarized.' }]
      .concat(s.events.slice(-s.keepLast));
  }

  /* MockLLM.next_action */
  function propose(s) {
    var a = Object.assign({}, MOCK[Math.min(s.i, MOCK.length - 1)]);
    a.args = Object.assign({}, a.args);
    a.id = uid('act_');
    a.context_events_seen = contextVisible(s).length;
    s.i += 1; s.turn += 1;
    record(s, { type: 'llm_reply', turn: s.turn, action: a });
    return a;
  }

  /* PermissionGate */
  function hardDeny(action) {
    if (action.type !== 'tool_use') return null;
    var tool = action.tool, args = action.args || {};
    if (!KNOWN[tool]) return 'unknown tool: ' + tool;
    if (tool === 'read_file' || tool === 'replace_in_file') {
      var p = String(args.path || '');
      if (p.indexOf('..') >= 0 || p.charAt(0) === '/' || p.charAt(0) === '\\') return 'path is outside workspace';
    }
    if (tool === 'run_command') {
      var argv = args.argv;
      if (!Array.isArray(argv) || !argv.length) return 'argv must be a non-empty list';
      var exe = String(argv[0]).split(/[\\/]/).pop().toLowerCase();
      if (DANGER[exe]) return 'dangerous command denied: ' + exe;
    }
    return null;
  }
  function autoAllow(action) {
    var tool = action.tool;
    if (tool === 'list_files' || tool === 'read_file' || tool === 'replace_in_file') return ['allow', 'auto: local file action'];
    var argv = ((action.args || {}).argv || []).map(function (x) { return String(x).toLowerCase(); }).join(' ');
    if (tool === 'run_command' && /pytest|unittest|python|py/.test(argv)) return ['allow', 'auto: python/test command'];
    return ['ask', 'auto is unsure'];
  }
  function decide(s, action) {
    var denied = hardDeny(action);
    if (denied) return ['deny', denied];
    if (s.mode === 'auto') return autoAllow(action);
    if (s.mode === 'dontAsk') return ['allow', 'dontAsk mode, hard denies still apply'];
    return ['ask', 'default mode requires confirmation']; // 'default' -> user decides
  }

  /* Tools (in-memory; run_command is simulated) */
  function execute(s, action) {
    var tool = action.tool, args = action.args || {};
    var result;
    if (tool === 'list_files') {
      result = { ok: true, files: Object.keys(s.fs).filter(function (f) { return /\.py$/.test(f); }).sort() };
    } else if (tool === 'read_file') {
      result = (args.path in s.fs)
        ? { ok: true, path: args.path, content: s.fs[args.path] }
        : { ok: false, error: 'no such file', path: args.path };
    } else if (tool === 'replace_in_file') {
      var t = s.fs[args.path];
      if (t == null) result = { ok: false, error: 'no such file', path: args.path };
      else if (t.indexOf(args.old) < 0) result = { ok: false, error: 'old text not found', path: args.path };
      else { s.fs[args.path] = t.replace(args.old, args.new); result = { ok: true, path: args.path, changed: true }; }
    } else if (tool === 'run_command') {
      result = simulateTests(s);
    } else {
      result = { ok: false, error: 'tool not implemented: ' + tool };
    }
    record(s, { type: 'tool_result', action_id: action.id, tool: tool, result: result });
    return result;
  }

  // Simulate `python -m unittest`: pass iff login compares password to "secret".
  function simulateTests(s) {
    var src = s.fs['auth.py'] || '';
    var pass = /password\s*==\s*"secret"/.test(src) || src.indexOf('"secret"') >= 0 && src.indexOf('"wrong"') < 0;
    if (pass) {
      return { ok: true, returncode: 0,
        stdout: 'test_admin_login (test_auth.AuthTest.test_admin_login) ... ok\n' +
                'test_wrong_password (test_auth.AuthTest.test_wrong_password) ... ok\n\n' +
                '----------------------------------------------------------------------\n' +
                'Ran 2 tests in 0.000s\n\nOK\n', stderr: '' };
    }
    return { ok: false, returncode: 1,
      stdout: '', stderr:
        'FAIL: test_admin_login (test_auth.AuthTest.test_admin_login)\n' +
        'AssertionError: False is not true\n\n' +
        '----------------------------------------------------------------------\n' +
        'Ran 2 tests in 0.001s\n\nFAILED (failures=1)\n' };
  }

  function reset(s) {
    var fresh = createSession({ mode: s.mode, keepLast: s.keepLast, prompt: s.prompt });
    for (var k in fresh) s[k] = fresh[k];
    record(s, { type: 'user_prompt', content: s.prompt });
    return s;
  }

  NSCode.harness = {
    DEMO_FILES: DEMO_FILES, MOCK: MOCK,
    createSession: createSession, reset: reset,
    propose: propose, decide: decide, execute: execute,
    contextVisible: contextVisible, record: record
  };
})(window.NSCode);
