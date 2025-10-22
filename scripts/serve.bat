@echo off
setlocal
pushd "%~dp0\.."
py -3 -m scripts.serve %*
popd
