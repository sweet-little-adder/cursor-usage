#!/bin/zsh
# Opens Cursor model settings where Pro vs personal API key is configured.
# Fully automatic toggling is not exposed in a stable local file, so this
# uses UI navigation for a reliable workflow.

osascript <<'APPLESCRIPT'
tell application "Cursor" to activate
delay 0.4

tell application "System Events"
  tell process "Cursor"
    -- Cmd+Shift+J opens Cursor Settings in recent builds.
    keystroke "j" using {command down, shift down}
    delay 0.8
    -- Search within settings for Models.
    keystroke "f" using {command down}
    delay 0.2
    keystroke "Models"
    delay 0.3
    key code 36
  end tell
end tell
APPLESCRIPT

/usr/bin/osascript -e 'display notification "Jumped to Models — toggle API key mode" with title "Cursor Ring"'
