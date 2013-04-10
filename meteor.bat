@echo off
rem Just like launch-meteor script, initialise METEOR_WAREHOUSE_DIR
if not defined METEOR_WAREHOUSE_DIR (
    rem Note that windows doesn't normally have HOME defined,
    rem and XP doesn't have LOCALAPPDATA
    set METEOR_WAREHOUSE_DIR=%HOMEDRIVE%%HOMEPATH%\.meteor
    if defined LOCALAPPDATA set METEOR_WAREHOUSE_DIR=%LOCALAPPDATA%\.meteor
)
echo METEOR_WAREHOUSE_DIR=%METEOR_WAREHOUSE_DIR%

rem But unlike launch-meteor, only perform basic boot-strapping
if not exist "%METEOR_WAREHOUSE_DIR%\meteor" (
    if exist "%METEOR_WAREHOUSE_DIR%" (
        echo "'%METEOR_WAREHOUSE_DIR%' exists, but '%METEOR_WAREHOUSE_DIR%\meteor' does not exist."
        echo "Remove it and try again"
        exit /b 1
    )
    mkdir "%METEOR_WAREHOUSE_DIR%"
    rem Just create a marker 'meteor' file rather than an active script
    echo "Meteor is installed in '%~dp0'" > "%METEOR_WAREHOUSE_DIR%\meteor"

    rem See warehouse.js for an outline of the warehouse structure
    mkdir "%METEOR_WAREHOUSE_DIR%\tools"
    mkdir "%METEOR_WAREHOUSE_DIR%\releases"
    mkdir "%METEOR_WAREHOUSE_DIR%\packages"
    rem XXX need to create sym links to installed release
)

set NODE_PATH=%~dp0\lib\node_modules
"%~dp0\bin\node.exe" "%~dp0\tools\meteor.js" %*