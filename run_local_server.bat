@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_CMD="
where py.exe >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py"

if not defined PYTHON_CMD (
  where python.exe >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
  echo Python could not be found.
  echo Install Python 3 and run this launcher again.
  echo Direct file access is not supported; use an HTTP server.
  pause
  exit /b 1
)

start "Mini4WD Course Local Server" cmd /k "%PYTHON_CMD% -m http.server 8765 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/"
endlocal
