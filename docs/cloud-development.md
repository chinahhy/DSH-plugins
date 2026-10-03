# 云端开发与本机验收

插件的开发源为 `chinahhy/DSH-plugins`。在 Codex Cloud 中选择该仓库建立仅自己可用的环境；日常任务从 develop 开始，使用仓库的 AGENTS.md 和发布 Skill。

## 环境准备

使用 Node.js 24+ 和 npm，不需要 DSH 模型 Key。环境准备执行：

```sh
node scripts/cloud-setup.mjs
node scripts/check.mjs
```

前者按现有锁文件安装开发依赖，禁用安装脚本，缓存留在 `.cache/npm`；后者执行已存在的类型、合成测试、构建和 README 校验。网络仅开放必要包管理器和 GitHub，不连接个人 DSH 账户。GitHub 写入使用云端已授权的仓库连接或已有登录工具，不为迁移新增长期密钥。

环境准备成功后发布环境。新任务使用已准备的文件系统，既有任务保留自己的状态；完成的源码必须提交并推送，不能只留在云端聊天内。实际操作以 [官方 Cloud environments 文档](https://learn.chatgpt.com/docs/environments/cloud-environments) 和当时 UI 为准。

## 日常流程

1. 在 develop 修改指定插件，使用 `.agents/skills/dsh-plugin-release/SKILL.md`，验证并提交。
2. 通过 Publish plugin Action 从 main 入口发布新版本，source_ref 使用已测试并推送的提交 SHA。
3. 核实 Linux/macOS 构建、发布任务和发行文件校验和。
4. 用户在 DSH 检查更新、点击更新，在 Mac 验收原生侧栏和真实账号查询。

只调整云端说明、Skill 或共用脚本时，不为此提升插件版本。共享文件独立同步 main 与 develop；现有插件发布器不会将它们一起提升。

## 验收边界

| 工作 | 执行位置 | 必须有的证据 |
| --- | --- | --- |
| 类型、合成测试、构建、包结构 | 云端 / Actions | 当前提交对应的实际完成结果 |
| DSH 新版接口核对 | 云端可分析官方对应版本源码 | 接口差异与受影响功能清单 |
| 正式安装、原生刷新/折叠、真实账号查询 | 用户的 Mac | 当前 DSH 与插件版本、实际交互及脱敏结果 |
| 扩大兼容声明 | 实机证据齐全后提交 | 对应版本的运行验证，CI 不能替代 |

当前已验证版本见 [compatibility.md](compatibility.md)。云端没有本机访问时，不把运行验证写成已完成。

## 文件保存

- GitHub 保存插件源码、锁文件、预构建 lib、Skill、文档和发行记录。
- 独立私有管理仓库保存经检查的变更和验证记录，原始备份、真实会话及凭据仍留本地。
- node_modules、`.cache`、tmp、build 是可重建材料；迁移验证前保留本地，之后按需要清理。
- `.dsh` 及其登录状态是正式应用数据，不是项目缓存；迁移源码不搬迁这些数据。

本机清理与云端环境创建分开验收。GitHub 是持久开发源；云端环境是工作空间。
