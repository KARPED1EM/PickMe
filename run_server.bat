@echo off
setlocal
pushd "%~dp0"
py -3 run_server.py %*
popd
