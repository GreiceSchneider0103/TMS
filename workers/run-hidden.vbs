' Runs the given .bat file with no visible console window.
' Used by Task Scheduler instead of calling the .bat directly, which
' otherwise flashes a cmd.exe window on screen every time it fires.
Set objShell = CreateObject("WScript.Shell")
objShell.Run """" & WScript.Arguments(0) & """", 0, True
