@echo off
if exist "%~dp0\.git" (
  rem In a checkout, run from the dev bundle
  set NODE_PATH=%~dp0\dev_bundle\lib\node_modules
  "%~dp0\dev_bundle\bin\node.exe" "%~dp0\tools\meteor.js" %*
) else (
  set NODE_PATH=%~dp0\lib\node_modules
  "%~dp0\bin\node.exe" "%~dp0\tools\meteor.js" %*
)
