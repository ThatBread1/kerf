@echo off
rem ===========================================================================
rem  Kerf – zlatník: spuštění na Windows
rem
rem  Poprvé nainstaluje vše potřebné (Python balíčky + webové rozhraní),
rem  připraví databázi a otevře Kerf v prohlížeči na http://localhost:8080.
rem  Další spuštění už jen zapne server (pár sekund).
rem
rem  Potřebuje: Python 3.11+ a Node.js 22+ (oba musí být v PATH).
rem  Data (projekty) se ukládají do %USERPROFILE%\.kerf\kerf.db
rem ===========================================================================
chcp 65001 >nul
setlocal EnableExtensions
rem Zastupce "Kerf zlatník" na plose (vytvori ho Windows, aby vzdy fungoval).
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\Kerf zlatn'+[char]0x00ED+'k.lnk'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0kerf-zlatnik.ico'; $s.WindowStyle=7; $s.Description='Kerf - modelovani sperku'; $s.Save()" >nul 2>nul
cd /d "%~dp0\..\.."
set "ROOT=%cd%"
set "PY=%ROOT%\.venv\Scripts\python.exe"
set "PORT=8080"

where python >nul 2>nul || (
  echo [CHYBA] Nenasel jsem Python. Nainstalujte Python 3.11 nebo novejsi z https://www.python.org
  echo         a pri instalaci zaskrtnete "Add python.exe to PATH".
  pause & exit /b 1
)
where npm >nul 2>nul || (
  echo [CHYBA] Nenasel jsem Node.js. Nainstalujte Node.js 22 LTS z https://nodejs.org
  pause & exit /b 1
)

if not exist "%PY%" (
  echo [1/4] Vytvarim Python prostredi ...
  python -m venv .venv || goto :fail
)

if not exist "%ROOT%\.venv\.zlatnik-installed" (
  echo [2/4] Instaluji serverove balicky - jen poprve, muze trvat nekolik minut ...
  "%PY%" -m pip install --upgrade pip >nul
  "%PY%" -m pip install cryptography ^
    -e packages\kerf-core -e packages\kerf-auth -e packages\kerf-api -e packages\kerf-chat ^
    -e packages\kerf-cli -e packages\kerf-tess -e packages\kerf-v1 -e packages\kerf-cad-core || goto :fail
  echo ok> "%ROOT%\.venv\.zlatnik-installed"
) else (
  echo [2/4] Serverove balicky uz jsou nainstalovane.
)

rem Webove rozhrani: sestavit, pokud chybi nebo se od posledniho sestaveni zmenil kod (git pull).
set "HEAD=none"
for /f %%h in ('git rev-parse HEAD 2^>nul') do set "HEAD=%%h"
set "BUILT=missing"
if exist "web\dist\.zlatnik-build" set /p BUILT=<"web\dist\.zlatnik-build"
if not exist "web\dist\index.html" set "BUILT=missing"
if not "%BUILT%"=="%HEAD%" (
  echo [3/4] Sestavuji webove rozhrani ...
  pushd web
  if not exist node_modules (
    call npm ci --no-audit --no-fund || (popd & goto :fail)
  )
  call node ..\scripts\init-config.mjs >nul 2>nul
  call node ..\scripts\build-docs-manifest.mjs >nul 2>nul
  call node ..\scripts\build-compare-manifest.mjs >nul 2>nul
  call node ..\scripts\build-roadmap-manifest.mjs >nul 2>nul
  call npx vite build || (popd & goto :fail)
  popd
  >"web\dist\.zlatnik-build" echo %HEAD%
) else (
  echo [3/4] Webove rozhrani je aktualni.
)

curl -s -o nul "http://localhost:%PORT%" && (
  echo Kerf uz bezi - oteviram okno.
  call "%ROOT%\scripts\zlatnik\otevrit-okno.cmd" %PORT%
  exit /b 0
)
echo [4/4] Pripravuji databazi a spoustim server na http://localhost:%PORT% ...
"%PY%" -m kerf_core.db.migrations.runner || goto :fail
set "KERF_FRONTEND_DIST=%ROOT%\web\dist"
start "" /min "%ROOT%\scripts\zlatnik\otevrit-okno.cmd" %PORT%
"%ROOT%\.venv\Scripts\kerf-server.exe" --host 127.0.0.1 --port %PORT%
goto :eof

:fail
echo.
echo [CHYBA] Neco se nepovedlo - viz vypis vyse.
pause
exit /b 1
