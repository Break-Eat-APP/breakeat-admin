@echo off
REM ============================================================
REM  Break Eat - Lancer le backend + les sites en LOCAL
REM  Double-clique sur ce fichier. Docker Desktop doit etre ouvert.
REM ============================================================
cd /d "%~dp0"
echo.
echo   Demarrage de Break Eat en local...
echo.

echo   [1/4] Base de donnees (Docker : Postgres + Redis)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo   /!\ Docker n'a pas repondu. Ouvre "Docker Desktop" et relance ce fichier.
  echo.
  pause
  exit /b 1
)

echo   [2/4] Backend (port 3000)...
start "Break Eat - Backend" cmd /k "corepack pnpm --filter @break-eat/backend start:dev"

echo   [3/4] Dashboard manager (port 3001)...
start "Break Eat - Manager" cmd /k "corepack pnpm --filter @break-eat/admin dev"

echo   [4/4] Back-office (port 3003)...
start "Break Eat - Back-office" cmd /k "corepack pnpm --filter @break-eat/backoffice dev"

echo.
echo   ============================================================
echo     Attends ~20 secondes que tout demarre, puis ouvre :
echo.
echo       Dashboard manager :  http://localhost:3001
echo       Back-office       :  http://localhost:3003
echo.
echo     Connexion : admin@breakeat.test  /  BreakEat2026!
echo   ============================================================
echo.
echo   Pour tout arreter : ferme les 3 fenetres noires qui se sont ouvertes.
echo.
pause
