Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
strExe = strDir & "\node_modules\electron\dist\electron.exe"
WshShell.Run chr(34) & strExe & chr(34) & " " & chr(34) & strDir & chr(34), 1
Set WshShell = Nothing
Set fso = Nothing
