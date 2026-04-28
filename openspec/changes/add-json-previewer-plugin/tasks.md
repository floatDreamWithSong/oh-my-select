## 1. JSON Core

- [x] 1.1 创建插件目录和 `json-core.js` 测试。
- [x] 1.2 实现对象 JSON、序列化对象 JSON 字符串、格式化、序列化输出和缩进校验。
- [x] 1.3 验证 arrays、primitive、broken JSON、额外文本和非法缩进均被拒绝。

## 2. Matcher

- [x] 2.1 编写 matcher 测试，覆盖直接对象、序列化对象字符串和拒绝样本。
- [x] 2.2 实现 matcher 复用 `json-core.js` 的解析规则。
- [x] 2.3 验证 matcher 可通过 Rust QuickJS 引擎执行。

## 3. Popup

- [x] 3.1 编写 popup 测试，覆盖直接对象、序列化字符串、缩进读取和双复制按钮。
- [x] 3.2 实现弹窗标题、source kind、原始值、固定尺寸预览区、复制反序列化 JSON 和复制序列化 JSON。
- [x] 3.3 实现中英文文案、`aria-live` 状态、复制成功失败反馈和 unsupported fallback。

## 4. Settings Page

- [x] 4.1 编写 settings 测试，覆盖默认值、有效保存、非法拒绝和中文标签。
- [x] 4.2 实现 `indentSize` 数字输入、0 到 8 整数校验、storage 保存和保存反馈。

## 5. Manifest And Package Validation

- [x] 5.1 创建 manifest，声明 popup、settings 和 storage 权限。
- [x] 5.2 编写插件包校验测试，确认引用文件存在、HTML 可加载核心脚本、控件可访问。
- [x] 5.3 运行 JSON Previewer 全部插件测试。

## 6. Documentation And Final Verification

- [x] 6.1 添加插件 README，说明支持输入、拒绝输入、复制语义、缩进设置和手动检查步骤。
- [x] 6.2 更新根 README 示例插件列表。
- [x] 6.3 运行聚焦插件测试、仓库测试、TypeScript 检查、lint 和 Rust matcher 集成测试。
- [x] 6.4 手动验证导入、设置保存、accepted/rejected 样本、source kind、双复制输出和长 JSON 滚动。
