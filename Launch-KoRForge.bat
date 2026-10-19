@echo off
title KoRForge
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" .
exit

