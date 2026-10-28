@echo off
cd /d "%~dp0"
python start.py %* || py start.py %*
pause
