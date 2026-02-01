#!/usr/bin/env bash
# Setup and run Photo Quality Ranking (backend + frontend). Linux and macOS.
# Usage: ./setup-and-run.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Photo Quality Ranking — Setup & Run ==="

# 1. Python venv
if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv 2>/dev/null || python -m venv .venv
fi
echo "Activating virtual environment..."
# shellcheck source=/dev/null
source .venv/bin/activate

# 2. Backend dependencies
echo "Installing backend dependencies..."
pip install -q -r requirements.txt

# 3. Frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install --silent
cd ..

# 4. Start backend in background
echo "Starting backend on http://localhost:8000 ..."
(
  source .venv/bin/activate
  cd "$SCRIPT_DIR/backend"
  exec python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

# 5. Start frontend in background
echo "Starting frontend (Vite) on http://localhost:5173 ..."
(
  cd "$SCRIPT_DIR/frontend"
  exec npm run dev
) &
FRONTEND_PID=$!

# Cleanup on exit (Ctrl+C or script end)
cleanup() {
  echo ""
  echo "Stopping backend (PID $BACKEND_PID) and frontend (PID $FRONTEND_PID)..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# 6. Wait for Vite to be ready, then open browser
echo "Waiting for frontend to be ready..."
sleep 5
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173" 2>/dev/null || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:5173" 2>/dev/null || true
else
  echo "Open http://localhost:5173 in your browser."
fi

echo ""
echo "Backend:  http://localhost:8000  (PID $BACKEND_PID)"
echo "Frontend: http://localhost:5173  (PID $FRONTEND_PID)"
echo "Press Ctrl+C to stop both."
echo ""
wait
