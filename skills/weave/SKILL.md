---
name: weave
description: 当你需要通过 `weave` 工具操作嵌入的 Weave 节点图编辑器时使用——添加、编辑或删除节点和连线，读取或整体替换画布，居中或缩放视口，或把当前画布导出为 PNG。任务中第一次调用 `weave` 工具前阅读本 skill，调用返回错误时复查一遍，以使用正确的接口。
---

# 使用 `weave` 工具操作 Weave 节点图编辑器

`weave` 工具把你提供的 `code` 表达式送进编辑器文档内执行，返回结果 JSON；表达式可异步（`await weave.exportPng()`）。作用域内有三个全局：`App`（编辑器对象，拥有全部状态和操作）、`Weave`（`Weave.Util` / `Weave.Color` / `Weave.Geom` 工具库）、`weave`（推荐优先使用的小桥接对象）。编辑器常驻且离屏挂载，页面是否可见不影响使用。

方法按功能分成三个大类：**常用功能**、**UI 功能**、**需要谨慎的功能**。同类方法放一起，按需取用；多数工作用「常用功能」即可。

## 常用功能

这类方法直接读写画布数据或触发渲染，是默认应该使用的操作。

| 方法 | 用途 |
|---|---|
| `weave.addNode(spec)` | 添加一个节点（字段 `label`/`desc`/`color`/`x`/`y`/`w`/`h`）；`x`/`y` 为像素值。自动选中、保存、重渲染，返回节点。预设颜色 id 仅 `blue`/`cyan`/`green`/`yellow`/`orange`（及旧名 `amber` 等），未知 id 会回退为蓝色 |
| `weave.getData()` | 读取整张画布 `{nodes, connections, viewport}` |
| `weave.setData(data)` | 用 `{nodes, connections?, viewport?}` 整体替换画布，校验、重建、重渲染，返回新状态 |
| `weave.exportPng()` | 导出当前画布为 PNG，返回 `{ok, value:{dataUrl, name}}` |
| `weave.count()` | 返回 `{nodes, connections}` 数量 |
| `App.addNode()` | 在视口中心或上次锚点处加一个节点 |
| `App._addNodeAt(x, y, asPosition?)` | 在世界坐标处加节点（`asPosition=true` 时坐标作为左上角） |
| `App.removeNode(id)` / `App.removeNodes(ids)` | 删除一个 / 多个节点，自动删除相关连线 |
| `App._createConnection(fromId, toId, opts)` | 仅构造连线对象并返回（`opts`: `label`/`cp1`/`cp2`/`mirrored`）；不自加入画布，需自行 push 到 `canvasState.connections` 后保存渲染 |
| `App._deleteConnection(id)` / `App._deleteConnections(ids)` | 删除一条 / 多条连线 |
| `App.copyNodes()` / `pasteNodes()` / `selectAllNodes()` | 复制 / 粘贴 / 全选节点 |
| `App.saveCanvasSnapshot()` | 把当前状态写入撤销历史并持久化；数据变更后调用 |
| `App.renderCanvas()` | 重渲染画布；数据变更后调用 |
| `App.saveCanvas()` | 只写入 localStorage，不重渲染、不产生撤销步骤 |
| `App.canvasUndo()` / `canvasRedo()` | 撤销 / 重做 |
| `App.centerCanvasOnNodes()` / `centerCanvasOnOrigin()` | 视口居中到节点 / 原点 |
| `App.applyViewTransform()` | 应用 `panX`/`panY`/`scale` 到画布 |
| `App._serializeData()` | 返回可导出的序列化状态 |
| `App._loadFromData(data)` | 用一份 JSON 恢复画布 |
| `App._getNodeById(id)` / `_getNodeMap()` | 按 id 查节点 / 建节点映射 |
| `App._genId(prefix?)` | 生成唯一 id |
| `App._snap(v)` | 数值网格吸附 |
| `App.t(key, params?)` | 取当前语言文案 |

## UI 功能

这类方法打开或操作编辑器界面，是给坐在电脑前的用户准备的。AI 一般不主动调用，用户明确要求时再用。

