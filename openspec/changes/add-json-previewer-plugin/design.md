## Context

JSON 预览器是第三个示例插件，重点验证插件设置页和每插件 storage。它需要在 matcher、popup、settings 和测试之间复用 `json-core.js`，保证匹配逻辑、格式化逻辑和缩进校验不漂移。

## Goals / Non-Goals

**Goals:**

- 接受直接 JSON 对象和序列化 JSON 字符串字面量，其中解码内容必须是对象 JSON。
- 拒绝数组、primitive JSON、普通字符串、破损 JSON 和 JSON 值外的额外文本。
- 根据缩进设置格式化预览对象 JSON。
- 支持复制格式化对象 JSON 和紧凑序列化 JSON 字符串。
- 提供设置页配置 `indentSize`，有效范围为整数 0 到 8。
- 提供中英文 UI 文案和插件内自动化测试。

**Non-Goals:**

- 不把插件做成内置默认插件或自动安装插件。
- 不支持 JSON 数组、JSON5、注释、尾逗号或非标准 JSON。
- 不提供树形展开折叠、语法高亮、搜索、路径复制或 schema 校验。
- 不打开外部链接，不新增宿主 API 或外部依赖。

## Decisions

1. `json-core.js` 作为插件内共享核心。
   - 选择：matcher、popup、settings 和测试复用 `parseJsonObjectSelection`、`formatObject`、`serializeObject`、`normalizeIndent`、`indentOrDefault`。
   - 原因：同一份规则可以保证 matcher 与 popup 的接受范围一致，settings 的缩进校验也可独立测试。
   - 替代方案：各 HTML 或 matcher 内重复实现。会增加行为漂移和测试重复。

2. 只接受对象 JSON。
   - 选择：只有 `typeof value === "object"`、非 `null`、非数组的值才有效。
   - 原因：对象预览是本插件明确场景，数组和 primitive 容易改变 UI 与复制语义。
   - 替代方案：支持任意 JSON。会把插件变成通用 JSON viewer，超出首版范围。

3. 序列化字符串输入需要二次解析。
   - 选择：先把选中文本作为 JSON 字符串字面量解析，再把解码后的字符串解析为对象 JSON。
   - 原因：后端接口日志常包含转义后的 JSON 字符串，这一场景对开发者价值高。
   - 替代方案：只接受直接对象 JSON。会降低插件对真实开发文本的适配度。

4. settings 只保存一个数字配置。
   - 选择：`indentSize` 通过插件 storage 持久化，默认 2，0 表示紧凑单行。
   - 原因：这是验证 settings + storage 的最小有用配置。
   - 替代方案：增加主题、排序、序列化输出偏好。首版不需要。

## Risks / Trade-offs

- JSON 字符串字面量解析容易误接普通字符串 -> 必须要求解码后内容仍能解析成对象 JSON。
- storage 读取失败可能影响 popup -> popup 失败时使用默认缩进 2，而不是阻止预览。
- 大 JSON 可能撑破小弹窗 -> 预览区域固定高度并提供横向、纵向滚动。
- 复制 API 可能受 sandbox 限制 -> 保持浏览器剪贴板优先和 textarea fallback，并手动验证。
