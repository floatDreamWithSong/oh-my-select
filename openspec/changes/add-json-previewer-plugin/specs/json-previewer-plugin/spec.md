## ADDED Requirements

### Requirement: JSON previewer plugin package

系统 SHALL 提供 `examples/plugins/json-previewer` 示例插件，并通过 manifest 声明 matcher、popup、settings 和 storage 权限。

#### Scenario: Valid package metadata

- **WHEN** 用户导入 `examples/plugins/json-previewer`
- **THEN** 插件 manifest SHALL 声明 ID `json-previewer`、中英文名称、`matcher.js`、`popup.html`、`settings.html`、合法弹窗尺寸、`storage: true` 和 `openExternal: false`

### Requirement: JSON object selection parsing

插件 SHALL 只接受直接 JSON 对象或序列化 JSON 字符串字面量，且最终值必须是 JSON 对象。

#### Scenario: Direct object JSON

- **WHEN** 选中文本为 `{"name":"oh-my-select","enabled":true}` 或带周围空白的对象 JSON
- **THEN** 插件 SHALL 解析为 source kind `object`，并保留原始 trimmed 文本

#### Scenario: Serialized object JSON string

- **WHEN** 选中文本为 `"{\"name\":\"oh-my-select\",\"enabled\":true}"`
- **THEN** 插件 SHALL 先解码字符串字面量，再解析其内容为对象 JSON，并标记 source kind `serialized-string`

#### Scenario: Unsupported JSON values

- **WHEN** 选中文本为数组、字符串、数字、布尔值、`null`、破损 JSON、普通文本或对象 JSON 后跟随额外非空白文本
- **THEN** 插件 SHALL 返回不支持结果

### Requirement: Conservative JSON matcher

插件 matcher SHALL 复用对象解析规则，并只在对象解析成功时返回 `true`。

#### Scenario: Matcher accepts object forms

- **WHEN** `context.selectedText` 是直接对象 JSON 或有效序列化对象 JSON 字符串
- **THEN** matcher SHALL 返回 `true`

#### Scenario: Matcher rejects non-string or unsupported values

- **WHEN** `context.selectedText` 不是字符串，或字符串不是受支持对象 JSON
- **THEN** matcher SHALL 返回 `false`

### Requirement: Formatted preview and copy outputs

插件弹窗 SHALL 根据缩进设置展示格式化对象 JSON，并提供反序列化对象 JSON 与序列化 JSON 字符串两种复制输出。

#### Scenario: Default formatted preview

- **WHEN** storage 中没有有效 `indentSize`
- **THEN** 弹窗 SHALL 使用 2 个空格格式化对象 JSON 预览

#### Scenario: Compact indentation

- **WHEN** storage 中 `indentSize` 为 `0`
- **THEN** 弹窗 SHALL 以紧凑单行 JSON 展示预览，并用同样格式复制反序列化对象 JSON

#### Scenario: Copy deserialized JSON

- **WHEN** 用户点击复制反序列化 JSON
- **THEN** 插件 SHALL 复制按当前缩进格式化的对象 JSON

#### Scenario: Copy serialized JSON

- **WHEN** 用户点击复制序列化 JSON
- **THEN** 插件 SHALL 复制包含紧凑对象 JSON 的 JSON 字符串字面量

### Requirement: JSON indentation settings

插件设置页 SHALL 允许用户配置 `indentSize`，并只保存 0 到 8 之间的整数。

#### Scenario: Load indentation setting

- **WHEN** 设置页加载
- **THEN** 插件 SHALL 从 `window.ohMySelect.storage.get("indentSize")` 读取值，展示有效值，否则展示默认值 `2`

#### Scenario: Save valid indentation

- **WHEN** 用户输入 `0`、`2`、`4` 或任一 0 到 8 的整数并保存
- **THEN** 插件 SHALL 将规范化数字保存到 storage key `indentSize` 并展示成功反馈

#### Scenario: Reject invalid indentation

- **WHEN** 用户输入空值、负数、小数、大于 8 的数或非数字文本
- **THEN** 插件 SHALL 展示校验错误，并且 SHALL NOT 保存该值

### Requirement: Stable accessible JSON popup

插件弹窗 SHALL 使用紧凑开发工具布局，并确保长 JSON 不改变弹窗整体尺寸。

#### Scenario: Long JSON preview

- **WHEN** 解析对象包含长 key、长 value 或深层嵌套
- **THEN** 预览区域 SHALL 使用固定高度、monospace、`white-space: pre`，并提供水平和垂直滚动

#### Scenario: Localized accessible controls

- **WHEN** 弹窗或设置页渲染
- **THEN** 可见文案 SHALL 跟随 `window.ohMySelect.context.locale`，复制按钮 SHALL 是真实 `button`，状态区域 SHALL 使用 `aria-live="polite"`

### Requirement: JSON fallback and failure handling

插件 SHALL 对解析、storage 和复制失败提供局部反馈，不扩大宿主 API。

#### Scenario: Popup parse failure

- **WHEN** popup 无法解析当前选中文本为受支持 JSON 对象
- **THEN** 弹窗 SHALL 展示本地化的 unsupported JSON object 状态，并提供关闭按钮

#### Scenario: Storage read failure

- **WHEN** popup 读取 `indentSize` 失败
- **THEN** 弹窗 SHALL 使用默认缩进 `2` 继续渲染

#### Scenario: Clipboard failure

- **WHEN** 两条浏览器复制路径均失败
- **THEN** 弹窗 SHALL 保持打开并展示复制失败状态
