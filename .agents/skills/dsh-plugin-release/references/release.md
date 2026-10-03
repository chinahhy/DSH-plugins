# 发布与市场收录

以下命令在插件源码仓库根目录执行，云端与本地相同。任务入口先核对当前 `plugins.json`、目标包和 `.github/workflows/publish.yml`；维护本流程时参考仓库 [CONTRIBUTING.md](../../../../CONTRIBUTING.md)，不要复制整套脚本进 Skill。

## 开发与验证

- 修改放在 `develop`，先确认 Git 状态与已发布 `main` 的差异；不要覆盖遗留工作或把其他开发中的插件一起发布。
- 新包位于 `packages/<name>`，具有独立 bundle patch、Host/Client exports、测试、许可证和预构建 `lib`；将其登记到 `plugins.json`、兼容性记录及 `catalog/`。已有仓库校验器要求无运行依赖及 prepare/install/postinstall；若确需改变此约束，先给出证据并调整检查。
- 普通修改执行 `node scripts/check.mjs`；它使用项目内 npm 缓存并运行类型、测试、构建与 README 检查。若改了台账或描述，用 `node scripts/readme.mjs` 生成 README。新宿主或功能变化另做相应运行验证。
- 版本在 Actions 的 `version` 输入提升，使用新的稳定 `x.y.z`，核对当前 main 和已有标签，不能回退或覆盖；开发时包/台账/README 保持一致。
- 检查差异和打包清单。仅源码、合成测试与必要公开资料可上传；不推送管理仓库的备份、实际用户数据或历史日志。按明确路径提交并推送 develop；记录开发提交 SHA。

## 触发并验证 Actions

仅在任务授权发布时执行。GitHub 连接器优先；缺少匹配功能或权限时，使用已有登录的 gh，不主动换权限或新建长期 Token。CLI 身份检查与网络限制分开诊断。

网页入口：[Publish plugin](https://github.com/chinahhy/DSH-plugins/actions/workflows/publish.yml)。入口分支选 `main`，输入 `plugin`、新 `version`、`source_ref`。建议把 source_ref 固定为刚验证并推送的开发 SHA；网页默认 develop 也可使用。

已有这三个经核实变量时，等价调用为：

```sh
gh workflow run publish.yml --repo chinahhy/DSH-plugins --ref main \
  -f plugin="$PLUGIN_NAME" -f version="$NEXT_VERSION" -f source_ref="$SOURCE_SHA"
```

工作流在 Linux/macOS 验证选定包，只提升该包、台账及生成 README 到 main，再创建 tag、tgz 与 SHA256SUMS。使用 GitHub 提供的短期发布凭据，不需要模型 Key 或 npm/PAT 新凭据。

记录本次精确 run ID，按输入/开发 SHA/触发时间确认归属；检查两个构建 job 及发布 job 的实际完成结果。不要用另一条成功运行或 pnpm 的 Done 代替本次最终退出结果。

成功后核对 main 包/台账/README 的版本、`${plugin}-v${version}` 标签及 Release；在项目 `tmp/` 下载并验证校验和。无新疑点时不重复全量测试。若任务包含安装，按获准范围另做实机验证。

失败先诊断具体 job：修正后可重跑；main 构建期间变化时重新核对后重跑，已有发行包内容冲突时使用新版本，禁止覆盖或强推。相同未修正失败不无限重试；保留可审阅证据并说明阻塞。

## 首次收录与以后更新

首次新增插件：读上游当前 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，向 `awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/` 提交该插件单个条目。用户授权投稿后才创建 PR，创建成功将其附加到本会话。

截至 2026-10-03 的已验证路径：每个子包独立条目，url 指向 `https://github.com/chinahhy/DSH-plugins/tree/main/packages/<name>`；仓库带 dsh-plugin topic。dshmarket 1.66.8 从 GitHub 提交检查更新，未绑定 npm 的 Release tarball 不独立检查新版，故当前条目不设 tarball。市场版本变化时读取其实际 sources/updates 实现后再选安装来源。

年龄门槛和 PR 状态实时查询；当唯一失败是 repo-age 且 gate 明确会自动复查时，不重复投稿或关闭重开。等待维护者合并及目录同步，不将时间门槛满足称为已上架。已有相同条目先检查现有 PR，避免重复。

条目被收录后的普通发版无需再次提交目录 PR，除非条目内容本身改变。GitHub 直装可在上架前进行，已安装页按该来源检查提交；本地 link/file 需要一次性切换来源。正式来源迁移及重启是独立运行态动作，按会话授权和项目规则执行，保留回滚材料。

一个仓库 main 的提交也可能使其他 GitHub 子包提示更新；包版本独立，不能把提示等同于该插件功能改动。普通发布不会自动改变本机安装。
