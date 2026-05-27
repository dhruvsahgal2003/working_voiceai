#!/bin/bash
# ─────────────────────────────────────────────────
#  PropConnect — Start Backend + Frontend
# ─────────────────────────────────────────────────

echo ""
echo "🚀 PropConnect AI Voice Agent"
echo "────────────────────────────"

# Check .env exists
if [ ! -f "backend/.env" ]; then
  echo "⚠️  backend/.env not found. Copying from .env.example..."
  cp backend/.env.example backend/.env
  echo "👉  Please fill in backend/.env with your credentials, then re-run."
  exit 1
fi

# Install if node_modules missing
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

echo ""
echo "✅ Starting Backend  → http://localhost:5000"
echo "✅ Starting Frontend → http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both in parallel
trap 'kill 0' EXIT
(cd backend  && npm run dev) &
(cd frontend && npm run dev) &
wait
