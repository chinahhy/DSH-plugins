# DSH 更新后的兼容核验

用户报告 DSH 更新，或发布前发现实机版本变化时使用。这里只检查 `plugins.json` 登记的自制插件；任务另有范围时遵从用户要求。后台监控需单独安排，Skill 本身不调度任务。

## 先确定真实版本

本机读取实际应用 Info.plist、捆绑 CLI/Node 与所用 profile；市场版本读取实际安装包。云端无法访问实机时，先分析官方对应版本源码，列出待本机核实项，不假定远端容器拥有正式 DSH。安装路径、端口、profile 和接口以实机为准，不把旧台账直接当事实。

截至 2026-10-03 的验证基线是官方 DSH 0.2.0-rc.2、Node 24+、dshmarket 1.66.8，详见仓库 [docs/compatibility.md](../../../../docs/compatibility.md)。这是复查起点，不是“所有新版本兼容”的保证。

获取官方对应版本的发布说明和源码/接口，针对变动只检查相关依赖：Host credentials/webServer、Client 的侧栏注入与生命周期、日志及 usage 格式、CLI/bundle/包来源。不要只查询 npm latest 或依赖市场徽章；也不要通过放宽 engines.dsh 消除报错。

0.2.0-rc.2 的历史修复：Client 不提供可注入的 styles 服务，使用 slots 挂载并管理独立 style 标签。新版需要重新确认服务，不照搬旧假设。Codex wham/usage 的上游响应也可能单独变化。

## 隔离验证与修复

隔离 home、profile、缓存和证据全部放仓库 `tmp/`，复用当前应用的官方 runtime。默认使用合成数据；不复制正式凭据文件、真实会话或带认证参数的 URL 到证据。

每个受影响自制插件按功能验证：

- 包元数据、bundle、Host/Client 均能实际激活，诊断无相关缺失服务。
- UI 正常加载、卸载/重载，主题和侧栏布局正确；功能变化有相应交互证据。
- 余额、额度、reset 时间、失败和过期状态解析正确；估算统计适配该版日志而不重复计数。
- HTTP 和浏览器返回值不包含 Key/OAuth；既有凭据只读复用，公开包与打包清单不含用户数据。

先修复再重新跑相关类型/单元/构建检查及运行验证；已有不受影响检查无需无故重复。安装实验不能改正式 profile，正式更新与重启按用户授权执行。

若捆绑 pnpm 版本仍为已验证的 11.7.0，超时使用原生数值参数 `--fetch-timeout=30000 --fetch-retries=1`；不要使用已证明会把数值变成字符串的 `--config.fetch-timeout=15000`。其他版本先核对帮助与实际接口。确认官方 CLI 最终退出、实际安装与 bundle，不能仅看 Done。

## 更新声明并发布

只有取得实际验证证据后，同步该包 `engines.dsh`、`dsh.compatibility.dsh`、`dshReleases`、`plugins.json` 的 dshVersions 与 `docs/compatibility.md`，再生成 README。保留已经实测的旧版本，仅新增实测版本；其他未验证版本保持明确边界。

需发布时读 [release.md](release.md) 并使用已有 Actions。报告逐插件结果、宿主版本、源码及测试证据；未修复或未验证的项目明确列出，不保证“零兼容错误”。GitHub 发布成功、市场可更新与正式机已验证分别确认。
