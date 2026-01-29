@echo off
REM Kuroryuu CLI Launcher
REM Run from any CMD/PowerShell: kuroryuu-cli [args]

set "ORIGINAL_DIR=%CD%"
pushd "%~dp0"
python -m apps.kuroryuu_cli --project-root "%ORIGINAL_DIR%" %*
popd
