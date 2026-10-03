---
name: dsh-plugin-release
description: "维护 chinahhy/DSH-plugins 自制插件库：新增插件、DSH 升级后的兼容核验、GitHub Actions 发布及市场首次收录。适用于该仓库的云端与本地维护。"
---

# DSH 插件发布

本 Skill 随插件源码仓库保存。从本目录上溯三层是仓库根目录，以 `plugins.json`、`packages/` 和 origin `chinahhy/DSH-plugins` 核实定位；不依赖个人电脑的绝对路径。

## 按任务取资料

- 修改、发布或新增插件：读 [release.md](references/release.md)。
- DSH 升级或扩大兼容声明：读 [compatibility.md](references/compatibility.md)，需要发布时再读 release.md。
- 云端环境准备或迁移：读仓库 [docs/cloud-development.md](../../../docs/cloud-development.md)。
- 仅询问流程或状态：读取必要字段即可，不触发发布。相同宿主/市场版本可复用带日期的证据；版本变化重查接口。

## 共同入口

1. 按仓库 [AGENTS.md](../../../AGENTS.md) 检查状态、遗留工作与 Git 回溯。一次只提交本次明确路径。
2. 从 `plugins.json` 定位插件、版本和已验证 DSH。云端可读对应版本官方源码和脱敏记录；真实宿主状态必须由本机核实。
3. 复用 `scripts/check.mjs`、`scripts/readme.mjs` 和既有发布 workflow，依赖、缓存和证据留在仓库内，不重写版本提升流程。
4. 按当前任务授权推进。使用 Skill 不单独授权真实凭据上传、正式机安装、重启或新的访问权限。

## 保留的约束

- develop 开发，Actions 从 main 入口发布选定插件；安装源提交预构建 lib，已发布版本不可覆盖。
- Actions 只提升选定包、plugins.json 和生成 README；共用文档、Skill、脚本及工作流需要另行同步 main，不能误称随插件自动发布。
- 兼容范围只写实测版本；云端类型/测试/构建不能替代正式 DSH 的实际加载与功能验证。
- 凭据、真实账户响应、会话正文和认证 URL 不进入 Git、日志、Release 或 Actions。检查只输出脱敏摘要。
- GitHub 来源的线上检查与公共市场可搜索是独立状态；本地 link 不自动更新。普通 GitHub 发布不改变本机安装。

交付报告给出版本、提交、相应验证及仍待本机或外部处理的步骤。Skill 本身不安排后台任务。