| 方法 | 用途 |
|---|---|
| `App.openNodeModal(id)` | 打开节点属性窗口（标签 / 描述 / 颜色） |
| `App.saveModal()` / `closeModal()` | 保存 / 关闭节点属性窗口 |
| `App.inlineEdit(type, id)` | 在节点上直接编辑标题 / 描述（`type` 为 `nodeTitle` 或 `nodeDesc`） |
| `App._showDescEdit(nodeId)` | 在节点标题下方展开描述编辑行 |
| `App.showCtx(x, y, nodeId?, connId?, target?)` | 打开右键菜单 |
| `App.showSettings()` / `closeSettings()` | 打开 / 关闭设置面板 |
| `App.toggleChrome()` | 切换界面 chrome（显示 / 隐藏工具栏等） |
| `App.toggleReadOnly()` | 切换只读模式 |
| `App.setLang('zh'|'en')` | 切换语言 |
| `App.showToast(text, type?, ms?)` | 显示顶部提示 |

## 需要谨慎的功能

这类方法行为有副作用（覆盖、下载、打开文件选择器）或属于内部渲染细节。使用前先权衡场景。

| 方法 | 用途与注意 |
|---|---|
| 清空画布：`weave.setData({nodes:[],connections:[]})`（推荐） / `App.clearAllNodes()` | 会覆盖当前全部内容；先 `weave.getData()` 确认画布现状再调用。`clearAllNodes()` 有原生确认弹窗（离屏执行可能被取消而无效），优先用 `weave.setData()` |
| `App.exportPNG()` / `App._exportPNGLegacy()` / `App.doExport()` / `App.doImport()` | 触发下载或文件选择器；只需图片或 JSON 时用 `weave.exportPng()` / `getData()` / `setData()` |
| `App._triggerDownload(dataUrl, name)` | 直接触发浏览器下载；`weave.exportPng()` 无此副作用 |
| 下划线前缀渲染辅助（`App._doRenderLines`、`_buildSpatialIndex`、`_updateNodeVisibility` 等） | 内部渲染管线；数据变更后用 `saveCanvasSnapshot()` + `renderCanvas()` 收尾 |
| `App.saveCanvas()` 单独使用 | 只写 localStorage，不重渲染不产生撤销步；优先用 `saveCanvasSnapshot()` |

## 正确性规则

- 直接修改 `App.canvasState.nodes` 或 `App.canvasState.connections` 后，按顺序调用 `App.saveCanvasSnapshot()` 和 `App.renderCanvas()`。
- 节点格式 `{id, label, desc, color, x, y, mirrored, w, h}`；连线格式 `{id, from, to, label?, cp1?, cp2?, mirrored}`。
- 单位不同:`getData()` / `setData()` 的 `x`/`y` 是**网格单位**（1 格 = 20px）；节点 `w`/`h`、以及 `weave.addNode` / `App._addNodeAt` / 直接读写 `App.canvasState.nodes` 时的 `x`/`y` 都是**像素**。默认节点 170×80px ≈ 8.5×4 格。
- 布局尺度：一张正常的图，相邻节点中心距横向约 **15 格**、纵向约 **10 格**，即节点边缘之间留约 **6 个空格**（120~130px）；整张图的范围是几十格。写出的坐标动辄 ±100 格以上，通常是把格误当成了像素。
- `App.selectedNodeIds` / `App.selectedConnIds` 是 `Set`，不是数组。
- `weave` 只在内嵌编辑器文档内执行，不能操作 harness 外壳、文件系统或宿主进程。

## 调用失败时

- 报错信息是页面抛出的消息或超时；把表达式改为合法 JavaScript 后重试。
- `weave.exportPng()` 需要画布上至少一个节点，画布为空会报错。
- 页面加载后编辑器短暂后可用；得到「编辑器尚未就绪」就稍等重试。

## 参考

`App`、`Weave.Util`、`Weave.Color`、`Weave.Geom` 的完整成员列表在 `docs/weave-api.md`。需要上面未覆盖的操作时阅读它。
