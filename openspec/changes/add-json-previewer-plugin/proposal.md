## Why

oh-my-select 需要一个面向开发者的示例插件来验证更复杂的插件能力：共享核心解析逻辑、popup 与 settings 复用同一 storage、双复制输出、插件内测试和文档。JSON 预览器覆盖这些路径，同时仍然不需要修改宿主 API。

## What Changes

- 新增 `examples/plugins/json-previewer` 示例插件。
- 插件只匹配 JSON 对象，支持直接对象 JSON 和“解码后仍是对象 JSON”的序列化字符串字面量。
- 弹窗格式化预览 JSON 对象，并支持复制反序列化对象 JSON 和序列化 JSON 字符串。
- 新增插件设置页，用 `window.ohMySelect.storage` 配置缩进大小，默认 2，范围 0 到 8。
- 新增插件 README 和根 README 示例插件说明。

## Capabilities

### New Capabilities

- `json-previewer-plugin`: JSON 对象匹配、解析、格式化预览、双复制输出、缩进设置、插件 storage 和插件级测试文档。

### Modified Capabilities

无。

## Impact

- 示例插件目录：`examples/plugins/json-previewer/manifest.json`、`matcher.js`、`json-core.js`、`popup.html`、`settings.html`、README 和插件测试。
- 宿主能力复用：使用现有 popup、settings host、storage bridge 和插件协议。
- 验证：matcher、json-core、popup、settings、插件包校验和 QuickJS matcher 集成。
- 宿主边界：不支持数组、JSON5、注释、搜索、折叠树、外链或新 bridge。
