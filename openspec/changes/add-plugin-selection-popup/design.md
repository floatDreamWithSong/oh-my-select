## Context

oh-my-select 是 Tauri v2 桌面应用，目标体验是常驻托盘并在用户选中文本后出现最小化工具弹窗。旧 superpowers 文档已经把实现拆成 Rust 后端、React 设置界面和本地插件包三部分；本设计将其规范化为 OpenSpec 结构，保留已完成能力的架构边界。

## Goals / Non-Goals

**Goals:**

- 应用启动后静默进入托盘，通过托盘打开或聚焦设置窗口。
- 只处理拖选文本释放后的非空系统选中文本。
- 按用户配置顺序执行启用插件的同步 matcher，首个匹配插件拥有本次弹窗。
- 插件弹窗和插件设置页由插件自有 HTML 渲染，宿主只提供受限上下文和 bridge。
- 设置窗口支持语言偏好、插件导入、排序、启停、移除和插件设置页承载。
- 配置、插件副本和插件 storage 持久化在 app data 目录。

**Non-Goals:**

- 不实现插件市场、签名、审核、远程安装或 zip 导入。
- 不支持异步 matcher、键盘选择、双击选择或复杂选择来源。
- 不暴露泛化原生 invoke，也不让插件直接调用任意 Tauri command。
- 不实现动态弹窗 resize 或内置默认插件集合。

## Decisions

1. Rust 拥有系统级副作用，React 只负责宿主 UI。
   - 选择：`selection_monitor`、`plugin_registry`、`plugin_engine`、`popup_manager`、`plugin_protocol` 和 `settings_manager` 在 Rust 侧收敛。
   - 原因：全局输入、选中文本读取、文件导入、QuickJS 执行和窗口管理都是原生边界，放在 Rust 侧更容易限制权限。
   - 替代方案：在前端轮询或直接加载插件脚本。该方案无法可靠处理全局输入，也会扩大插件脚本权限。

2. 首版只支持本地可信插件文件夹。
   - 选择：用户导入本地文件夹，宿主复制到 app data 插件目录后再加载。
   - 原因：这能避免运行时依赖原路径，同时让 manifest 校验、重复 ID 拒绝和入口文件检查成为固定流程。
   - 替代方案：直接引用原文件夹或支持 zip/远程安装。它们会引入替换、签名、更新和权限审核问题，不属于首版。

3. matcher 使用同步 QuickJS 执行并按配置顺序短路。
   - 选择：每个启用插件导出 `match(context)`，返回 `true` 时立即停止后续匹配。
   - 原因：选中文本弹窗必须低延迟且结果确定；同步 matcher 易于限制超时和错误边界。
   - 替代方案：异步 matcher 或并行执行。它们需要加载状态、取消策略和优先级冲突处理，后续再扩展。

4. 插件视图通过自定义协议和 sandbox iframe 承载。
   - 选择：`oms-plugin://` 服务复制后的插件文件，并向 HTML 注入 `window.ohMySelect` bridge bootstrap。
   - 原因：宿主可控制文件来源、上下文注入和 bridge 方法集合。
   - 替代方案：直接把插件 HTML 嵌入宿主 DOM。该方案会扩大 CSS/JS 影响面，不利于隔离。

5. bridge 保持窄接口。
   - 选择：弹窗可 `closePopup()`，插件视图可按权限 `openExternal(url)` 和 `storage.*`。
   - 原因：插件能力应由 manifest 声明并由宿主检查，不能绕过权限边界。
   - 替代方案：暴露通用命令调用。它会让插件越过当前安全模型。

## Risks / Trade-offs

- 本地可信插件仍可运行用户提供的脚本 -> 通过 manifest 校验、复制目录、自定义协议、sandbox iframe 和窄 bridge 降低宿主暴露面。
- 同步 matcher 可能被耗时脚本阻塞 -> 首版约束 matcher 简单同步，后续可增加超时或异步 matcher 协议。
- 系统选中文本读取存在平台差异 -> 首版聚焦 Windows 拖选路径，并通过手动验收覆盖托盘、拖选、空文本和边缘定位。
- 弹窗尺寸来自插件 manifest -> 宿主必须校验宽高范围并做监视器边缘裁剪。
- 语言跟随系统可能失败 -> 解析失败时回退英文，并将 resolved locale 传给插件。
