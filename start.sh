#!/bin/bash

# Define workspace directories
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Config ports
BACKEND_PORT=8000
FRONTEND_PORT=5173

echo "🚀 Initializing Glowup Coach Platform..."

# Function to clean up background processes
cleanup() {
    echo ""
    echo "Stopping background services..."
    
    # Kill backend
    BACKEND_PIDS=$(lsof -ti :$BACKEND_PORT)
    if [ ! -z "$BACKEND_PIDS" ]; then
        echo "Terminating backend (PIDs: $BACKEND_PIDS)"
        echo "$BACKEND_PIDS" | xargs kill -9
    fi

    # Kill frontend
    FRONTEND_PIDS=$(lsof -ti :$FRONTEND_PORT)
    if [ ! -z "$FRONTEND_PIDS" ]; then
        echo "Terminating frontend (PIDs: $FRONTEND_PIDS)"
        echo "$FRONTEND_PIDS" | xargs kill -9
    fi
    
    exit 0
}

# Trap Ctrl+C (SIGINT) and exit signals
trap cleanup INT TERM EXIT

# --- BACKEND ENVIRONMENT SETUP ---
echo "⚙️ Setting up Python Virtual Environment..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment in $BACKEND_DIR/.venv..."
    python3 -m venv .venv
fi

# Activate environment
source .venv/bin/activate

echo "📦 Installing backend requirements..."
pip install --upgrade pip
pip install -r requirements.txt

# Free ports if busy
lsof -ti :$BACKEND_PORT | xargs kill -9 2>/dev/null
lsof -ti :$FRONTEND_PORT | xargs kill -9 2>/dev/null

# Start backend
echo "⚡ Starting FastAPI Backend on port $BACKEND_PORT..."
python run.py > /tmp/glowup_backend.log 2>&1 &
BACKEND_PID=$!

# Health check backend
echo "🔍 Waiting for Backend to be healthy..."
retries=0
max_retries=15
while ! curl -s http://localhost:$BACKEND_PORT/ > /dev/null; do
    sleep 1
    retries=$((retries+1))
    if [ $retries -ge $max_retries ]; then
        echo "❌ Backend failed to start. Logs:"
        cat /tmp/glowup_backend.log
        exit 1
    fi
done
echo "✅ Backend is online!"

# --- FRONTEND APP START ---
echo "⚡ Starting Vite Frontend..."
cd "$FRONTEND_DIR"

# Run frontend dev in the background
npm run dev -- --port $FRONTEND_PORT > /tmp/glowup_frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to compile and start
sleep 2
echo "✅ Frontend dev server listening on http://localhost:$FRONTEND_PORT"
echo "--------------------------------------------------------"
echo "🎉 Glowup Coach is fully operational!"
echo "➡️ Visit http://localhost:$FRONTEND_PORT in your browser."
echo "➡️ Logs are redirected to /tmp/glowup_backend.log and /tmp/glowup_frontend.log."
echo "➡️ Press Ctrl+C to terminate all services."
echo "--------------------------------------------------------"

# Keep script running to maintain trap hooks
while true; do
    sleep 1
done
