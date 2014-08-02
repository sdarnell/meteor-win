@echo on

pushd "%~dp0"

echo Compiling LaunchMeteor
%WINDIR%\Microsoft.NET\Framework\v3.5\csc.exe LaunchMeteor.cs /debug /nologo
copy LaunchMeteor.exe ..\..\meteor.exe

cd ..\..

rem Remove additional copy of npm node_modules
rd /s/q dev_bundle\bin\node_modules

echo Removing some excessive paths from the dev bundle
rd /s/q dev_bundle\lib\node_modules\npm\node_modules\request\node_modules\form-data\node_modules\combined-stream\node_modules\delayed-stream\test
rd /s/q dev_bundle\lib\node_modules\npm\node_modules\request\node_modules\form-data\node_modules\combined-stream\test

rd /s/q dev_bundle\lib\node_modules\request\node_modules\form-data\node_modules\combined-stream\node_modules\delayed-stream\test
rd /s/q dev_bundle\lib\node_modules\request\node_modules\form-data\node_modules\combined-stream\test

set NODE_PATH=%CD%\dev_bundle\lib\node_modules

where /q git.exe
if errorlevel 1 (
  echo Couldn't find git.exe on PATH
  popd
  goto:eof
)

echo Calling build-release.js
dev_bundle\bin\node.exe scripts\admin\build-release.js

if [%1] == [] (
  echo Skipping bootstrap package as release name not specified
) else (
  echo Building bootstrap package
  dev_bundle\bin\node.exe scripts\admin\build-bootstrap.js %1

  echo Copying LaunchMeteor.exe
  copy scripts\windows\LaunchMeteor.exe dist\public
)

popd