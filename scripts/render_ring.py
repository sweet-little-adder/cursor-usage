#!/usr/bin/env python3
"""Debug helper: write parametric SVG rings (vector source of truth)."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "state" / "usage-state.json"
OUTPUT_PATH = ROOT / "icons" / "cursor-ring.svg"


def ring(cx: float, cy: float, r: float, stroke: float, track: str, color: str, percent: float) -> str:
    pct = max(0.0, min(100.0, percent))
    c = 2 * math.pi * r
    offset = c * (1 - pct / 100)
    return f"""
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{track}" stroke-width="{stroke}" />
    <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke}"
      stroke-linecap="round" stroke-dasharray="{c:.3f}" stroke-dashoffset="{offset:.3f}"
      transform="rotate(-90 {cx} {cy})" />
    """


def main() -> int:
    if not STATE_PATH.exists():
        print("Run fetch_usage.py first", file=sys.stderr)
        return 1

    state = json.loads(STATE_PATH.read_text())
    size = 144
    cx = cy = size / 2
    outer = size / 2 - 12
    middle = outer - 9
    inner = middle - 8

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect x="8" y="8" width="128" height="128" rx="22" fill="#121214"/>
  {ring(cx, cy, outer, 10, "#2C2C2E", state["ring_color"], state["total_percent"])}
  {ring(cx, cy, middle, 8, "#2C2C2E", "#64D2FF" if state["context_loaded"] else "#BF5AF2", state["inner_ring_percent"])}
  {ring(cx, cy, inner, 6, "#2C2C2E", "#FF9F0A", state["api_percent"])}
  <text x="{cx}" y="{cy + 8}" text-anchor="middle" fill="#F5F5F7" font-family="Helvetica Neue, Arial, sans-serif" font-size="24" font-weight="600">{state["center_text"]}</text>
</svg>
"""

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(svg)
    print(OUTPUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
