@echo off
chcp 65001 >nul
cd /d %~dp0
title 人生当铺-服务器（勿关）
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set ALL_PROXY=http://127.0.0.1:7897
set NO_PROXY=localhost,127.0.0.1,::1
:loop
echo [%date% %time%] 启动服务器...
node server.js
echo.
echo [服务器退出了，3 秒后自动重启（这样崩了也能自己爬起来）...]
timeout /t 3 >nul
goto loop
