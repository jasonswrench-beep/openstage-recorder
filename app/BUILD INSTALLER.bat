@echo off
setlocal
chcp 65001 >nul
title OpenStage Recorder installer
cd /d "%~dp0"

echo.
echo ============================================================
echo   Make the OpenStage Recorder installer
echo ============================================================
echo.
echo This builds OpenStage Recorder and puts it in one installer file that
echo you can run on any Windows 10 or 11 computer. It takes a few minutes
echo the first time. It does not install anything on this computer: it only
echo makes the file, and tells you where it is.
echo.

call "%~dp0..\capture\rust-setup.bat" node
if errorlevel 1 goto no_node
call "%~dp0..\capture\rust-setup.bat"
if errorlevel 1 goto no_rust

set "CAPTURE_EXE=%~dp0..\capture\target\release\openstage-capture.exe"

rem The folders this computer builds in (your user folder, Rust's folders and this repository) are not written into the programs: each
rem is replaced by a short stand-in name, and the debug file is named without its folder (docs\recorder\INSTALLER-AND-SIGNING.md).
rem CARGO_ENCODED_RUSTFLAGS keeps a space in a folder's name whole; its parts are separated by the character made here.
for /f %%S in ('powershell -NoProfile -Command "[char]31"') do set "OR_US=%%S"
set "OR_CARGO=%USERPROFILE%\.cargo"
if defined CARGO_HOME set "OR_CARGO=%CARGO_HOME%"
set "OR_RUSTUP=%USERPROFILE%\.rustup"
if defined RUSTUP_HOME set "OR_RUSTUP=%RUSTUP_HOME%"
for %%R in ("%~dp0..") do set "OR_REPO=%%~fR"
set "OR_FOLDERS=--remap-path-prefix=%USERPROFILE%=/home%OR_US%--remap-path-prefix=%OR_CARGO%=/cargo%OR_US%--remap-path-prefix=%OR_RUSTUP%=/rustup%OR_US%--remap-path-prefix=%OR_REPO%=/openstage-recorder%OR_US%-Clink-arg=/PDBALTPATH:%%_PDB%%"

if exist "%~dp0node_modules" if exist "%~dp0src-tauri\target" if exist "%~dp0..\capture\target" goto tools_ready
echo The first build downloads libraries, once: JavaScript packages from
echo npmjs.com and Rust libraries from crates.io. Nothing of yours is sent.
echo After this, builds on this computer do not download.
echo.
set "OR_ALLOW="
set /p OR_ALLOW=Type D and press Enter to allow the download, or just press Enter to stop:
if /i not "%OR_ALLOW%"=="D" goto declined
:tools_ready

echo.
echo Step 1 of 3: building the recording program.
echo.
if exist "%~dp0..\capture\build-log.txt" del "%~dp0..\capture\build-log.txt"
pushd "%~dp0..\capture"
rem The setting below replaces capture\.cargo\config.toml's flags, so its one flag (+crt-static) is given here too.
set "CARGO_ENCODED_RUSTFLAGS=-C%OR_US%target-feature=+crt-static%OR_US%%OR_FOLDERS%"
call "%~dp0..\capture\cargo-run.bat" "%~dp0..\capture\build-log.txt" build --release -p openstage-capture-cli
set "REC_RESULT=%errorlevel%"
popd
if not "%REC_RESULT%"=="0" goto recorder_failed
if not exist "%CAPTURE_EXE%" goto recorder_failed

echo.
echo Step 2 of 3: building the app window.
echo.
if exist "%~dp0node_modules" goto npm_ready
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
:npm_ready
call npm run build
if errorlevel 1 goto failed

echo.
echo Step 3 of 3: making the installer. This is the slowest step.
echo.
set "CARGO_ENCODED_RUSTFLAGS=%OR_FOLDERS%"
call npx tauri build --config src-tauri\tauri.installer.conf.json
if errorlevel 1 goto failed

set "INSTALLER="
for %%f in ("%~dp0src-tauri\target\release\bundle\nsis\*.exe") do set "INSTALLER=%%~ff"
if "%INSTALLER%"=="" goto no_installer
if not exist "%~dp0installer" mkdir "%~dp0installer"
copy /y "%INSTALLER%" "%~dp0installer\" >nul
if errorlevel 1 goto failed
for %%f in ("%INSTALLER%") do set "INSTALLER_NAME=%%~nxf"

echo.
echo ============================================================
echo   The installer is ready:
echo   %~dp0installer\%INSTALLER_NAME%
echo ============================================================
echo.
echo Double-click it to install OpenStage Recorder for your own user. It does
echo not ask for an administrator password. To remove it later, use
echo Settings, Apps, Installed apps. Your recordings are not removed.
echo.
echo The first time you run it, Windows may show a blue box that says
echo "Windows protected your PC". That is because the installer is not signed
echo yet. Click "More info", then "Run anyway".
echo.
explorer /select,"%~dp0installer\%INSTALLER_NAME%"
goto done

:recorder_failed
echo.
echo The recording program could not be built, so there is nothing to put in
echo the installer. What went wrong is written in capture\build-log.txt
goto done

:no_installer
echo.
echo The build finished, but no installer file was found in
echo src-tauri\target\release\bundle\nsis
echo Scroll up to see what the build said.
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
echo Nothing was downloaded, so the installer was not made.
goto done

:failed
echo.
echo Something stopped. What it said is above. If it is not clear, please
echo send me what this window shows.
goto done

:done
echo.
pause
