# oh-my-select

oh-my-select 是一个托盘优先的 Tauri 桌面应用。它监听用户在系统任意应用里的拖拽选中文本，并把这段文本交给本地插件链判断：第一个匹配成功的插件会在鼠标附近渲染自己的弹窗视图。

> 注：运行环境主要面向 Windows ，尚未在 MacOS 生产环境进行过测试，请谨慎使用。

## 项目背景

很多文本处理动作都发生在“选中一段内容之后”：搜索关键词、转换颜色值、识别时间戳、格式化 JSON、翻译或复制为另一种格式。传统做法通常要在当前应用和浏览器、命令行、小工具之间切换，动作路径长，而且难以按个人习惯扩展。

oh-my-select 的目标是把这些动作前移到选中文本的现场：

- 应用默认隐藏在系统托盘，不打断当前工作流。
- 用户只需要在任意应用中拖拽选中文本。
- 本地插件按用户配置的顺序匹配文本。
- 匹配成功后，插件拥有自己的弹窗 UI、设置页和轻量存储。

当前版本采用本地可信插件模型。插件来自用户导入的本地文件夹或随应用打包的示例插件，应用负责校验 manifest、复制插件目录、执行 matcher、托管插件视图，并通过窄 bridge 暴露必要能力。

## 架构设计

整体架构分为四层：原生运行时、插件运行时、前端宿主界面和持久化配置。

```text
系统鼠标事件
  -> selection_monitor 读取选中文本
  -> plugin_engine 按顺序执行 matcher.js
  -> popup_manager 创建选择弹窗窗口
  -> React PopupHost 托管插件 HTML
  -> window.ohMySelect bridge 调用受限宿主能力
```

### Rust 原生侧

Rust 侧负责所有靠近系统能力和安全边界的工作。

- `selection_monitor` 通过 `monio` 监听全局鼠标事件，并使用 `selection` crate 读取系统选中文本。
- `plugin_registry` 负责插件导入、manifest 校验、启停、排序和移除。
- `plugin_engine` 使用 `rquickjs` 在受限 QuickJS 运行时中同步执行插件 `matcher.js`，并按配置顺序返回第一个匹配插件。
- `popup_manager` 创建无边框、置顶、不进任务栏的动态 Tauri Webview 弹窗，并按显示器边界修正弹窗位置。
- `plugin_protocol` 注册 `oms-plugin://` 自定义协议，只从已安装插件目录加载资源，并向 HTML 注入 `window.ohMySelect` bridge。
- `settings_manager` 持久化应用配置、插件列表和每个插件独立的 JSON 存储。
- `commands` 暴露设置页和插件 bridge 需要的 Tauri command，并校验 `openExternal`、`storage` 等权限。

### React 前端侧

React 侧负责宿主 UI 和插件视图容器。

- `SettingsShell` 提供设置窗口的侧边栏和主内容区。
- `SystemSettings` 管理语言、窗口关闭行为、内置插件导入、自定义插件导入、启停、排序和删除。
- `PluginSettingsHost` 渲染插件声明的设置页。
- `PopupHost` 渲染选中文本触发的插件弹窗。
- `PluginFrame` 使用 sandbox iframe 托管插件 HTML，并通过 `postMessage` 分发 bridge 请求。

插件 HTML 不直接访问 Tauri 全局对象。宿主只注入 `window.ohMySelect`，并按 manifest 权限决定是否允许打开外部链接或读写插件存储。

### 插件模型

插件是一个本地文件夹，典型结构如下：

```text
my-plugin/
  manifest.json
  matcher.js
  popup.html
  settings.html
```

`settings.html` 是可选文件。`manifest.json`、`matcher.js` 和 `popup.html` 是必需文件。

```json
{
  "id": "quick-search",
  "name": {
    "zh-CN": "快速搜索",
    "en": "Quick Search"
  },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": {
    "entry": "popup.html",
    "width": 360,
    "height": 220
  },
  "settings": {
    "entry": "settings.html"
  },
  "permissions": {
    "openExternal": true,
    "storage": true
  }
}
```

`matcher.js` 需要导出同步 `match(context)` 函数，并且只有严格返回 `true` 才算匹配成功。

```js
export function match(context) {
  return context.selectedText.trim().length > 0
}
```

插件视图可通过 `window.ohMySelect.context` 读取当前上下文，包括选中文本、语言、插件 ID、插件版本和应用版本。设置页没有选中文本，弹窗页才会收到 `selectedText`。

