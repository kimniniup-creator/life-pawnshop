@echo off
chcp 65001 >nul
cd /d %~dp0
title 人生当铺-服务器（勿关）
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set ALL_PROXY=http://127.0.0.1:7897
set NO_PROXY=localhost,127.0.0.1,::1
REM 结局小传模型：fable 在复杂提示词下常撞 150s 超时导致结局空白，改用更快的 haiku（实测 ~95s 出合格结局）
set LP_CLAUDE_MODEL=haiku
REM 结局生成超时（毫秒）：留足余量，避免多人同桌排队时被掐断
set LP_BIOS_TIMEOUT=240000
:loop
echo [%date% %time%] 启动服务器...
node server.js
echo.
echo [服务器退出了，3 秒后自动重启（这样崩了也能自己爬起来）...]
timeout /t 3 >nul
goto loop
