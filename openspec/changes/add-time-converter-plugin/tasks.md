## 1. Matcher

- [x] 1.1 创建插件目录并编写 matcher 测试，覆盖 10 位秒、13 位毫秒、格式化日期和拒绝样本。
- [x] 1.2 实现 `matcher.js` 的保守同步匹配逻辑。
- [x] 1.3 验证 matcher 测试通过，并确认短数字、年号、非法日期和自然语言文本被拒绝。

## 2. Time Core

- [x] 2.1 编写 `time-core.js` 测试，覆盖 timestamp、无时区本地字符串、带时区字符串、非法日期和六种输出。
- [x] 2.2 实现时间解析、source kind、解析上下文、非法日期 round-trip 和输出格式化。
- [x] 2.3 确保 local date time 与 local date 使用零填充稳定格式。

## 3. Plugin Package And Popup

- [x] 3.1 创建 manifest、`time-core.js`、matcher 和 popup 文件。
- [x] 3.2 实现时间 badge、源值、解析上下文、六行输出、逐行复制和 row-level 状态。
- [x] 3.3 实现中英文文案、可访问按钮、长值截断和 unsupported fallback。
- [x] 3.4 运行插件包校验和全部 time converter 测试。

## 4. Documentation

- [x] 4.1 添加插件 README，说明支持输入、输出格式、示例值和手动检查步骤。
- [x] 4.2 更新根 README 示例插件列表并复核文档引用。

## 5. Final Verification

- [x] 5.1 运行聚焦插件测试、完整测试、TypeScript 检查和 lint。
- [x] 5.2 手动导入插件，验证 accepted 样本打开弹窗、rejected 样本不打开弹窗、六行输出和复制交互。
- [x] 5.3 复核最终 diff，确认没有修改宿主 API、权限模型或无关文件。
