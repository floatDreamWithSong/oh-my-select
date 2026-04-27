## ADDED Requirements

### Requirement: Color converter plugin package

系统 SHALL 提供 `examples/plugins/color-converter` 示例插件，并通过 manifest 声明其名称、版本、matcher、popup 和禁用权限。

#### Scenario: Valid package metadata

- **WHEN** 用户导入 `examples/plugins/color-converter`
- **THEN** 插件 manifest SHALL 声明 ID `color-converter`、中英文名称、`matcher.js`、`popup.html`、合法弹窗尺寸，并关闭 `openExternal` 与 `storage` 权限

### Requirement: Conservative color matching

插件 matcher SHALL 只在选中文本是受支持 CSS 颜色值时返回 `true`。

#### Scenario: Accepted color values

- **WHEN** 选中文本为 `#fff`、`#FFFF`、`#22c55e`、`#22C55Ecc`、`rgb(34, 197, 94)`、`rgba(34, 197, 94, .8)`、`rgb(34 197 94 / 80%)`、`hsl(142 71% 45%)`、`hsla(142, 71%, 45%, .8)` 或 `oklch(0.72 0.19 149.6 / .8)`
- **THEN** matcher SHALL 返回 `true`

#### Scenario: Rejected color values

- **WHEN** 选中文本为 `hello`、`123456`、`rgb()`、`#12` 或 `#xyzxyz`
- **THEN** matcher SHALL 返回 `false`

### Requirement: Color parsing and conversion

插件 SHALL 将受支持输入解析为规范化 RGBA 颜色，并输出 HEX、RGB、HSL 和 OKLCH 四种格式。

#### Scenario: HEX normalization

- **WHEN** 输入为任意大小写 HEX 颜色
- **THEN** 插件 SHALL 解析短写和 alpha 通道，并输出大写 HEX；alpha 为 1 时输出 `#RRGGBB`，alpha 小于 1 时输出 `#RRGGBBAA`

#### Scenario: Functional color normalization

- **WHEN** 输入为受支持的 RGB、HSL 或 OKLCH 函数色值
- **THEN** 插件 SHALL 转换为同一颜色的 HEX、RGB、HSL 和 OKLCH 输出，并保持数值稳定可读

### Requirement: Popup color preview and copy UI

插件弹窗 SHALL 展示颜色预览、源信息、四行转换结果和逐行复制控件。

#### Scenario: Render parsed color

- **WHEN** popup 解析到有效颜色
- **THEN** 弹窗 SHALL 展示 swatch、源文本、源格式标签，以及 HEX、RGB、HSL、OKLCH 四个输出行

#### Scenario: Transparent swatch

- **WHEN** 解析颜色包含 alpha 小于 1
- **THEN** swatch SHALL 使用 checkerboard 底纹并覆盖实际透明色

#### Scenario: Copy converted value

- **WHEN** 用户点击某一输出行的复制按钮
- **THEN** 插件 SHALL 复制该行完整值，显示成功或失败状态，并保持弹窗打开

### Requirement: Localized accessible popup

插件 SHALL 根据 `window.ohMySelect.context.locale` 显示英文或中文文案，并提供可访问复制控件。

#### Scenario: Chinese locale

- **WHEN** 插件上下文 locale 为 `zh-CN`
- **THEN** 弹窗 SHALL 展示中文标题、源标签、复制标签、成功状态、失败状态、不支持 fallback 和关闭动作

#### Scenario: Accessible copy controls

- **WHEN** 弹窗渲染复制控件
- **THEN** 每个复制控件 SHALL 是真实 `button`，具有清晰 label、可见 focus 状态，并且状态反馈不只依赖颜色

### Requirement: Unsupported popup fallback

插件 SHALL 在 popup 权威解析失败时展示紧凑 fallback 状态。

#### Scenario: Popup parse failure

- **WHEN** matcher 与 popup 解析出现不一致，导致 popup 无法解析当前选中文本
- **THEN** 弹窗 SHALL 展示 `Unsupported color value` 对应本地化文案，并提供调用 `window.ohMySelect.closePopup()` 的关闭按钮
