@echo off
setlocal
set _METEOR_ROOT_=%~dp0
if exist "%_METEOR_ROOT_%.git" (
  rem In a checkout, run from the dev bundle
  set "NODE_PATH=%_METEOR_ROOT_%dev_bundle\lib\node_modules"
  "%_METEOR_ROOT_%dev_bundle\bin\node.exe" "%_METEOR_ROOT_%tools\meteor.js" %*
) else (
  set "NODE_PATH=%_METEOR_ROOT_%lib\node_modules"
  "%_METEOR_ROOT_%bin\node.exe" "%_METEOR_ROOT_%tools\meteor.js" %*
)
