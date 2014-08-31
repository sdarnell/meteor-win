@echo off
setlocal EnableDelayedExpansion
set _METEOR_ROOT_=%~dp0
if exist "%_METEOR_ROOT_%.git" (
  rem In a checkout, run from the dev bundle
  set "NODE_PATH=%_METEOR_ROOT_%dev_bundle\lib\node_modules"
  "%_METEOR_ROOT_%dev_bundle\bin\node.exe" "%_METEOR_ROOT_%tools\main.js" %*
) else (
  rem In the warehouse, run the latest version
  if exist "%_METEOR_ROOT_%tools\latest" (
    set /p _LATEST_=<"%_METEOR_ROOT_%tools\latest"
    "%_METEOR_ROOT_%tools\!_LATEST_!\bin\meteor.bat" %*
  ) else (
    set "NODE_PATH=%_METEOR_ROOT_%..\lib\node_modules"
    "%_METEOR_ROOT_%node.exe" "%_METEOR_ROOT_%..\tools\main.js" %*
  )
)
