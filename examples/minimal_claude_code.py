#!/usr/bin/env python3
"""
Claude Codeの「ハーネス」を勉強するためのシンプルなコード。
LLM返答をあえてモックし、見やすくしています。

  モックLLM返答 -> 権限判定 -> tool実行 -> tool_result
  -> transcript/context -> 次のモックLLM返答

実行:
  py -3 minimal_claude_code.py
  py -3 minimal_claude_code.py --mode default
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def uid(prefix: str = "") -> str:
    return prefix + uuid.uuid4().hex[:10]


class Transcript:
    """会話・tool実行・権限判定をJSONLで保存。Claude Codeのsession transcriptのミニ版。"""

    def __init__(self, workdir: Path) -> None:
        self.path = workdir / ".mini_agent" / f"{uid()}.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, event: dict[str, Any]) -> None:
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"time": now(), **event}, ensure_ascii=False) + "\n")


class Context:
    """次のLLM返答に渡す履歴を管理。古い履歴はsummaryに置き換え。"""

    def __init__(self, keep_last: int) -> None:
        self.keep_last = keep_last
        self.events: list[dict[str, Any]] = []

    def add(self, event: dict[str, Any]) -> None:
        self.events.append(event)

    def visible(self) -> list[dict[str, Any]]:
        if len(self.events) <= self.keep_last:
            return list(self.events)
        hidden = len(self.events) - self.keep_last
        return [
            {"type": "compact_summary", "content": f"{hidden} earlier events summarized."},
            *self.events[-self.keep_last :],
        ]


class PermissionGate:
    """deny-firstの権限判定。LLMが申請し、harnessが実行可否を決定。"""

    def __init__(self, workdir: Path, mode: str) -> None:
        self.workdir = workdir.resolve()
        self.mode = mode
        self.danger = {"rm", "rmdir", "del", "erase", "format", "shutdown", "sudo", "curl", "wget"}

    def decide(self, action: dict[str, Any]) -> tuple[str, str]:
        denied = self.hard_deny(action)
        if denied:
            return "deny", denied
        if self.mode == "auto":
            return self.auto_allow(action)
        if self.mode == "dontAsk":
            return "allow", "dontAsk mode, hard denies still apply"
        return self.ask_user(action)

    def hard_deny(self, action: dict[str, Any]) -> str | None:
        if action.get("type") != "tool_use":
            return None
        tool = action.get("tool")
        args = action.get("args", {})
        if tool not in {"list_files", "read_file", "replace_in_file", "run_command"}:
            return f"unknown tool: {tool}"
        if tool in {"read_file", "replace_in_file"}:
            path = (self.workdir / str(args.get("path", ""))).resolve()
            if not self.inside(path):
                return "path is outside workspace"
        if tool == "run_command":
            argv = args.get("argv", [])
            if not isinstance(argv, list) or not argv:
                return "argv must be a non-empty list"
            exe = Path(str(argv[0])).name.lower()
            if exe in self.danger:
                return f"dangerous command denied: {exe}"
        return None

    def auto_allow(self, action: dict[str, Any]) -> tuple[str, str]:
        tool = action["tool"]
        if tool in {"list_files", "read_file", "replace_in_file"}:
            return "allow", "auto: local file action"
        argv = " ".join(str(x).lower() for x in action.get("args", {}).get("argv", []))
        if tool == "run_command" and any(x in argv for x in ["pytest", "unittest", "python", "py"]):
            return "allow", "auto: python/test command"
        return "ask", "auto is unsure"

    def ask_user(self, action: dict[str, Any]) -> tuple[str, str]:
        if not sys.stdin.isatty():
            return "deny", "cannot ask in non-interactive terminal"
        print("\nPermission request:")
        print(json.dumps(action, ensure_ascii=False, indent=2))
        ok = input("Allow? [y/N] ").strip().lower() == "y"
        return ("allow", "approved by user") if ok else ("deny", "rejected by user")

    def inside(self, path: Path) -> bool:
        try:
            path.relative_to(self.workdir)
            return True
        except ValueError:
            return False


class Tools:
    """LLMが直接触れない外界操作。harnessだけがここを呼び出せる。"""

    def __init__(self, workdir: Path) -> None:
        self.workdir = workdir.resolve()

    def run(self, action: dict[str, Any]) -> dict[str, Any]:
        """tool_use actionを具体的なPython関数にdispatchする。"""

        tool = action["tool"]
        args = action.get("args", {})
        if tool == "list_files":
            return self.list_files(args.get("glob", "**/*"))
        if tool == "read_file":
            return self.read_file(args["path"])
        if tool == "replace_in_file":
            return self.replace_in_file(args["path"], args["old"], args["new"])
        if tool == "run_command":
            return self.run_command(args["argv"])
        return {"ok": False, "error": f"tool not implemented: {tool}"}

    def list_files(self, glob: str) -> dict[str, Any]:
        files = []
        for p in self.workdir.glob(glob):
            if p.is_file() and ".mini_agent" not in p.parts:
                files.append(str(p.relative_to(self.workdir)))
        return {"ok": True, "files": sorted(files)[:200]}

    def read_file(self, path: str) -> dict[str, Any]:
        target = self.workdir / path
        text = target.read_text(encoding="utf-8")
        return {"ok": True, "path": path, "content": text[:12000]}

    def replace_in_file(self, path: str, old: str, new: str) -> dict[str, Any]:
        target = self.workdir / path
        text = target.read_text(encoding="utf-8")
        if old not in text:
            return {"ok": False, "error": "old text not found", "path": path}
        target.write_text(text.replace(old, new, 1), encoding="utf-8")
        return {"ok": True, "path": path, "changed": True}

    def run_command(self, argv: list[str]) -> dict[str, Any]:
        proc = subprocess.run(
            [str(x) for x in argv],
            cwd=str(self.workdir),
            text=True,
            capture_output=True,
            timeout=30,
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout[-6000:],
            "stderr": proc.stderr[-6000:],
        }


MOCK_LLM_REPLIES = [
    {
        "type": "tool_use",
        "thought": "Inspect the workspace before acting.",
        "tool": "list_files",
        "args": {"glob": "**/*.py"},
        "summary": "",
    },
    {
        "type": "tool_use",
        "thought": "Run the tests to observe the failure.",
        "tool": "run_command",
        "args": {"argv": [sys.executable, "-m", "unittest", "discover", "-v"]},
        "summary": "",
    },
    {
        "type": "tool_use",
        "thought": "Read the implementation file imported by the test.",
        "tool": "read_file",
        "args": {"path": "auth.py"},
        "summary": "",
    },
    {
        "type": "tool_use",
        "thought": "Apply the minimal textual fix visible in auth.py.",
        "tool": "replace_in_file",
        "args": {"path": "auth.py", "old": '"wrong"', "new": '"secret"'},
        "summary": "",
    },
    {
        "type": "tool_use",
        "thought": "Rerun tests after the edit.",
        "tool": "run_command",
        "args": {"argv": [sys.executable, "-m", "unittest", "discover", "-v"]},
        "summary": "",
    },
    {
        "type": "finish",
        "thought": "The observed tests pass.",
        "tool": "none",
        "args": {},
        "summary": "Done. The mocked LLM replies led the harness to fix the demo test.",
    },
]


class MockLLM:
    """構造化されたLLM返答に見えるfixture actionを返す。"""

    def __init__(self) -> None:
        self.i = 0

    def next_action(self, objective: str, context: list[dict[str, Any]]) -> dict[str, Any]:
        """本物のLLMなら、objectiveとcontextを見て次のactionを選ぶ部分。ここではfixtureを順番に返す。"""

        action = dict(MOCK_LLM_REPLIES[min(self.i, len(MOCK_LLM_REPLIES) - 1)])
        action["id"] = uid("act_")
        action["objective_seen"] = objective
        action["context_events_seen"] = len(context)
        self.i += 1
        return action


class Agent:
    """model reasons / harness executes の接続部分。agent loop本体。"""

    def __init__(self, workdir: Path, prompt: str, mode: str, keep_last: int) -> None:
        self.workdir = workdir.resolve()
        self.prompt = prompt
        self.context = Context(keep_last)
        self.transcript = Transcript(self.workdir)
        self.gate = PermissionGate(self.workdir, mode)
        self.tools = Tools(self.workdir)
        self.llm = MockLLM()

    def record(self, event: dict[str, Any]) -> None:
        self.context.add(event)
        self.transcript.append(event)

    def run(self, max_turns: int) -> None:
        """ユーザー入力から始め、LLM返答、権限判定、tool実行、結果記録を繰り返す。"""

        self.record({"type": "user_prompt", "content": self.prompt})
        for turn in range(1, max_turns + 1):
            action = self.llm.next_action(self.prompt, self.context.visible())
            self.record({"type": "llm_reply", "turn": turn, "action": action})
            print(f"\nturn {turn}: {action['type']} {action['tool']} - {action['thought']}")

            if action["type"] == "finish":
                print("\nassistant:", action["summary"])
                return

            decision, reason = self.gate.decide(action)
            self.record({"type": "permission", "action_id": action["id"], "decision": decision, "reason": reason})
            print(f"permission: {decision} ({reason})")

            result = self.tools.run(action) if decision == "allow" else {"ok": False, "error": reason}
            self.record({"type": "tool_result", "action_id": action["id"], "tool": action["tool"], "result": result})
            self.print_result(result)
        print("\nassistant: stopped after max turns")

    def print_result(self, result: dict[str, Any]) -> None:
        print("tool_result:", "ok" if result.get("ok") else f"failed ({result.get('error') or result.get('returncode')})")
        for key in ["files", "stdout", "stderr", "content"]:
            if key in result and result[key]:
                value = result[key]
                text = "\n".join(value) if isinstance(value, list) else str(value)
                print(text[-1000:])


def create_demo_project() -> Path:
    """動作確認用に、意図的にテストが失敗する小さなPythonプロジェクトを作る。"""

    workdir = Path(tempfile.mkdtemp(prefix="mini-agent-")).resolve()
    (workdir / "auth.py").write_text(
        'def login(username, password):\n    return username == "admin" and password == "wrong"\n',
        encoding="utf-8",
    )
    (workdir / "test_auth.py").write_text(
        """import unittest
from auth import login

class AuthTest(unittest.TestCase):
    def test_admin_login(self):
        self.assertTrue(login("admin", "secret"))

    def test_wrong_password(self):
        self.assertFalse(login("admin", "wrong"))

if __name__ == "__main__":
    unittest.main()
""",
        encoding="utf-8",
    )
    return workdir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, help="Defaults to a temp demo project.")
    parser.add_argument("--prompt", default="Fix the failing Python test. Keep the change minimal.")
    parser.add_argument("--mode", choices=["auto", "dontAsk", "default"], default="auto")
    parser.add_argument("--max-turns", type=int, default=12)
    parser.add_argument("--keep-last", type=int, default=12)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    workdir = args.workdir.resolve() if args.workdir else create_demo_project()
    print(f"workdir: {workdir}")
    agent = Agent(workdir, args.prompt, args.mode, args.keep_last)
    agent.run(args.max_turns)
    print(f"\ntranscript: {agent.transcript.path}")


if __name__ == "__main__":
    main()
