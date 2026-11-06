@echo off
REM One-command start for Windows (XAMPP users): serves API + built frontend on http://localhost:8000
cd /d "%~dp0"

if not exist backend\.venv (
  py -3 -m venv backend\.venv 2>nul || python -m venv backend\.venv
  if errorlevel 1 ( echo Python 3.10+ is required: https://www.python.org/downloads/ & pause & exit /b 1 )
)
backend\.venv\Scripts\python -m pip install -q -r backend\requirements.txt
if errorlevel 1 ( echo Dependency install failed & pause & exit /b 1 )

if not exist frontend\dist\index.html (
  echo Building frontend - needs Node.js 18+ ...
  pushd frontend
  call npm install --no-audit --no-fund
  call npm run build
  popd
)

start "" http://localhost:8000
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
