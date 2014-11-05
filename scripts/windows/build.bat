
@echo off

where /q git.exe
if not errorlevel 1 goto gotgit
if not exist "%ProgramFiles(x86)%\Git\bin\git.exe" (
  echo Couldn't find git.exe on PATH
  goto:eof
)

echo Adding '%ProgramFiles(x86)%\Git\bin' to your PATH
set PATH=%PATH%;%ProgramFiles(x86)%\Git\bin

:gotgit

@echo on

pushd "%~dp0"

echo Compiling LaunchMeteor
%WINDIR%\Microsoft.NET\Framework\v3.5\csc.exe LaunchMeteor.cs /debug /nologo
copy LaunchMeteor.exe ..\..\meteor.exe

cd ..\..

copy tools\package-version-parser.js packages\package-version-parser\package-version-parser.js /y


rem Remove additional copy of npm node_modules
rd /s/q dev_bundle\bin\node_modules

echo Removing some excessive paths from the dev bundle
rd /s/q dev_bundle\lib\node_modules\npm\node_modules\request\node_modules\form-data\node_modules\combined-stream\node_modules\delayed-stream\test
rd /s/q dev_bundle\lib\node_modules\npm\node_modules\request\node_modules\form-data\node_modules\combined-stream\test

rd /s/q dev_bundle\lib\node_modules\request\node_modules\form-data\node_modules\combined-stream\node_modules\delayed-stream\test
rd /s/q dev_bundle\lib\node_modules\request\node_modules\form-data\node_modules\combined-stream\test

echo Calling .\meteor.exe --get-ready
.\meteor.exe --get-ready

popd
