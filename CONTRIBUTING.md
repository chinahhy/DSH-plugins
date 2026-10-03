# 自制插件的统一流程

所有后续插件按同一条路线交付：源码进本仓库，开发在 develop，验证后通过 Publish plugin Action 提升到 main，首次向市场申请独立条目，后续由用户点击更新。

## 新插件

1. 在 packages/<插件名> 放独立 package.json、src、test、cordis.patch.yml、LICENSE 和 README。
2. 声明 dsh.bundle、exports、engines.dsh 与 dsh.compatibility。只写已经实测的版本；不要把官方核心包装为私有运行依赖。
3. 安装包需带 lib 构建产物，依赖项目内，禁止依赖安装时的 prepare/install 编译步骤。
4. 添加 plugins.json 条目及 docs/compatibility.md 实机记录，执行 node scripts/check.mjs。
5. 发布 Action 的 plugin 字段可直接输入新增插件名；校验器只允许 plugins.json 中的独立包。
6. 为每个插件添加 catalog/<owner>__<repo>--packages-<plugin>.yml，首次申请目录收录。

## 修改与发版

开工先保存 Git 回溯提交。功能修改在 develop，升级版本通过 Actions 的 version 输入完成；不要在 main 混入未验证代码。
Action 只提升所选插件及生成的版本表，不把其他仍在开发的插件一起发布。
初次版本可与未发版源码版本相同；已发布版本不可覆盖。失败可用相同输入重跑；若 main 在构建期间改变，重新运行，禁止强推。
实际包版本、源码提交、校验和与 GitHub Release 必须一致。发布动作不更新本机 DSH，也不代替市场目录审核。

## 首次市场收录

依据 [当前贡献要求](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，
将 catalog 中该插件的单个 YAML 添加到上游 data/plugins/ 后提交 PR。仓库须创建满一天、带 dsh-plugin topic、有真实代码与 bundle manifest。
现有 dshmarket 1.66.8 从 GitHub 子包提交检查更新，所以不添加 tarball: 字段。Release 包仍作为手动安装和回滚材料保存。
维护者合并后等待目录同步；常见同步时间是一天内，不能保证时限。后续发布不用重复提交目录 PR。

一个仓库保存多个插件时，每个插件是独立子目录条目，不上架只有依赖列表的聚合包。

## 用户数据

凭据、账户余额响应、本机 .dsh、会话正文、私钥与 Token 不进入源码、日志或 Release。
演示使用合成数据；发布只需要仓库自带 GITHUB_TOKEN，不新增长期 npm/PAT 密钥。