bridge 当前提供：

- `closePopup()`：仅用于弹窗页。
- `openExternal(url)`
- `storage.get(key)`
- `storage.set(key, value)`
- `storage.remove(key)`

## 技术路线

oh-my-select 选择 Tauri v2 作为桌面外壳，是为了把系统级输入监听、托盘、窗口管理、文件系统和前端 UI 解耦。Rust 侧承担原生能力和插件边界，React 侧保持为可测试的宿主界面。

核心技术选择：

- Tauri v2 + Rust 2021：桌面壳、托盘、动态窗口、自定义协议和原生命令。
- `monio` + `selection`：监听拖拽选择并读取系统选中文本。
- `rquickjs`：执行插件 matcher，设置内存、栈和超时边界。
- React 19 + TanStack Router：设置窗口和弹窗入口路由。
- Tailwind CSS v4 + shadcn/ui 基础组件：构建紧凑的桌面设置界面。
- Vitest + Testing Library：覆盖前端 bridge、设置页和插件宿主行为。
- Cargo test：覆盖插件注册、协议解析、matcher、弹窗定位和配置持久化。

当前技术边界：

- 插件模型是本地可信模型，不包含市场、签名、审核或远程安装。
- matcher 当前只支持同步函数。
- 插件导入当前以文件夹为单位，不支持 zip 包。
- 文本触发路径当前面向拖拽选中，不覆盖键盘选择和双击选择。

## 内置示例插件

示例插件位于：

```text
examples/plugins
```

已包含：

- `quick-search`：匹配非空文本，显示选中文本并打开可配置搜索 URL。
- `color-converter`：匹配 CSS 颜色值，预览颜色并复制 HEX、RGB、HSL、OKLCH。
- `time-converter`：匹配常见时间值，并转换 Unix 秒、毫秒、ISO UTC、本地时间和 RFC 2822。
- `json-previewer`：匹配 JSON 对象或序列化 JSON 对象字符串，格式化预览并复制不同输出形式。

## 开发运行

当前仓库包含 `bun.lock`，Tauri 配置也使用 Bun 作为前端 dev/build 命令入口。

安装依赖：

```bash
bun install
```

运行桌面应用：

```bash
bun run tauri dev
```

应用启动后默认隐藏在系统托盘。点击托盘图标打开 Settings，导入 `examples/plugins` 下的插件文件夹后，在其他应用中拖拽选中文本即可触发匹配弹窗。

## 验证命令

常用检查命令：

```bash
bun run typecheck
bun run lint
bun run test
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

如果只修改 README 或文档，至少检查 Markdown diff，确认描述仍与源码中的模块、命令和示例插件一致。

## AI Coding 支持

本项目内置了面向 Codex 的本地技能说明：`.codex\skills\oh-my-select-plugin`。它是给 AI Coding 代理使用的项目约束文档，用于在创建、更新、审查或测试插件时保持一致的实现边界。

这个技能会提示代理优先复用现有插件协议，而不是随意扩展宿主 API。它覆盖的关键内容包括：

- 插件包契约：`manifest.json`、`matcher.js`、`popup.html`、可选 `settings.html`，以及插件 ID、路径、弹窗尺寸和权限校验规则。
- matcher 规则：`matcher.js` 在 Rust 侧 QuickJS 中运行，只接受同步逻辑，并且必须严格返回布尔值 `true` 才能命中。
- 插件视图 bridge：说明 `window.ohMySelect.context`、`closePopup()`、`openExternal(url)` 和 `storage.*` 的可用视图、权限要求与使用边界。
- 插件 UX 约束：弹窗必须适配 manifest 声明的固定尺寸，用户可见文案应按 `locale` 本地化，复制和保存动作需要可感知反馈。
- 测试建议：优先在插件目录内补充 `plugin-package.test.js`、`matcher.test.js`、`*-core.test.js`、`popup.test.js` 和 `settings.test.js`，并使用 `bun run test examples/plugins/<plugin-id>` 做局部验证。

因此，当后续通过 AI 生成新插件或修改示例插件时，应先让代理读取该技能文件，再根据现有 `quick-search`、`color-converter`、`time-converter`、`json-previewer` 示例选择最接近的实现路径。若需求需要新增 bridge 方法、权限或 Tauri command，应把它视为宿主协议变更，而不是普通插件改动。
