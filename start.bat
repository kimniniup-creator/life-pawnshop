@echo off
chcp 65001 >nul
cd /d %~dp0

echo 正在启动人生当铺（服务器 + 公网通道，独立窗口运行，VS Code 关了也不受影响）...

REM 服务器：独立窗口 + 崩溃自动重启（node 崩了自动爬起来，通道链接不变）
start "人生当铺-服务器" run-server.bat

timeout /t 3 >nul

REM 公网通道：独立窗口，日志写进 tunnel.log
start "人生当铺-通道" cmd /k "title 人生当铺-公网通道（勿关） & cloudflared.exe tunnel --url http://localhost:3000 > tunnel.log 2>&1"

echo 正在等待公网链接（约 15 秒）...
timeout /t 15 >nul

REM 抓取链接、存进 url.txt、显示出来
powershell -NoProfile -Command "$u=(Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches.Value; if($u){Set-Content -Encoding utf8 url.txt $u}; Write-Host ''; Write-Host '===================================='; if($u){Write-Host ('  公网链接: ' + $u)} else {Write-Host '  链接还没出来，去“人生当铺-通道”窗口里找 trycloudflare.com 那行'}; Write-Host '  (已存到 url.txt，发给朋友即可)'; Write-Host '  本机自己玩: http://localhost:3000'; Write-Host '===================================='; Write-Host '  服务器/通道在各自独立窗口跑，VS Code 崩了也没事。'; Write-Host '  要停：关掉那两个窗口即可。'"

echo.
pause
