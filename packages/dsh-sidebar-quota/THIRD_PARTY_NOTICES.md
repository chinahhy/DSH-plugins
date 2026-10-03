# 参考与第三方许可

本插件独立实现，开发时核对了以下 MIT 项目的接口、格式及错误处理，未整体复制任何插件：

- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/Han-1413141/dsh-cost-meter
- https://github.com/EasyTZ/dsh-ui-balance
- https://github.com/GPIOX/dsh-api-balance
- https://github.com/jacujay/dsh-model-balance
- https://github.com/WNJXYK/dsh-codex-oauth
- https://github.com/V1ki/dsh-plugin-subscriptions
- https://github.com/gooderno1/codex-usage-core

Zstandard 结构解析按格式描述独立实现；参考项目帮助核实 DSH 的多帧追加方式。
HTML 解析使用 Cheerio slim。构建时从实际参与 Host bundle 的依赖提取完整许可，
随安装包包含于 `lib/VENDOR_LICENSES.txt`。React 由 DSH 的 ModuleLoader 提供，未打包副本。

模型价格是官方公布的计价数据；价格源和抓取时间随缓存保存。节假日数据来源：
https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm 。
