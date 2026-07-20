on run argv
	set projectRoot to ""
	if (count of argv) > 0 then
		set projectRoot to item 1 of argv
	end if

	set injectFile to (POSIX path of (path to home folder)) & "Developer/cursor-usage/context/inject-prompt.txt"
	set promptText to do shell script "cat " & quoted form of injectFile

	if projectRoot is not "" then
		set promptText to promptText & return & "Project root: " & projectRoot
	end if

	set the clipboard to promptText

	tell application "Cursor" to activate
	delay 0.35

	tell application "System Events"
		tell process "Cursor"
			-- Open chat/composer input. Adjust if your keybinding differs.
			keystroke "l" using {command down}
			delay 0.25
			keystroke "v" using {command down}
			delay 0.15
			key code 36
		end tell
	end tell

	display notification "Strong context prompt injected" with title "Cursor Ring"
end run
