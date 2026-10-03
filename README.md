# Hoya 的 DSH 插件库

自用 DeepSeek Harness 插件源码与发布仓库。每个插件独立维护版本、兼容声明、测试和安装入口。
所有后续插件统一采用 **开发分支 → Actions 验证/发布 → GitHub 正式源码 → DSH 市场点击更新** 的流程。

## 自制插件列表

| 插件 | 当前版本 | 已验证 DSH | 功能 | 发布 |
| --- | --- | --- | --- | --- |
| [dsh-sidebar-quota](packages/dsh-sidebar-quota) | 0.1.4 | 0.2.0-rc.2 | DeepSeek、ChatGPT / Codex、MoonShot 的余额、剩余额度和本机今日估算消费，支持手动刷新与独立折叠。 | [dsh-sidebar-quota-v0.1.4](https://github.com/chinahhy/DSH-plugins/releases/tag/dsh-sidebar-quota-v0.1.4) |

列表由 plugins.json 生成；发布 Actions 自动更新版本，不手工维护两份台账。

## 版本需求

目前侧栏插件只承诺官方 **DSH 0.2.0-rc.2**，Node.js **24+**；macOS 官方桌面端使用 desktop profile。
web profile 使用相同 Host/Client 接口。包的 engines.dsh 和 dsh.compatibility 均限定实测版本。
新版 DSH 必须核对接口并实机验证后再扩大兼容范围。CI 绿灯不能代替实机兼容检查。
详细记录见 [兼容性记录](docs/compatibility.md)。

## 首次安装与后续更新

市场为本机已使用的 [dshmarket](https://github.com/dsh-market/dsh-market)，目录来自
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。首次收录需要维护者合并条目申请。
目录支持 monorepo 子目录；每个自制插件单独上架，不把整个仓库作为聚合插件安装。

1. 条目收录后，在 DSH 插件市场找到 dsh-sidebar-quota 并安装。
2. 新版通过本仓库 Actions 发布后，在 DSH 中检查更新并点击“更新”，按提示刷新或重启。
3. 已经以本地 link/file 装过的版本，需要**一次性切换到 GitHub 安装源**；本地链接不会自动跟随 GitHub。

市场尚未收录时，可以完全退出桌面端后执行：

```sh
dsh plugin --profile desktop add 'github:chinahhy/DSH-plugins#path:/packages/dsh-sidebar-quota'
```

macOS 的应用自带 CLI 路径见 [插件安装说明](packages/dsh-sidebar-quota/README.md#安装与更新)。
正式 profile 操作前先保留可回滚配置；凭据与会话不上传到本仓库。

## 在 GitHub Actions 发布

1. 在 develop 分支提交插件修改；main 是已经验证并发布的安装源。
2. 打开 [Actions → Publish plugin](https://github.com/chinahhy/DSH-plugins/actions/workflows/publish.yml)，点 **Run workflow**。
3. 选择插件名，填写新的版本号，例如 0.1.2；source_ref 默认 develop。工作流入口选择 main。
4. Actions 执行类型检查、单元测试、构建和包检查，成功后只把所选插件提升到 main，自动更新本表并创建版本标签/Release。
5. DSH 市场根据 GitHub 提交检查更新；用户点击“更新”即可。**每次发版无需重新申请上架。**

安装源提交 lib 构建产物，无需用户运行 prepare/install 编译脚本。Release 的 tgz 和 SHA256SUMS 用于下载、校验与回退。
当前市场 1.66.8 没有独立的 GitHub Release 包版本检查，因此目录条目使用 GitHub 子目录源码，未配置 tarball 安装优先项。
一个 monorepo 的 main 提交也可能使其他已安装的 GitHub 子包提示更新；实际包版本仍可在插件配置中核对。

发布工作流不需要 npm 账号或长期 Token。首次收录所需 YAML 保存在 [catalog](catalog/)。
目录要求仓库创建满一天；本仓库创建于 2026-10-03 13:30:05（北京时间），2026-10-04 13:30:05 后满足年龄条件。
申请合并、目录同步与本地首次切换安装源是独立步骤；Actions 发布成功不等于已上架或已自动更新本机。

## 余额与消费刷新

| 数据 | 刷新周期 |
| --- | --- |
| DeepSeek / MoonShot 余额、Codex 剩余额度 | 每 5 分钟；启动和凭据变化立即查询 |
| Codex 调用后的额度 | assistant 事件后约 2 秒额外查询 |
| 本机今日估算消费 | 每 20 秒增量扫描；assistant 事件后约 2 秒复查 |
| 侧栏显示 | 每 5 秒读取本机快照，不会每 5 秒请求厂商 |
| DeepSeek / MoonShot 官方价表 | 每 6 小时 |
| 峰谷倒计时 | 每 30 秒本地更新 |

余额来源于 Provider，今日消费仅根据本机 DSH 日志估算，不包含其他设备或其他客户端。
上游额度请求失败或长时间未更新会显示不可用状态；Codex 登录续期由已有登录插件处理。

## 开发与新增插件

源码在 packages/<plugin-name>，开发依赖和缓存留在仓库内。执行：

```sh
node scripts/check.mjs
```

新增插件：添加独立包、plugins.json 条目、测试和兼容性记录，再按 [贡献说明](CONTRIBUTING.md) 发布与申请收录。
只保存自制插件和必要公开证据，不提交 DSH 凭据、账户响应、聊天日志或本机设置。

## 云端开发

日常开发可在 Codex Cloud 进行，电脑休眠也能继续。选择本仓库准备仅自己可用的环境，使用 Node.js 24+，执行 node scripts/cloud-setup.mjs 和既有检查脚本。
仓库自带 [发布 Skill](.agents/skills/dsh-plugin-release/SKILL.md) 与 [云端开发说明](docs/cloud-development.md)，不依赖个人电脑目录。
源码和发布在云端完成；正式 DSH 安装、真实账号查询及 macOS 原生验收仍在用户电脑执行。云端测试通过不会自动扩大兼容声明。
插件凭据、本机 .dsh 和真实会话不上传。已完成工作提交并推送 GitHub，云端聊天保存不能替代 Git。

## 许可证

MIT。打包的第三方许可证随各插件一起提供。
