@echo off
rem This script is run after building the dev_bundle and invokes
rem Meteor to install any NPM depdendencies.

set NODE_PATH=%~dp0\..\..\dev_bundle\lib\node_modules

if not exist "%NODE_PATH%" (
    echo NPM Modules directory doesn't exist
    echo  = %NODE_PATH%
    exit /b 1
)

"%~dp0\..\..\dev_bundle\bin\node.exe" "%~dp0\..\..\tools\meteor.js" --get-ready