@echo off
echo.
echo  PropConnect - AI Voice Agent
echo  ----------------------------

IF NOT EXIST "backend\.env" (
  echo  backend\.env not found. Copying from .env.example...
  copy "backend\.env.example" "backend\.env"
  echo  Please fill in backend\.env with your credentials, then re-run.
  pause
  exit /b
)

IF NOT EXIST "backend\node_modules" (
  echo  Installing backend dependencies...
  cd backend && npm install && cd ..
)

IF NOT EXIST "frontend\node_modules" (
  echo  Installing frontend dependencies...
  cd frontend && npm install && cd ..
)

echo.
echo  Starting Backend  ^> http://localhost:5000
echo  Starting Frontend ^> http://localhost:5173
echo.

start "PropConnect Backend"  cmd /k "cd backend && npm run dev"
start "PropConnect Frontend" cmd /k "cd frontend && npm run dev"

echo  Both servers starting in new windows...
timeout /t 3
start http://localhost:5173
