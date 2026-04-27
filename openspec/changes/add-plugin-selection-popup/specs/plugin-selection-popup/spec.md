## ADDED Requirements

### Requirement: Tray-first application lifecycle

应用 SHALL 在启动时保持设置窗口隐藏，并创建可用于打开或聚焦设置窗口的系统托盘入口。

#### Scenario: Silent startup

- **WHEN** 用户启动 oh-my-select
- **THEN** 系统 SHALL 创建托盘图标，并且主设置窗口 SHALL 不自动显示

#### Scenario: Open settings from tray

- **WHEN** 用户点击托盘入口
- **THEN** 系统 SHALL 打开或聚焦设置窗口

### Requirement: Drag selection monitoring

系统 SHALL 监听全局鼠标拖选行为，在拖选释放后读取系统选中文本，并对空文本静默结束。

#### Scenario: Non-empty selected text

- **WHEN** 用户完成超过阈值的鼠标拖选并释放左键
- **THEN** 系统 SHALL 等待选区稳定、读取非空选中文本，并把文本传入插件匹配流程

#### Scenario: Empty selected text

- **WHEN** 系统读取到空选中文本
- **THEN** 系统 SHALL 不打开弹窗并静默结束本次流程

#### Scenario: Close previous popup on next press

- **WHEN** 已存在选中文本弹窗且用户再次按下鼠标左键
- **THEN** 系统 SHALL 关闭已有选中文本弹窗

### Requirement: Local plugin registry

系统 SHALL 支持从本地文件夹导入插件，复制到应用插件目录，并校验插件 manifest、必需入口文件、尺寸、ID 和启用顺序。

#### Scenario: Valid plugin import

- **WHEN** 用户导入包含 `manifest.json`、`matcher.js` 和 `popup.html` 的有效插件文件夹
- **THEN** 系统 SHALL 复制插件文件夹、记录插件元数据，并在设置窗口中展示该插件

#### Scenario: Invalid plugin import

- **WHEN** 用户导入缺少必需文件、manifest 结构无效、ID 重复或弹窗尺寸非法的插件
- **THEN** 系统 SHALL 拒绝导入并在设置窗口中展示校验错误

#### Scenario: Plugin ordering and enabled state

- **WHEN** 用户调整插件顺序或启停状态
- **THEN** 系统 SHALL 持久化该顺序和状态，并在后续匹配中只按该顺序执行启用插件

### Requirement: Synchronous matcher chain

系统 SHALL 按配置顺序执行启用插件的同步 `match(context)`，并让首个返回 `true` 的插件接管本次选中文本。

#### Scenario: First matching plugin wins

- **WHEN** 多个启用插件都可能匹配同一段选中文本
- **THEN** 系统 SHALL 只选择配置顺序中第一个返回 `true` 的插件

#### Scenario: Matcher error continuation

- **WHEN** 某个插件 matcher 执行失败
- **THEN** 系统 SHALL 记录该插件错误并继续执行后续启用插件

#### Scenario: No plugin matches

- **WHEN** 所有启用插件都返回 `false` 或执行失败
- **THEN** 系统 SHALL 不打开弹窗

### Requirement: Plugin-owned popup runtime

系统 SHALL 为匹配插件创建动态弹窗，加载该插件的 `popup.entry`，并根据插件 manifest 和光标位置控制窗口尺寸、位置与外观。

#### Scenario: Popup creation

- **WHEN** 插件 matcher 返回 `true`
- **THEN** 系统 SHALL 创建 frameless、always-on-top、skip-taskbar、non-resizable 的动态弹窗并加载该插件弹窗页

#### Scenario: Monitor-aware placement

- **WHEN** 光标靠近显示器边缘
- **THEN** 系统 SHALL 对弹窗位置做边缘裁剪，使弹窗保持在当前显示器可见区域内

### Requirement: Plugin context and bridge

系统 SHALL 向插件弹窗和插件设置页提供 `window.ohMySelect`，其中包含当前上下文和受限 bridge 方法。

#### Scenario: Popup context

- **WHEN** 插件弹窗加载完成
- **THEN** `window.ohMySelect.context` SHALL 包含 `selectedText`、`locale`、`languagePreference`、`pluginId`、`pluginVersion` 和 `appVersion`

#### Scenario: Narrow bridge methods

- **WHEN** 插件调用 bridge
- **THEN** 系统 SHALL 只提供允许的 `closePopup()`、`openExternal(url)` 和 `storage.get/set/remove` 能力，不提供泛化原生命令调用

### Requirement: Settings shell and plugin settings host

设置窗口 SHALL 使用侧边栏加主内容布局，展示系统设置和已安装插件，并承载插件可选设置页。

#### Scenario: Sidebar routes

- **WHEN** 设置窗口打开
- **THEN** 侧边栏 SHALL 先展示系统设置，再按当前插件顺序展示已安装插件

#### Scenario: Plugin without settings page

- **WHEN** 用户打开没有 `settings.entry` 的插件路由
- **THEN** 主内容区域 SHALL 展示无设置页的空状态

#### Scenario: Plugin settings load failure

- **WHEN** 插件设置页加载失败
- **THEN** 主内容区域 SHALL 展示插件设置不可用状态

### Requirement: Persistent app and plugin state

系统 SHALL 在 app data 目录持久化宿主配置、已安装插件副本和每个插件独立的 storage。

#### Scenario: Config persistence

- **WHEN** 用户更改语言偏好、插件顺序或启用状态
- **THEN** 系统 SHALL 将这些配置写入持久化配置，并在下次启动后恢复

#### Scenario: Namespaced plugin storage

- **WHEN** 插件通过 bridge storage 写入键值
- **THEN** 系统 SHALL 按插件 ID 隔离该数据，避免不同插件共享同一 storage 命名空间
