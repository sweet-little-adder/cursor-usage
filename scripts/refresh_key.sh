#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"
STATE_PATH="$ROOT/state/usage-state.json"

if [[ ! -x "$PYTHON" ]]; then
  echo "Missing venv. Run: cd $ROOT && python3 -m venv .venv" >&2
  exit 1
fi

export CURSOR_PROJECT_ROOT="${CURSOR_PROJECT_ROOT:-}"

"$PYTHON" "$ROOT/scripts/fetch_usage.py" >/dev/null
"$PYTHON" "$ROOT/scripts/render_ring.py" >/dev/null

TITLE="$("$PYTHON" -c "import json, pathlib; print(json.loads(pathlib.Path('$STATE_PATH').read_text())['title_text'])")"
/usr/bin/osascript -e "display notification \"$TITLE\" with title \"Cursor Ring\" subtitle \"SVG refreshed\""

echo "SVG=$ROOT/icons/cursor-ring.svg"
echo "TITLE=$TITLE"
