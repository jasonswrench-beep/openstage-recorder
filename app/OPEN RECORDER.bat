@echo off
setlocal
chcp 65001 >nul
title OpenStage Recorder
cd /d "%~dp0"

echo.
echo ============================================================
echo   OpenStage Recorder
echo ============================================================
echo.
echo This builds OpenStage Recorder the first time, which takes a few
echo minutes, and opens it. After that it opens at once. Nothing is
echo installed on your computer: everything is built into this folder
echo and the folder capture.
echo.

call "%~dp0..\capture\rust-setup.bat" node
if errorlevel 1 goto no_node
call "%~dp0..\capture\rust-setup.bat"
if errorlevel 1 goto no_rust

set "RECORDER_EXE=%~dp0src-tauri\target\release\openstage-recorder.exe"
set "CAPTURE_EXE=%~dp0..\capture\target\release\openstage-capture.exe"

rem A program built before its files last changed is out of date. If any of them is newer, it is built again.
if not exist "%RECORDER_EXE%" goto build_app
powershell -NoProfile -Command "$e=(Get-Item -LiteralPath $env:RECORDER_EXE).LastWriteTime; $n=(Get-ChildItem src,web,src-tauri\src,core\src,src-tauri\tauri.conf.json,package.json -Recurse -File | Measure-Object -Property LastWriteTime -Maximum).Maximum; if ($n -gt $e) { exit 1 } else { exit 0 }"
if errorlevel 1 goto build_app
goto build_recorder

:build_app
echo Building the app window. This takes a few minutes the first time.
echo.
if exist "%~dp0node_modules" if exist "%~dp0src-tauri\target" goto app_tools_ready
echo The first build downloads libraries, once: JavaScript packages from
echo npmjs.com and Rust libraries from crates.io. Nothing of yours is sent.
echo After this, builds on this computer do not download.
echo.
set "OR_ALLOW="
set /p OR_ALLOW=Type D and press Enter to allow the download, or just press Enter to stop:
if /i not "%OR_ALLOW%"=="D" goto declined
:app_tools_ready
if exist "%~dp0node_modules" goto npm_ready
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
:npm_ready
call npm run build
if errorlevel 1 goto failed
call npx tauri build --no-bundle
if errorlevel 1 goto failed

:build_recorder
if not exist "%CAPTURE_EXE%" goto make_recorder
powershell -NoProfile -Command "$e=(Get-Item -LiteralPath $env:CAPTURE_EXE).LastWriteTime; $n=(Get-ChildItem ..\capture\crates,..\capture\Cargo.toml,..\capture\Cargo.lock -Recurse -File | Measure-Object -Property LastWriteTime -Maximum).Maximum; if ($n -gt $e) { exit 1 } else { exit 0 }"
if errorlevel 1 goto make_recorder
goto run

:make_recorder
echo Building the recording program. This takes a few minutes the first time.
echo.
if exist "%~dp0..\capture\build-log.txt" del "%~dp0..\capture\build-log.txt"
pushd "%~dp0..\capture"
call "%~dp0..\capture\cargo-run.bat" "%~dp0..\capture\build-log.txt" build --release -p openstage-capture-cli
set "REC_RESULT=%errorlevel%"
popd
if not "%REC_RESULT%"=="0" goto recorder_failed

:run
if not exist "%RECORDER_EXE%" goto not_built
rem The app looks for the recording program through this setting, wherever it is built.
set "OPENSTAGE_CAPTURE=%CAPTURE_EXE%"
start "" "%RECORDER_EXE%"
goto done

:recorder_failed
echo.
echo The recording program could not be built, so nothing can be recorded.
echo What went wrong is written in capture\build-log.txt
goto done

:not_built
echo.
echo The app was not built. Scroll up to see why.
goto done

:no_node
echo Node.js was not found on this computer. Building the app needs it, version 22
echo or newer. It is free: https://nodejs.org (choose the LTS version).
echo If Node.js is installed somewhere else, set the variable OPENSTAGE_RUST_ENV
echo to a PowerShell file that puts it on the PATH, then run this again.
goto done

:no_rust
echo Rust was not found on this computer. Building the app needs it.
echo If Rust is installed somewhere else, set the variable OPENSTAGE_RUST_ENV
echo to a PowerShell file that puts it on the PATH, then run this again.
goto done

:declined
echo.
echo Nothing was downloaded, so the app was not built.
goto done

:failed
echo.
echo Something stopped. What it said is above. If it is not clear, please
echo send me what this window shows.
goto done

:done
echo.
pause
