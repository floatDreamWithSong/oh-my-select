## 1. Matcher

- [x] 1.1 为受支持和拒绝的颜色输入编写 matcher 测试。
- [x] 1.2 实现 `matcher.js` 的保守同步匹配逻辑。
- [x] 1.3 验证 HEX、RGB/RGBA、HSL/HSLA 和 OKLCH 样本匹配结果。

## 2. Conversion Core

- [x] 2.1 编写颜色解析和转换测试，覆盖 alpha、短 HEX、函数语法和 OKLCH。
- [x] 2.2 实现颜色规范化、HEX 输出、RGB 输出、HSL 输出和 OKLCH 输出。
- [x] 2.3 确保输出格式稳定、可读，并对非法输入返回不支持结果。

## 3. Plugin Package And Popup UI

- [x] 3.1 创建 `examples/plugins/color-converter` 的 manifest、matcher 和 popup 文件。
- [x] 3.2 实现 swatch、源信息、四行转换结果、复制按钮和逐行状态。
- [x] 3.3 实现中英文文案、可访问按钮、可见 focus 和透明色 checkerboard。

## 4. Documentation And Verification

- [x] 4.1 添加插件 README，说明支持输入、示例值和手动检查步骤。
- [x] 4.2 更新根 README 示例插件列表。
- [x] 4.3 运行聚焦插件测试和仓库验证命令。
- [x] 4.4 手动导入插件，验证 accepted 样本打开弹窗、rejected 样本不打开弹窗、复制路径可用。

## 5. Final Review

- [x] 5.1 复核最终 diff，确认没有修改宿主 API、权限模型或无关文件。
- [x] 5.2 记录自动验证和手动验证结果。
