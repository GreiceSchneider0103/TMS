@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" src\totalExpressTrackingOnce.js >> logs\total-express.log 2>&1
