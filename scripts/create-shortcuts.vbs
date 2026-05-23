' ASCII-only: avoids encoding garbled text under shortcuts
Set sh = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
desktop = sh.SpecialFolders("Desktop")

Set lnk = sh.CreateShortcut(desktop & "\Start Order Management.lnk")
lnk.TargetPath = scriptDir & "\start-app.bat"
lnk.WorkingDirectory = scriptDir
lnk.WindowStyle = 1
lnk.Description = "Start: Docker, API, web UI"
lnk.Save

Set lnk2 = sh.CreateShortcut(desktop & "\Stop Order Management.lnk")
lnk2.TargetPath = scriptDir & "\stop-app.bat"
lnk2.WorkingDirectory = scriptDir
lnk2.WindowStyle = 1
lnk2.Description = "Stop Docker (database and API)"
lnk2.Save

MsgBox "Shortcuts OK: Start Order Management, Stop Order Management", 64, "Order Management"
