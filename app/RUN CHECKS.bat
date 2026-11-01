@echo off
setlocal
chcp 65001 >nul
title OpenStage Recorder - run the automatic checks
cd /d "%~dp0"

echo.
echo ============================================================
echo   OpenStage Recorder: run the automatic checks
echo ============================================================
echo.
echo This runs the checks that come with the app: the type check, the
echo unit tests, and the browser check that drives every screen from the
echo keyboard. It uses a PRETEND recorder: nothing on your screen or
echo microphone is recorded, nothing is sent anywhere, and no sound is
echo played. It takes about two minutes.
echo.

call "%~dp0..\capture\rust-setup.bat" node
if errorlevel 1 goto no_node

for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
echo Using Node.js %NODE_VERSION%
echo.

if exist "%~dp0node_modules\esbuild" goto have_packages
echo The checks need the app's own packages: a small build tool called esbuild,
echo TypeScript and the library that talks to the app window. They come from
echo npmjs.com, the website that holds JavaScript packages, are the exact versions
echo listed in package-lock.json, and are downloaded once into the folder
echo app\node_modules. Nothing of yours is sent.
echo.
set "OR_ALLOW="
set /p OR_ALLOW=Type D and press Enter to allow the download, or just press Enter to stop:
if /i not "%OR_ALLOW%"=="D" goto declined
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed

:have_packages
echo.
echo 1 of 4: the type check
call npm run typecheck
if errorlevel 1 goto failed

echo.
echo 2 of 4: the unit tests
call npm test
if errorlevel 1 goto failed

echo.
echo 3 of 4: building the page
call npm run build
if errorlevel 1 goto failed

echo.
echo 4 of 4: the browser check
if not "%PLAYWRIGHT_DIR%"=="" goto have_playwright_setting
set "PLAYWRIGHT_DIR=%USERPROFILE%\playwright-tools\node_modules\playwright"
:have_playwright_setting
if exist "%PLAYWRIGHT_DIR%\package.json" goto browser
echo The browser check needs Playwright, a free test tool that is not part of this
echo program, and a copy of it was not found at:
echo   %PLAYWRIGHT_DIR%
echo To run this check, install Playwright (npm install playwright, then
echo npx playwright install chromium-headless-shell, in a folder of your choice)
echo and set the variable PLAYWRIGHT_DIR to its folder named playwright inside
echo node_modules, then run this again. The first three checks passed.
goto done

:browser
node tools\browser-check.mjs
if errorlevel 1 goto failed
echo.
echo All four checks passed.
goto done

:no_node
echo Node.js was not found on this computer. The checks need it, version 22
echo or newer. It is free: https://nodejs.org (choose the LTS version).
echo If Node.js is installed somewhere else, set the variable OPENSTAGE_RUST_ENV
echo to a PowerShell file that puts it on the PATH, then run this again.
goto done

:declined
echo.
echo Nothing was downloaded, so the checks were not run.
goto done

:failed
echo.
echo A check did not pass. What it said is above. If it is not clear, please
echo send me what this window shows.
goto done

:done
echo.
pause
