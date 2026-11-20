@echo off
rem Pocka, az server Kerfu odpovida, a otevre ho v samostatnem okne (jako aplikaci).
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"
set "URL=http://localhost:%PORT%"
for /l %%i in (1,1,60) do (
  curl -s -o nul "%URL%" && goto :open
  timeout /t 1 /nobreak >nul
)
:open
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL% --start-maximized
) else if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --start-maximized
) else (
  start "" "%URL%"
)
