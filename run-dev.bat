@echo off
REM Double-click launcher for `npm run tauri dev`.
REM Cargo's bin dir and the GitHub CLI install dir both need to be on PATH
REM for the spawned Rust process (see README) — added here so this always
REM works regardless of whether they're on your permanent system PATH.
setlocal
set "PATH=%USERPROFILE%\.cargo\bin;C:\Program Files\GitHub CLI;%PATH%"
cd /d "%~dp0"
call npm run tauri dev
echo.
echo (window closed or dev server exited — press any key to close this window)
pause >nul
