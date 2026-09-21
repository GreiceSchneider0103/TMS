@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" src\rteTrackingOnce.js >> logs\rte.log 2>&1
