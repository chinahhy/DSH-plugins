# 兼容性记录

| 插件 | 已验证 DSH | Node | 实机证据 | 未验证边界 |
| --- | --- | --- | --- | --- |
| dsh-sidebar-quota | 0.2.0-rc.2 | 24+ | 2026-10-03 独立 profile 19 项浏览器检查、37 项单元测试、三家真实账户只读查询、正式 desktop 原生侧栏加载 | 新版 DSH、远程 LAN 页面、完整用户业务验收 |

package.json 的 engines.dsh 与 dsh.compatibility 均限定 0.2.0-rc.2。
自动发布只验证代码和包结构；扩大 DSH 兼容范围必须先核对对应版本接口并记录实机检查，不通过放宽版本声明消除兼容报错。
Codex wham/usage 属于未公开稳定的上游接口；上游变动可能需要插件更新。
