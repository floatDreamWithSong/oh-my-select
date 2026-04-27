## Why

oh-my-select 需要把“系统级选中文本触发本地插件”的核心能力沉淀为稳定契约：应用应在后台常驻，捕获用户拖选文本，并由本地插件决定是否接管本次选择。该能力是后续示例插件和 AI Coding 插件开发约束的基础。

## What Changes

- 新增托盘优先启动行为：应用启动时保持静默，用户可从托盘打开或聚焦设置窗口。
- 新增全局拖选文本检测链路：鼠标拖选释放后读取系统选中文本，并对空文本静默结束。
- 新增本地可信插件模型：从本地文件夹导入插件，校验 `manifest.json`、`matcher.js`、`popup.html` 和可选 `settings.html`。
- 新增按用户配置顺序执行的同步 matcher 链路，首个返回 `true` 的启用插件接管选择。
- 新增插件自有弹窗运行时，按 manifest 尺寸创建靠近光标且不越界的弹窗。
- 新增设置窗口：系统设置、插件导入、排序、启停、移除和插件设置页宿主。
- 新增受限 `window.ohMySelect` bridge，向插件弹窗和设置页提供上下文、关闭弹窗、打开外链和命名空间 storage 能力。

## Capabilities

### New Capabilities

- `plugin-selection-popup`: 本地插件导入、排序、同步匹配、动态弹窗、设置页宿主和受限插件 bridge。

### Modified Capabilities

无。

## Impact

- Rust 后端：Tauri v2 托盘、全局鼠标监听、系统选中文本读取、插件注册表、QuickJS matcher、弹窗管理、自定义协议、配置和插件 storage。
- React 前端：设置 shell、系统设置页、插件 iframe 宿主、弹窗 route、bridge 消息处理、基础 i18n。
- 示例资源：新增 `examples/plugins/quick-search` 作为端到端手动验证插件。
- 安全边界：首版只支持本地可信插件，不提供远程市场、签名、泛化 Tauri invoke 或异步 matcher。
