# dsh-sidebar-quota

在 DSH 左侧栏设置按钮上方，按 **DeepSeek → ChatGPT / Codex → MoonShot** 常驻展示额度与本机今日估算消费。

## 兼容范围

目标版本为本机官方 **DSH 0.2.0-rc.2**，Node.js 24+。使用该版本的 `webServer.register`、
`credentials.resolve/readRecord`、`window.__ModuleLoader__` 和 root scope 的
`sidebar.footer.action`。不修改 DSH 核心源码，不依赖动态 Cordis `harness.handle`。
兼容声明限定已验证版本；升级 DSH 后应重新验证，不能把这个声明当作未来版本保证。

## 功能

- DeepSeek：今日消费、人民币 API 余额、峰谷状态、下一阶段倒计时。
- ChatGPT / Codex：5h 与 Weekly 的**剩余**额度，四档颜色及重置时间提示。
- MoonShot API：今日消费、可用余额。
- 每家名称右侧提供手动刷新与独立展开/折叠按钮；折叠后仍可刷新。
- 折叠选择在当前 DSH 页面来源中记忆，刷新页面、切换会话或收起整个侧栏后保留。

Host 复用 DSH Credential Service：DeepSeek 默认或 Provider 配置的 `apiKeyEnv`；
MoonShot 的 `llm-pi-ai/moonshotai[-cn]` API-key record 和既有 Key 引用；
Codex 的 pi-ai grant、`dsh-codex-subscription` 已选账户与 OAuth 引用。
不会提供重复填写 Key 的页面，不读取或写入其他客户端的登录文件，不旋转 refresh token。
OAuth 过期显示 `--`，由已有登录插件负责续期。

## 消费口径

今日消费根据**本机 DeepSeek Harness Session 日志和模型价格计算**，是估算值，
不是 Provider 官方账单，不包含其他电脑、其他客户端和 Provider 官网产生的调用。
“今日”按 DSH Host 系统时区的本地 00:00 到当前时间定义。

统计当前最高版本的 `session[.vN].jsonl[.zstd]`，支持压缩多帧增量续读、残缺尾帧、
日志重写和 fork 继承排除。只保留当天的最小计费字段，不持久化聊天正文。
当前版本的 input、cacheRead、cacheWrite 是**互斥**桶，不会再次从 input 扣除 cacheRead。
读取 `assistant/message` 及其 stream usage、携带 usage 的失败 attempt、旧 chunk 和压缩摘要；不把其他 Provider 的用量算入。
无 Session 日志的外部调用不属于这个口径。

未知模型、日志损坏或无法确定的缓存写入 TTL 显示 `*` 并提供警示 tooltip；
全部无法计价时显示 `-- *`，部分可计价时显示已计价部分。绝不把未知模型默认为零元。

## 定价与刷新

DeepSeek 官方中文价表：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/ 。
按官方北京时间星期、时段、周末和节假日规则判定，每次调用按自身时间选择价格快照。
成功获取的新价格从观察到它的时刻生效，不用新价重写先前调用。官方未给出更早生效时间时，
离线期间的价格变化无法追溯，统计仍是估算值。
两家的内置表以 2026-10-03 核实日 00:00 作为本机估算基线，并非声明官方在此时调价；
更早的调用若没有当时的本地快照，不倒推历史价格。

价表每 6 小时同步；失败保留上次成功规则，首次未同步使用带日期的官方本地表，tooltip 标注状态。
节假日日历目前已核实 **2026 年**国务院安排；未知年份的工作日显示规则待确认，不猜节假日。
调休的周末仍遵循 DeepSeek 明示的周一至周五规则。

MoonShot 从 https://platform.kimi.com/docs/pricing/chat.md 同步官方表；失败保留明确维护的本地表。
目前维护 kimi-k3、kimi-k2.7-code、kimi-k2.7-code-highspeed、kimi-k2.6。
K3 写入 TTL 无法从通用 DSH usage 分辨时标为无法计价。

余额、Codex 每 5 分钟更新，首次启动立即查询；新 assistant 事件后 2 秒复查日志，
Codex 调用后同时刷新额度。全局日志每 20 秒增量检查。Client 每 5 秒只读取本机数字快照，
每 30 秒本地更新倒计时，切换会话不重建全局 store、不触发上游全量请求。

