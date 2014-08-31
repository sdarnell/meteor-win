@echo off
setlocal
set "_NPM_DIR_=%~dp0"
"%_NPM_DIR_%node.exe" "%_NPM_DIR_%..\lib\node_modules\npm\bin\npm-cli.js" %*
title Meteor
