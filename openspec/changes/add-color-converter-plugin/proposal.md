## Why

插件运行时完成后，需要一个更贴近日常前端开发的示例插件来验证本地插件协议、matcher、弹窗 UI、复制交互和多语言文本。颜色转换器可以覆盖非平凡解析、格式转换和透明色预览，同时不需要扩展宿主 API。

## What Changes

- 新增 `examples/plugins/color-converter` 示例插件。
- 插件在选中文本是受支持 CSS 颜色值时出现。
- 支持 HEX、RGB/RGBA、HSL/HSLA 和 OKLCH 输入，并输出 HEX、RGB、HSL、OKLCH 等价值。
- 在弹窗中展示颜色 swatch、源格式、转换列表和逐行复制按钮。
- 使用现有插件协议和浏览器剪贴板路径，不新增宿主 command、bridge 或外部依赖。

## Capabilities

### New Capabilities

- `color-converter-plugin`: 颜色值匹配、解析、格式转换、颜色预览、逐行复制和示例插件文档。

### Modified Capabilities

无。

## Impact

- 示例插件目录：`examples/plugins/color-converter/manifest.json`、`matcher.js`、`popup.html`。
- 文档：插件 README 和根 README 的示例插件列表。
- 验证：插件包校验、颜色解析转换测试、手动导入与复制路径验证。
- 宿主边界：不修改 Tauri command、插件协议、bridge 方法或权限模型。