名称旁的刷新按钮立即查询**对应服务商**的余额或额度，API 分区同时复查本机今日消费；
不等待 5 分钟周期，不会顺带查询另外两家，也不额外触发公共价表同步。
刷新期间按钮显示进度并禁止重复点击，Host 对每家请求设 3 秒间隔；
失败用红色按钮和安全提示标记，Codex 旧百分比清除为 `--`，可再次点击恢复。
自动刷新周期不受折叠影响。按钮支持键盘操作和减少动画设置。

Codex quota 使用当前 ChatGPT `backend-api/wham/usage` endpoint，
**它不是公开稳定 API**，未来上游变化可能需要更新插件。只根据 `18000` / `604800`
秒识别窗口；缺少 5h 不复用旧值。请求失败或超过 10 分钟未成功更新显示 `--`。

## 安全与数据位置

所有凭据、API 请求、日志解析和金额计算均在 Host。HTTP response 仅含数字、状态和安全提示。
不返回 Key、access/refresh token、Cookie 或上游错误正文。外部请求有超时并拒绝重定向。
状态读取与刷新路由仅接受本机 loopback、合法 Host 和同源请求；刷新必须为带同源 Origin 的 POST，
只允许三家预设 Provider。当前版本不支持远程 LAN 页面读额度。

安装后仅新增 `$DSH_HOME/storages/dsh-sidebar-quota/` 中的非敏感价格历史缓存。
增量游标保存在内存，插件重启后重新扫描当天相关日志。没有 Browser Storage 凭据缓存。
浏览器 `dsh-sidebar-quota:collapsed:v1` 仅保存三家分区的折叠布尔值；清除此项可重置为全部展开。
浏览器存储不可用时仍可操作，选择仅在当前插件生命周期中保留。

## 开发与构建

从本仓库根目录执行：

```sh
npm ci --prefix packages/dsh-sidebar-quota --ignore-scripts --cache .cache/npm
npm run check --prefix packages/dsh-sidebar-quota
```

安装时使用仓库已提交的 lib 构建产物，无 prepare/install 编译脚本。React 复用 DSH 宿主。

## 安装与更新

在 DSH 插件市场首次安装本仓库的 dsh-sidebar-quota 条目，后续点击“更新”。市场目录首次收录仍需维护者合并申请。
CLI 安装（完全退出正式桌面端后）：

```sh
dsh plugin --profile desktop add 'github:chinahhy/DSH-plugins#path:/packages/dsh-sidebar-quota'
```

macOS 官方桌面端没有配置 dsh 命令时，可使用应用自带 CLI：

```sh
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' plugin --profile desktop add 'github:chinahhy/DSH-plugins#path:/packages/dsh-sidebar-quota'
```

web 用户把 profile 换成 web。安装/更新后按 DSH 提示刷新或重启。
已经通过本地 link/file 安装的用户，需先把该插件安装源切换为上述 GitHub 子目录；本地 link 不会自动跟随 GitHub 更新。
本插件会复用宿主凭据，不需要重新填写 Key。

卸载：退出 DSH，执行 `dsh plugin --profile desktop remove dsh-sidebar-quota` 后启动。
只在需要彻底清理时删除该插件专用价格缓存；不要删除 DSH 会话或原有凭据。

## 验证边界

已在官方 DSH 0.2.0-rc.2 的本机独立 profile 完成安装、启动与 19 项浏览器检查；
原始版本完成三家 Provider 的真实账户只读查询；当前开发版 41 项单元测试、严格类型检查与构建通过，
另在同版隔离 DSH 完成 19 项刷新/折叠交互检查（合成数据），包括状态记忆、单家查询、失败恢复和布局。
正式 desktop profile 已完成原生启动与侧栏加载检查；完整业务验收由 Hoya 完成。
CI 每次发布重新执行类型检查、单元测试和构建，不能替代新 DSH 版本的实机验证。
界面示例使用合成数据，不发布账户余额、凭据或会话日志。

后续开发和发版统一参照仓库根目录 [README](../../README.md) 与 [贡献说明](../../CONTRIBUTING.md)。
