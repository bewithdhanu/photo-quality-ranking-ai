@echo off
REM Setup and run Photo Quality Ranking (backend + frontend). Windows.
REM Usage: setup-and-run.bat

setlocal
cd /d "%~dp0"

echo === Photo Quality Ranking — Setup ^& Run ===

REM 1. Python venv
if not exist ".venv" (
  echo Creating Python virtual environment...
  python -m venv .venv
)
echo Activating virtual environment...
call .venv\Scripts\activate.bat

REM 2. Backend dependencies
echo Installing backend dependencies...
pip install -q -r requirements.txt

REM 3. Frontend dependencies
echo Installing frontend dependencies...
cd frontend
call npm install
cd ..

REM 4. Start backend in new window
echo Starting backend on http://localhost:8000 ...
start "Photo Ranking - Backend" cmd /k "cd /d "%~dp0" && .venv\Scripts\activate && cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

REM 5. Start frontend in new window
echo Starting frontend on http://localhost:5173 ...
start "Photo Ranking - Frontend" cmd /k "cd /d "%~dp0\frontend" && npm run dev"

REM 6. Wait then open browser
echo Waiting for frontend to start...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Backend:  http://localhost:8000  (see Backend window)
echo Frontend: http://localhost:5173  (browser should open)
echo Close the Backend and Frontend command windows to stop.
echo.
pause
