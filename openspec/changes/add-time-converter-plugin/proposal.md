## Why

需要一个时间类示例插件来验证 oh-my-select 对常见开发文本的快速识别和格式转换能力。时间转换器覆盖数字时间戳、格式化日期字符串、本地/UTC 输出、逐行复制和严格拒绝模糊输入，同时不改变宿主插件协议。

## What Changes

- 新增 `examples/plugins/time-converter` 示例插件。
- 插件匹配 10 位 Unix 秒、13 位毫秒时间戳，以及可安全解析的常见日期或日期时间字符串。
- 弹窗把输入规范化为一个 JavaScript `Date`，展示 Unix seconds、milliseconds、ISO 8601 UTC、local date time、local date、RFC 2822 六种输出。
- 每个输出行支持独立复制并显示状态。
- 新增插件 README 和根 README 示例插件说明。

## Capabilities

### New Capabilities

- `time-converter-plugin`: 时间值匹配、时间解析规范化、六种格式输出、逐行复制和示例插件文档。

### Modified Capabilities

无。

## Impact

- 示例插件目录：`examples/plugins/time-converter/manifest.json`、`matcher.js`、`time-core.js`、`popup.html`、README 和插件测试。
- 验证：matcher、time-core、插件包校验、复制交互和手动导入验收。
- 宿主边界：不新增 settings、storage、外链权限、宿主 command 或外部依赖。
