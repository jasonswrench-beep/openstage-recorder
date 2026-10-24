@echo off
setlocal
chcp 65001 >nul
title OpenStage Recorder - preview in your browser
cd /d "%~dp0"

echo.
echo ============================================================
echo   OpenStage Recorder: preview in your browser
echo ============================================================
echo.
echo This shows the Record screen in your web browser with a PRETEND
echo recorder. Nothing on your screen or microphone is recorded, and
echo nothing is sent anywhere. It is for trying the screen with a
echo keyboard or a screen reader. The page is served only to this
echo computer, and stops when you close this window.
echo.

call "%~dp0..\capture\rust-setup.bat" node
if errorlevel 1 goto no_node

for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
echo Using Node.js %NODE_VERSION%
echo.

if exist "%~dp0node_modules\esbuild" goto build
echo The page needs a small build tool called esbuild, and the library that
echo talks to the app window. They come from npmjs.com, the website that
echo holds JavaScript packages, and are downloaded once into the folder
echo app\node_modules. Nothing of yours is sent.
echo.
set "OR_ALLOW="
set /p OR_ALLOW=Type D and press Enter to allow the download, or just press Enter to stop:
if /i not "%OR_ALLOW%"=="D" goto declined
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

:build
call npm run build
if errorlevel 1 goto failed
echo.
echo Starting. Your browser will open by itself.
echo When you are done, close this window.
echo.
node "%~dp0dev-server.mjs" 5174 --open
if errorlevel 1 goto failed
goto done

:no_node
echo Node.js was not found on this computer. The preview needs it, version 22
echo or newer. It is free: https://nodejs.org (choose the LTS version).
echo If Node.js is installed somewhere else, set the variable OPENSTAGE_RUST_ENV
echo to a PowerShell file that puts it on the PATH, then run this again.
goto done

:declined
echo.
echo Nothing was downloaded, so the preview was not started.
goto done

:failed
echo.
echo Something stopped. What it said is above. If it is not clear, please
echo send me what this window shows.
goto done

:done
echo.
pause
