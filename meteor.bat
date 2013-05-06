@echo off
setlocal
if exist "%~dp0.git" (
  rem In a checkout, run from the dev bundle
  set NODE_PATH=%~dp0dev_bundle\lib\node_modules
  "%~dp0dev_bundle\bin\node.exe" "%~dp0tools\meteor.js" %*
) else (
  set NODE_PATH=%~dp0lib\node_modules
  "%~dp0bin\node.exe" "%~dp0tools\meteor.js" %*
)
