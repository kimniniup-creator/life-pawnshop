# 人生当铺 · 链接/服务器 排障 WORKLOG

## 2026-09-19 当前状态（结论先行）
- **游戏服务器：活着且有保护。** `node server.js`（PID 变动，当前由 `cmd /c run-server.bat` 循环托管）监听 `0.0.0.0:3000`，本机 `localhost:3000` 稳定 200，页面 `<title>人生当铺</title>`。run-server.bat 是崩溃自愈循环（node 挂了 3 秒重启），自启动项 `Startup\人生当铺服务器.lnk` → run-server.bat 完好。→ **Kim 说"服务器被杀"这条，现状是服务器没死。**
- **offerlai 公网隧道：外部打不开（已验证）。** `offerlai.tail43e9ca.ts.net` funnel 配置完整（`/`→3000，`/bian-agent`→4318，AllowFunnel on），但从 3 个独立外部服务端探测（r.jina.ai / codetabs / isitup）全部超时或 522；Kim 手机、经代理境外出口也超时。
- **根因（推断，证据强）：不是服务器被杀，是"公网入口 ↔ 这台机器"的 Tailscale 数据通道断了。** 节点 tailscaled 被 Windows 系统代理（127.0.0.1:7897，Vortex）逼着绕美国，netcheck 最近 DERP=洛杉矶 185ms、香港 278ms；ingress(美国)→本机 这一跳超时 → 外部一律 522/timeout。
- **已试无效：** 用户权限 `tailscale down/up` 重连（节点恢复 Running，funnel 配置未丢，但外部仍超时）。

## 关键事实/端口
- LAN IP 当前：192.168.5.2（会变）。3000 绑 0.0.0.0，同 WiFi 可直连（防火墙未确认放行）。
- 系统代理：HKCU ProxyEnable=1，ProxyServer=127.0.0.1:7897，bypass 列表**不含** tailscale/ts.net。用户级 env HTTPS_PROXY 也=7897。
- 备份：`_tmp` 下 serve-backup.json 存了完整 funnel 配置（可 `tailscale serve` 恢复）。

## 待决（需 Kim 授权/选择）
- 方案1(要管理员)：让 tailscaled 绕开代理直连 → 机器脚本 `_fixlink.ps1`（设 machine NO_PROXY + 重启 Tailscale 服务）。UAC 无法从本 agent 弹出，需 Kim 右键"以管理员身份运行"。注意：早前对比测试显示绕开代理后延迟改善有限（可能 Vortex 走 TUN 全局），此法未必彻底修好。
- 方案2(一键,无管理员)：Kim 在 Vortex 托盘关掉"系统代理"再看。
- 方案3(根治)：把游戏托管到国内可达服务器（Kim 之前 deferred 的 C 方案）。China 服务器 + China 观众 + 美国 ingress 的组合，Tailscale Funnel 天生脆。

## 没做/未验证
- 未擅自关 Kim 的系统代理（会中断她其它上网）。
- 未做浏览器截图 QA（隧道外部不通，截图无意义；服务器页面本机 200 已确认）。
