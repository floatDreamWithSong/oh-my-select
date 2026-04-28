## ADDED Requirements

### Requirement: Time converter plugin package

系统 SHALL 提供 `examples/plugins/time-converter` 示例插件，并通过 manifest 声明 matcher、popup 和禁用权限。

#### Scenario: Valid package metadata

- **WHEN** 用户导入 `examples/plugins/time-converter`
- **THEN** 插件 manifest SHALL 声明 ID `time-converter`、中英文名称、`matcher.js`、`popup.html`、合法弹窗尺寸，并关闭 `openExternal` 与 `storage` 权限

### Requirement: Conservative time matching

插件 matcher SHALL 只在选中文本是受支持时间值时返回 `true`。

#### Scenario: Accepted time values

- **WHEN** 选中文本为 `1714298400`、`1714298400000`、`2026-04-28`、`2026-04-28 10:30:00`、`2026-04-28T10:30:00Z` 或 `Tue, 28 Apr 2026 10:30:00 GMT`
- **THEN** matcher SHALL 返回 `true`

#### Scenario: Rejected time values

- **WHEN** 选中文本为空、非字符串、`123456`、`2026`、`2026-02-30` 或 `hello`
- **THEN** matcher SHALL 返回 `false`

### Requirement: Time parsing and normalization

插件 SHALL 将受支持输入解析为一个有效 JavaScript `Date`，并记录 source kind 与用户可见解析上下文。

#### Scenario: Unix seconds input

- **WHEN** 输入为正好 10 位 ASCII 数字且在 JavaScript Date 范围内
- **THEN** 插件 SHALL 将其作为 Unix seconds，乘以 1000 后创建 Date，并标记 source kind `unix-seconds`

#### Scenario: Milliseconds input

- **WHEN** 输入为正好 13 位 ASCII 数字且在 JavaScript Date 范围内
- **THEN** 插件 SHALL 将其作为 Unix epoch milliseconds 创建 Date，并标记 source kind `milliseconds`

#### Scenario: Local formatted input

- **WHEN** 输入为无显式时区的有效日期或日期时间字符串
- **THEN** 插件 SHALL 按系统本地时区解析，并标记 source kind `local-string`

#### Scenario: Timezone-aware input

- **WHEN** 输入包含 `Z`、数字时区 offset 或时区名称
- **THEN** 插件 SHALL 按输入时区解析，并标记 source kind `timezone-string`

### Requirement: Equivalent time outputs

插件 SHALL 为解析后的 Date 输出六种稳定格式。

#### Scenario: Render six output rows

- **WHEN** popup 成功解析时间
- **THEN** 弹窗 SHALL 展示 Unix seconds、milliseconds、ISO 8601 UTC、local date time、local date 和 RFC 2822 六个输出行

#### Scenario: Stable local formats

- **WHEN** 弹窗生成 local date time 和 local date
- **THEN** local date time SHALL 使用零填充 `YYYY-MM-DD HH:mm:ss`，local date SHALL 使用零填充 `YYYY-MM-DD`

### Requirement: Time popup copy interaction

插件弹窗 SHALL 展示源值、解析上下文、时间预览和逐行复制控件。

#### Scenario: Copy row value

- **WHEN** 用户点击任一输出行复制按钮
- **THEN** 插件 SHALL 复制该行完整值，展示成功或失败状态，并保持弹窗打开

#### Scenario: Long output value

- **WHEN** 输出值过长
- **THEN** 弹窗 SHALL 在视觉上截断该值，并在 `title` 中保留完整值

### Requirement: Localized accessible time popup

插件 SHALL 根据 `window.ohMySelect.context.locale` 显示英文或中文文案，并提供可访问复制控件。

#### Scenario: Chinese locale

- **WHEN** 插件上下文 locale 为 `zh-CN`
- **THEN** 弹窗 SHALL 展示中文标题、源标签、解析上下文、行标签、复制标签、成功状态、失败状态、不支持 fallback 和关闭动作

#### Scenario: Accessible row controls

- **WHEN** 弹窗渲染输出行
- **THEN** 每个复制控件 SHALL 是真实 `button`，具有清晰 label、可见 focus 状态，并按视觉顺序参与 tab 导航

### Requirement: Unsupported time fallback

插件 SHALL 在 popup 权威解析失败时展示紧凑 fallback 状态。

#### Scenario: Popup parse failure

- **WHEN** popup 无法解析当前选中文本为受支持时间值
- **THEN** 弹窗 SHALL 展示 `Unsupported time value` 对应本地化文案，并提供调用 `window.ohMySelect.closePopup()` 的关闭按钮
