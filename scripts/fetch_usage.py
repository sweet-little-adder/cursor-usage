#!/usr/bin/env python3
"""Fetch Cursor usage from the local auth token and write state JSON."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
STATE_PATH = ROOT / "state" / "usage-state.json"
CURSOR_DB = Path.home() / "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
USAGE_SUMMARY_URL = "https://api2.cursor.sh/auth/usage-summary"


@dataclass
class UsageState:
    fetched_at: str
    membership: str
    billing_start: str
    billing_end: str
    total_percent: float
    auto_percent: float
    api_percent: float
    plan_used: int
    plan_limit: int
    daily_pace_percent: float
    status_label: str
    status_level: str
    context_loaded: bool
    context_source: str | None
    center_text: str
    title_text: str
    ring_color: str
    inner_ring_percent: float


def load_config() -> dict:
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def read_access_token() -> str:
    if not CURSOR_DB.exists():
        raise RuntimeError(f"Cursor database not found: {CURSOR_DB}")

    connection = sqlite3.connect(f"file:{CURSOR_DB}?mode=ro", uri=True)
    try:
        row = connection.execute(
            "SELECT value FROM ItemTable WHERE key = ?",
            ("cursorAuth/accessToken",),
        ).fetchone()
    finally:
        connection.close()

    if not row or not row[0]:
        raise RuntimeError("No Cursor access token found. Open Cursor and sign in.")

    return row[0]


def fetch_usage_summary(token: str) -> dict:
    request = urllib.request.Request(
        USAGE_SUMMARY_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "cursor-usage-ring/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Usage API failed ({error.code}): {body}") from error


def parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def detect_context(project_root: str | None, paths: list[str]) -> tuple[bool, str | None]:
    if not project_root:
        return False, None

    root = Path(project_root).expanduser().resolve()
    for relative in paths:
        candidate = root / relative
        if candidate.exists():
            return True, str(candidate.relative_to(root))
    return False, None


def resolve_project_root() -> str | None:
    env_root = os.environ.get("CURSOR_PROJECT_ROOT")
    if env_root:
        return env_root

  # Frontmost Cursor window path is hard to read reliably without AppleScript.
  # Stream Deck can pass CURSOR_PROJECT_ROOT in the shell action environment.
    return os.environ.get("PWD")


def color_for_percent(percent: float, thresholds: dict) -> str:
    if percent <= thresholds["green_max"]:
        return "#30D158"
    if percent <= thresholds["yellow_max"]:
        return "#FFD60A"
    return "#FF453A"


def label_for_percent(percent: float, thresholds: dict, labels: dict) -> tuple[str, str]:
    if percent <= thresholds["green_max"]:
        return labels["low"], "low"
    if percent <= thresholds["yellow_max"]:
        return labels["ok"], "ok"
    if percent <= thresholds["yellow_max"] + 10:
        return labels["heavy"], "heavy"
    return labels["hot"], "hot"


def compute_daily_pace(total_percent: float, billing_start: str, billing_end: str) -> float:
    now = datetime.now(timezone.utc)
    start = parse_iso(billing_start)
    end = parse_iso(billing_end)
    elapsed_days = max((now - start).total_seconds() / 86400, 0.25)
    cycle_days = max((end - start).total_seconds() / 86400, 1)
    return round((total_percent / elapsed_days), 1)


def build_state(summary: dict, config: dict) -> UsageState:
    plan = summary.get("individualUsage", {}).get("plan", {})
    total_percent = float(plan.get("totalPercentUsed") or 0)
    auto_percent = float(plan.get("autoPercentUsed") or 0)
    api_percent = float(plan.get("apiPercentUsed") or 0)

    ring_metric = config.get("ring_metric", "cycle")
    if ring_metric == "daily_pace":
        ring_percent = compute_daily_pace(
            total_percent,
            summary["billingCycleStart"],
            summary["billingCycleEnd"],
        )
        center_text = f"{ring_percent:.0f}%/d"
    else:
        ring_percent = round(total_percent)
        center_text = f"{ring_percent:.0f}%"

    context_loaded, context_source = detect_context(
        resolve_project_root(),
        config.get("context_paths", []),
    )

    thresholds = config["thresholds"]
    labels = config["labels"]
    status_label, status_level = label_for_percent(ring_percent, thresholds, labels)
    ring_color = color_for_percent(ring_percent, thresholds)

    if context_loaded:
        inner_ring_percent = 100.0
        title_text = f"{center_text} · Ctx ✓"
    else:
        inner_ring_percent = min(auto_percent, 100.0)
        title_text = f"{center_text} · {status_label}"

    return UsageState(
        fetched_at=datetime.now(timezone.utc).isoformat(),
        membership=summary.get("membershipType", "unknown"),
        billing_start=summary.get("billingCycleStart", ""),
        billing_end=summary.get("billingCycleEnd", ""),
        total_percent=round(total_percent, 1),
        auto_percent=round(auto_percent, 1),
        api_percent=round(api_percent, 1),
        plan_used=int(plan.get("used") or 0),
        plan_limit=int(plan.get("limit") or 0),
        daily_pace_percent=compute_daily_pace(
            total_percent,
            summary["billingCycleStart"],
            summary["billingCycleEnd"],
        ),
        status_label=status_label,
        status_level=status_level,
        context_loaded=context_loaded,
        context_source=context_source,
        center_text=center_text,
        title_text=title_text,
        ring_color=ring_color,
        inner_ring_percent=inner_ring_percent,
    )


def main() -> int:
    config = load_config()
    token = read_access_token()
    summary = fetch_usage_summary(token)
    state = build_state(summary, config)

    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.open("w", encoding="utf-8") as handle:
        json.dump(asdict(state), handle, indent=2)
        handle.write("\n")

    print(json.dumps(asdict(state), indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - CLI entrypoint
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
