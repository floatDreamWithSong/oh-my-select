## 1. App Shell And Native Runtime

- [x] 1.1 配置 Tauri v2 托盘、静默启动、窗口能力和必要后端依赖。
- [x] 1.2 实现全局拖选监听、系统选中文本读取、拖选阈值和选区稳定等待。
- [x] 1.3 实现动态弹窗创建、唯一窗口 label、尺寸校验和显示器边缘裁剪。

## 2. Plugin Registry And Persistence

- [x] 2.1 定义插件 manifest、宿主配置、插件上下文和 command DTO。
- [x] 2.2 实现本地插件导入、复制、manifest 校验、重复 ID 拒绝和删除。
- [x] 2.3 实现插件顺序、启停状态、语言偏好和每插件 storage 持久化。

## 3. Matcher And Protocol

- [x] 3.1 使用 QuickJS 执行同步 matcher，并按启用插件顺序短路匹配。
- [x] 3.2 在 matcher 报错时记录插件错误并继续后续插件。
- [x] 3.3 实现 `oms-plugin://` 插件文件协议和 bridge bootstrap 注入。

## 4. Settings And Popup Frontend

- [x] 4.1 实现设置窗口 shell、系统设置页、插件列表、导入、排序、启停和移除 UI。
- [x] 4.2 实现插件设置页 iframe host、无设置页空状态和加载失败状态。
- [x] 4.3 实现插件弹窗 route、共享 plugin frame 和 bridge 消息处理。
- [x] 4.4 实现宿主中英文基础 i18n，并把 resolved locale 传给插件视图。

## 5. Example Plugin And Documentation

- [x] 5.1 创建 `examples/plugins/quick-search` 的 manifest、matcher、popup 和 settings 示例。
- [x] 5.2 更新 README，说明开发命令、示例插件导入和本地插件模型。

## 6. Verification

- [x] 6.1 覆盖 Rust 单元测试：manifest 校验、重复 ID、排序启停、matcher 短路、错误继续、无匹配静默和配置读写。
- [x] 6.2 覆盖前端测试：设置 shell、语言选择、插件管理、插件设置空状态和加载失败。
- [x] 6.3 手动验证托盘启动、设置打开、插件导入、选中文本弹窗、bridge 读取上下文、自关闭和边缘定位。
