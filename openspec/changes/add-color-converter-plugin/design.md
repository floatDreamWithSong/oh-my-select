## Context

颜色转换器是本地可信插件模型上的示例插件。它应证明插件可以在不修改宿主的前提下完成 matcher、解析、弹窗渲染、复制反馈和本地化文本。插件不带 settings 页面，也不需要 storage 或外链权限。

## Goals / Non-Goals

**Goals:**

- 匹配常见 CSS 颜色输入：`#rgb`、`#rgba`、`#rrggbb`、`#rrggbbaa`、`rgb()`、`rgba()`、`hsl()`、`hsla()`、`oklch()`。
- 解析输入并输出稳定、可读的 HEX、RGB、HSL、OKLCH 四种格式。
- 在弹窗中展示透明色可理解的 swatch 预览和逐行复制。
- 提供英文和中文 UI 文案。
- 插件实现完全留在 `examples/plugins/color-converter` 内。

**Non-Goals:**

- 不把插件做成内置默认插件或自动安装插件。
- 不支持 named colors、`hwb()`、`lab()`、`lch()` 或 `oklab()`。
- 不添加插件设置页、不使用 storage、不打开外部链接。
- 不新增宿主剪贴板 bridge 或外部 npm 依赖。

## Decisions

1. matcher 保守匹配，popup 再次权威解析。
   - 选择：matcher 只对支持语法返回 `true`，popup 仍重新解析 `selectedText`。
   - 原因：避免宿主为 popup 无法展示的值打开窗口，同时让 popup 对异常状态有兜底 UI。
   - 替代方案：matcher 返回解析结果。现有插件协议只定义布尔 matcher，不改变宿主 API。

2. 转换核心使用插件内纯 JavaScript 实现。
   - 选择：不引入外部库，按支持范围实现 RGB/HSL/OKLCH 与 sRGB 之间的转换。
   - 原因：示例插件应保持可审查、可复制、无安装步骤。
   - 替代方案：引入颜色库。会增加示例复杂度并偏离“本地文件夹插件”演示目标。

3. 复制优先使用浏览器能力。
   - 选择：点击按钮先尝试 `navigator.clipboard.writeText`，失败后尝试临时 textarea 和 `document.execCommand("copy")`。
   - 原因：当前宿主没有剪贴板 bridge，示例插件不应扩大宿主权限。
   - 替代方案：新增 host clipboard bridge。仅当 sandbox 中两条浏览器路径都不可用时才重新设计。

4. UI 采用紧凑工具面板。
   - 选择：顶部 swatch + 源信息，下面四行转换值，每行有复制按钮和状态。
   - 原因：弹窗尺寸小，用户核心任务是确认颜色并复制某种格式。
   - 替代方案：复杂调色盘或 hero 式展示。不适合选择弹窗的快速工具场景。

## Risks / Trade-offs

- OKLCH 到 sRGB 转换存在裁剪和精度取舍 -> 输出稳定可读值并在测试中覆盖典型 OKLCH 样本。
- 浏览器剪贴板 API 可能在 sandbox iframe 中受限 -> 保留 textarea fallback，并在手动验收中验证至少一条复制路径。
- matcher 和 popup 解析逻辑可能漂移 -> 测试需覆盖 accepted/rejected 样本，并确保 matcher 接受的值 popup 能展示。
- 透明色 swatch 可能不直观 -> 使用 checkerboard 背景加实际 alpha 覆盖层。
