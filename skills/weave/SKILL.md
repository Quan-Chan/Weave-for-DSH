---
name: weave
description: 当你需要通过 `weave` 工具操作嵌入的 Weave 画布编辑器时使用——编辑器有节点图与时序图两种画布模式：节点图下添加、编辑或删除节点与连线，绘制分区，收起与展开节点串；时序图下摆放参与者、调整时序线、在时序线之间收发消息。两种模式都可绘制分区框、读取或整体替换画布、导出 PNG。任务中第一次调用 `weave` 工具前阅读本 skill，调用返回错误时复查一遍，以使用正确的接口。
---

# 使用 `weave` 工具操作 Weave 画布编辑器

`weave` 工具把你提供的 `code` **表达式**送进编辑器文档内执行，返回结果 JSON；表达式可异步（`await weave.exportPng()`）。**必须是单个表达式**——多条语句要包成 IIFE：同步 `(() => { ...; return 结果 })()`，异步 `(async () => { ...; return 结果 })()`。返回值会被序列化成 JSON 传回（`undefined` 记为 `null`），所以要返回值就得显式 `return`。作用域内有三个全局：`App`（编辑器对象，拥有全部状态和操作）、`Weave`（`Weave.Util` / `Weave.Color` / `Weave.Geom` 工具库）、`weave`（桥接对象）。编辑器常驻且离屏挂载，页面是否可见不影响使用。

> 网格换算系数恒为 **20**（`gridPx` 字段只是把这个常量写进数据里，不是可配置项）：1 格 = 20 像素。

## 画布模式与双文档（先读这一节）

编辑器有**两种画布模式**，各自持有一份完全独立的文档：

- **节点图（`graph`）**——节点 + 连线构成的有向图，支持分区与节点串收起。
- **时序图（`sequence`）**——参与者（节点）垂下时序线，消息是时序线之间的水平箭头。分区框同样可用（框住一组参与者）。

| 方法 | 用途 |
|---|---|
| `weave.getMode()` | 返回当前模式 `"graph"` 或 `"sequence"` |
| `weave.setMode(mode)` | 切换模式（`"graph"` / `"sequence"`）。两份文档互不影响：节点图的内容切过去还在，切回来也不丢 |

**能力随模式变化**：`addNode` / `getData` / `setData` / `count` / `exportPng` / 分区（`addRegion` / `removeRegion`）两种模式都可用；`addConnection` 仅节点图；`addMessage` 仅时序图；收起展开（`collapseNode` 等）**仅节点图**——在时序图下调用会抛出明确错误，提示先 `setMode("graph")`。构造表达式前先确认当前模式符合需求，任务横跨两种模式时先 `setMode` 再操作。

## 节点与连线（节点图）

| 方法 | 用途 |
|---|---|
| `weave.addNode(spec)` | 添加一个节点。字段 `label`/`desc`/`color`/`x`/`y`/`w`/`h`，`x`/`y`/`w`/`h` 为像素值，`x`/`y` 是节点的**左上角**（不是中心点），省略 `w`/`h` 即默认 180×80。自动选中、保存、重渲染，返回节点。节点落进已有分区时自动加入该分区 `nodeIds`。预设颜色 id 为 `blue`/`cyan`/`green`/`yellow`/`orange` 或 `#rrggbb`；未知 id 回退为蓝色。时序图模式下同此方法，且节点自带时序线（见时序图一节） |
| `weave.addConnection(fromId, toId, opts?)` | 在两个节点之间建一条连线。`opts`: `label`/`cp1`/`cp2`（贝塞尔控制点）/`mirrored`。自动保存重渲染，返回连线。仅节点图可用 |
| `weave.getData()` | 读取当前模式文档的序列化状态。节点图返回 `{mode:"graph", nodes, connections, regions, viewport}`（`x`/`y`/`w`/`h` 为**网格单位**）；已收起节点含 `collapse` 字段 |
| `weave.setData(data)` | 用一份 JSON 整体替换当前文档，自动校验、重建、重置撤销历史、重渲染并返回新状态。数据自带 `mode`（或 `format:"weave-sequence"`）时会**先切换到对应模式**再落盘，因此可用于跨模式写文档；注意它可能把你刚确认过的模式改掉，之后需重新 `getMode()` |
| `weave.count()` | 返回 `{nodes, connections, regions}` 数量（时序图下 `connections` 是消息数，`regions` 是分区数） |
| `App.addNode()` | 在视口中心或上次锚点处加一个节点 |
| `App._addNodeAt(x, y, asPosition?)` | 在世界坐标处加节点（`asPosition=true` 时坐标作为左上角） |
| `App.removeNode(id)` / `App.removeNodes(ids)` | 删除一个 / 多个节点，自动删除相关连线，并从分区 `nodeIds` 剔除 |
| `App._createConnection(fromId, toId, opts)` | 仅构造连线对象并返回；不加入画布，需自行 push 到 `canvasState.connections` 后保存渲染。日常建线优先用 `weave.addConnection()` |
| `App._deleteConnection(id)` / `App._deleteConnections(ids)` | 删除一条 / 多条连线 |
| `App.copyNodes()` / `pasteNodes()` / `selectAllNodes()` | 复制 / 粘贴 / 全选节点 |

## 时序图

时序图表达参与者之间的交互顺序：

- **参与者**就是一个节点（`weave.addNode`），其**时序线（生命线）**自节点底边中点垂直向下，长度由节点的 `life` 字段决定（像素，缺省 200，最小 40）。`weave.addNode` 在时序图模式下自动带 `life`，也可显式传 `life`。
- **消息**是两条时序线之间的水平箭头，本质是一条连线加一个高度：`weave.addMessage(fromId, toId, y?)` 的 `y` 是消息离画布顶部的绝对高度（像素），省略时落在源时序线中点并按格取整。消息高度低于两端锚点时自动抬高到合法位置；时序线不够长时自动延长，箭头两端永不悬空。
- 消息按 `y` 从上到下表达时间先后：先发生的事件 `y` 更小。同一对参与者可有多条消息（不同高度）。

| 方法 | 用途 |
|---|---|
| `weave.addMessage(fromId, toId, y?, opts?)` | 在两条时序线之间建一条消息。`opts`: `label`/`dashed`/`color`。返回消息对象（`{id, from, to, y, label?...}`）。仅时序图可用 |
| `Weave.Geom.seqLifeAnchor(node)` | 参与者时序线锚点 = 节点底边中点 `{x, y}`（像素，纯函数） |
| `Weave.Geom.seqLifeLen(node)` | 时序线有效长度（缺省 200） |
| `Weave.Geom.seqLifeEnd(node)` | 时序线末端坐标 |
| `Weave.Geom.seqMsgDefaultY(node)` | 消息缺省高度：源时序线中点按格取整 |
| `App._repairSeqMessages(allowRemove, allowExtend)` | 整理不变量：补足不够长的时序线（`allowRemove=true` 时删除越界悬空消息）。手工改数据后调用 |

时序图下 `weave.getData()` 返回可读的 `weave-sequence` 格式：`{format:"weave-sequence", mode:"sequence", unit:"grid", gridPx, time:{originY, step, start}, messageStyle, nodes:[{id, label, color, x, y, w, h, lifeline:{x, y, length}}], connections:[{id, from, to, label?, t, line, color?}]}`。

- **所有坐标与尺寸都是网格单位**（`unit:"grid"`；`gridPx` 恒为 20，非可配置项）：节点的 `x`/`y`/`w`/`h` 与 `lifeline.x`/`lifeline.y`/`lifeline.length` 全是格；`lifeline.length` 就是 `life` 的格数（像素 `life` = `length × 20`）。
- **消息高度写成时间步 `t`**：`t = time.start + (消息像素高度 − time.originY × 20) / (20 × time.step)`。`time.originY` 是最顶部时序线起点（所有参与者底边中点里最小者）的绝对 Y，单位为格（公式里先乘 20 换成像素）；`time.start` 缺省 1，`time.step` 缺省 1（1 个时间步 = 1 格）。反向换算（从 `t` 还原像素高度）同理：`消息像素高度 = time.originY × 20 + (t − time.start) × 20 × time.step`。因此把全部参与者整体上移，`t` 不变——时间与摆放高度无关。
- `line` 是 `"solid"` / `"dashed"` 枚举；`messageStyle` 说明无色消息的取色规则（`colorSource:"participant"` 跟随源参与者，或 `"fixed"` 固定缺省线色）。
- `setData` 接受同款格式并自动落回时序图模式。

## 分区（两种模式都可用）

分区（region）是画布上的可见矩形框，用于把若干节点归入同一区域，可嵌套。一个节点同一时刻至多归属一个分区（`nodeIds` 显式归属，拖入拖出自动维护）；`parentId` 记录父分区，`null` 为顶级。编辑器 v2.0.2 起画框分区在**节点图与时序图两种模式都可用**（时序图下用来框住一组参与者），`weave.addRegion()` / `weave.removeRegion()` 在任一模式下都能直接调用。

| 方法 | 用途 |
|---|---|
| `weave.addRegion(spec)` | 添加一个分区。字段 `x`/`y`/`w`/`h`（像素，左上角与尺寸）、`label`、`color`。整框包含的未归属节点自动加入 `nodeIds`（节点整体落在框内才算）；被新框圈住的现存分区改挂为新框的子分区；中心命中的最深现存分区设为 `parentId`。返回新分区（内存对象，像素坐标） |
| `weave.removeRegion(id)` | 删除一个分区框；框内节点与连线保留，直接子分区上提到被删分区的父级。返回剩余 `regions` |
| `App.openRegionModal(id)` | 打开分区属性窗口（名称 / 颜色） |
| `App.saveRegionModal()` / `closeRegionModal()` | 保存 / 关闭分区属性窗口 |
| `App._getRegionById(id)` | 按 id 查分区 |
| `App._regionAtPoint(wx, wy)` | 世界坐标点命中的最深分区；未命中返回 `null` |
| `App._regionChildIds(parentId)` | 直接子分区 id 集合 |
| `App._regionAllNodeIds(regionId)` | 分区及全部后代分区的节点 id 并集 |
| `App._syncNodeRegionMembership(nodeId)` | 按节点中心点命中的最深分区同步归属 |

用 `weave.setData()` 写入含 `regions` 的数据时，分区坐标与节点同规则（网格单位）；`weave.addRegion()` 的返回值是**像素**坐标，要写回 `setData()` 需先除以 20。

## 收起与展开（仅节点图）

收起（collapse）把一个节点的沿连线可达后代链隐藏起来，画布只显示根节点。收起根节点的 `collapse` 字段记录 `{hidden: [{id, dx, dy}, ...]}`，`dx`/`dy` 是各隐藏节点相对根节点的偏移（收起瞬间保存，展开时恢复相对位置）。嵌套收起：外层根的闭包一并收下内层根节点，内层根 `collapse` 记录原样保留，展开外层不会展开内层。收起闭包内任一节点被 ≥2 个节点连接时禁止收起（多父冲突）。时序图的消息是消息，不是节点串的后继，收起不可用。

| 方法 | 用途 |
|---|---|
| `weave.collapseNode(nodeId)` | 收起节点。无可收起内容或多父冲突时返回 `false` 且不改状态 |
| `weave.expandNode(nodeId)` | 展开已收起节点，隐藏节点按保存的相对偏移恢复。未收起时返回 `false` |
| `weave.toggleCollapse(nodeId)` | 收起 ⇄ 展开切换 |
| `weave.canCollapse(nodeId)` | 节点当前是否可收起（有可达后代且无多父冲突） |
| `Weave.Geom.collapseClosure(connections, rootId)` | 沿连线方向收集根节点之后全部可达节点的 id 数组（不含根自身，纯函数） |
| `Weave.Geom.hasMultiParentConflict(connections, closureIds)` | 闭包内是否存在被 ≥2 个不同节点连接的节点（同一节点平行连线只算一个父节点） |

## 画布与视口

| 方法 | 用途 |
|---|---|
| `App._setMode('graph'|'sequence')` | 状态级模式切换（含存档与重渲染）。`weave.setMode` 封装了它 |
| `App._isSeqMode()` | 当前是否时序图模式 |
| `App.saveCanvasSnapshot()` | 把当前状态写入撤销历史并持久化；数据变更后调用 |
| `App.renderCanvas()` | 重渲染画布；数据变更后调用 |
| `App.saveCanvas()` | 只写入 localStorage，不重渲染、不产生撤销步骤 |
| `App.canvasUndo()` / `canvasRedo()` | 撤销 / 重做（收起 / 展开、分区增删同属撤销历史；两种模式各持独立历史） |
| `App.centerCanvasOnNodes()` / `centerCanvasOnOrigin()` | 视口居中到节点 / 原点 |
| `App.applyViewTransform()` | 应用 `panX`/`panY`/`scale` 到画布 |
| `App._serializeData()` | 返回可导出的序列化状态（形态随模式：节点图原形；时序图走可读的 `weave-sequence` 格式） |
| `App._loadFromData(data)` | 用一份 JSON 恢复画布（数据带模式标记时自动切换模式） |
| `App._getNodeById(id)` / `_getNodeMap()` | 按 id 查节点 / 建节点映射 |
| `App._genId(prefix?)` | 生成唯一 id |
| `App._snap(v, useGrid?)` | 数值网格吸附（`useGrid` 缺省跟随"对齐节点"设置） |
| `App.t(key, params?)` | 取当前语言文案 |

## 关联高亮

关联高亮把指定节点及其直接关联内容抬升到清晰层，其余内容模糊。高亮集合 = 被点节点 + 与它有连线关系的全部节点（一层）+ 两端都在集合内的连线（时序图下即参与者和它的消息）。纯视觉状态，不改变选中集合，不写入画布数据。切换高亮对象时先清除上一次高亮。拖动视角与缩放保留高亮；节点拖拽、连线点击、右键菜单、保存快照等操作清除高亮。

| 方法 | 用途 |
|---|---|
| `App._highlightAtNode(nodeId)` | 高亮一个节点及其一层关联节点与相关连线。节点不存在时无操作 |
| `App._clearHighlight()` | 清除当前高亮，还原节点与连线的原叠放顺序 |

用户按住 Alt 单击节点时编辑器执行同一操作；AI 在用户要求聚焦某节点时调用 `App._highlightAtNode(nodeId)`。

## UI

这类方法打开或操作编辑器界面，直接作用于浏览器内的可见 UI。仅在用户明确要求操作界面时调用。

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

| 方法 | 用途与注意 |
|---|---|
| 清空画布：`weave.setData({nodes:[],connections:[]})` | 只清空**当前模式**的文档，另一份文档不受影响；先 `weave.getData()` 确认现状再调用。`App.clearAllNodes()` 同时清空当前文档的节点与连线，带原生确认弹窗（离屏执行可能被取消而无效），不用于清空 |
| `App.exportPNG()` / `App._exportPNGLegacy()` / `App.doExport()` / `App.doImport()` | 触发下载或文件选择器；只需图片或 JSON 时用 `weave.exportPng()` / `getData()` / `setData()` |
| `App._triggerDownload(href, name)` | 直接触发浏览器下载；`weave.exportPng()` 无此副作用 |
| 下划线前缀渲染辅助（`App._doRenderLines`、`_buildSpatialIndex`、`_updateNodeVisibility` 等） | 内部渲染管线；数据变更后用 `saveCanvasSnapshot()` + `renderCanvas()` 收尾 |
| `App.saveCanvas()` 单独使用 | 只写 localStorage，不重渲染不产生撤销步；用 `saveCanvasSnapshot()` |

## 结构规则

节点图：

- 节点容量：节点默认 180×80px，标题为单行、约 12 个汉字，描述区默认 2 行、每行约 11 个汉字（11px/1.35 排版），超出部分在画布上截断省略。节点不随文本自动变大。标题或描述超过默认容量时，先按文本量调整节点 `w`/`h`，再填入文本；估算按每行约 11 字、行高约 15px。
- 粒度：一个节点表达一个概念。多个独立概念各自建节点，用连线表达关系；同一概念的内容并入同一节点。拆分标准是概念是否独立，与文本长短无关。
- 连接：节点图有可读顺序。每个节点至少与图内另一节点相连（入口节点除外），连线方向即阅读方向。孤立节点、悬空连线、指向不存在节点的连线都不成立。

时序图：

- 参与者横向一行排开（`y` 相同、间距 ≥15 格），交互自上而下：消息高度 `y` 递增表达时间推进，同一高度可放并行消息。
- 每个参与者都要有消息进出；时序线长度要罩住它收发的全部消息（`addMessage` 会自动延长，手工改数据时自己保证）。
- 消息方向即调用 / 通知方向；返回类消息可从接收方指回发起方。给消息写简短 `label`（如 "查询订单"）表达语义。
- 参与者建议用角色或系统名（"客户端"、"服务器"、"数据库"），而不是具体数据。

## 正确性规则

- 直接修改 `App.canvasState.nodes`、`App.canvasState.connections` 或 `App.canvasState.regions` 后，按顺序调用 `App.saveCanvasSnapshot()` 和 `App.renderCanvas()`；时序图下改完消息还要调 `App._repairSeqMessages(false, true)` 维持"箭头不悬空"不变量。
- 节点格式 `{id, label, desc, color, x, y, mirrored, w, h, collapse?, life?}`（`life` 仅时序图）；连线格式 `{id, from, to, label?, cp1?, cp2?, mirrored, y?}`（`y` 仅时序图消息）；分区格式 `{id, label, color, x, y, w, h, nodeIds, parentId}`。
- 坐标有两套单位：`getData()` / `setData()` 的 `x`/`y`（节点与分区）是网格单位；`weave.addNode()` 与 `weave.addRegion()` 的 `x`/`y`、`addMessage()` 的 `y` 是像素。1 格 = 20 像素，换算系数只有 20：把 `getData()` 读到的网格坐标用于 `weave.addNode()`，先乘 20；把 `addNode()` 返回的像素坐标写回 `setData()`，先除 20。
- 布局：相邻节点横向相距约 15 格（300px）、纵向约 10 格（200px）；坐标保持在 ±50 格（±1000px）以内。`weave.addNode()` 省略 `w`/`h` 即为默认 180×80 节点。
- 每次完成画布写入后执行一次检查：`weave.count()` 核对节点/连线/分区数量；`weave.getData()` 核对连线两端 id 存在、方向符合内容顺序、节点文本长度与节点尺寸匹配。检查不通过时修正后重写，直到通过。
- 收起沿连线方向（`from` → `to`）取后代；分支链、汇合点都按可达集处理。目标节点被多个父节点连接时不能收起其父链上的节点，先确认 `weave.canCollapse()`。
- 分区内节点的判断有两套标准：**建框时**按「整框包含」（节点整体落在框内）收编进 `nodeIds`；**节点之后移动/新建时**由 `App._syncNodeRegionMembership` 按「中心点命中的最深分区」同步归属。手工构造分区数据时，`nodeIds` 必须指向现存节点且不重复，`parentId` 必须指向现存分区或为 `null`。
- `App.selectedNodeIds` / `App.selectedConnIds` 是 `Set`；`App.selectedRegionId` 是单个 id 或 `null`。
- `weave` 只在内嵌编辑器文档内执行，不能操作 harness 外壳、文件系统或宿主进程。

## 示例

节点图——三个节点加一个分区，再把末端链收起：

```js
(async () => {
  if (weave.getMode() !== 'graph') weave.setMode('graph');
  const a = weave.addNode({ label: '总览', color: 'blue', x: 0, y: 0 });
  const b = weave.addNode({ label: '分支', color: 'green', x: 300, y: 0 });
  const c = weave.addNode({ label: '细节', color: 'orange', x: 600, y: 0 });
  weave.addConnection(a.id, b.id, { label: '展开' });
  weave.addConnection(b.id, c.id);
  const rg = weave.addRegion({ x: -60, y: -100, w: 920, h: 320, label: '模块 A' });
  const collapsed = weave.collapseNode(b.id);
  return { region: rg.id, collapsed, data: weave.getData() };
})()
```

时序图——两个参与者互发消息：

```js
(async () => {
  if (weave.getMode() !== 'sequence') weave.setMode('sequence');
  const client = weave.addNode({ label: '客户端', color: 'blue', x: 0, y: 40 });
  const server = weave.addNode({ label: '服务器', color: 'green', x: 600, y: 40 });
  const m1 = weave.addMessage(client.id, server.id, 360, { label: '查询订单' });
  const m2 = weave.addMessage(server.id, client.id, 480, { label: '返回结果' });
  return { mode: weave.getMode(), msgs: [m1.id, m2.id], data: weave.getData() };
})()
```

读取画布内容：

```js
(() => {
  const d = weave.getData();
  return { mode: d.mode || d.format, nodes: d.nodes.length, connections: d.connections.length, regions: (d.regions || []).length };
})()
```

导出 PNG：

```js
(async () => {
  const r = await weave.exportPng();
  return { name: r.name, size: r.dataUrl.length };
})()
```

## 调用失败时

- 报错信息是页面抛出的消息或超时；把表达式改为合法 JavaScript 后重试。
- 提示「仅时序图模式可添加消息」或「时序图模式不支持收起」：模式用错了，先 `weave.getMode()` 确认、`weave.setMode()` 切换，再重发原操作。
- `weave.addMessage` / `addConnection` 提示「节点不存在」：传入的 id 在当前文档里不存在——切过模式后 id 不会跨文档有效，重新 `getData()` 取 id。（`addRegion` 不接受节点 id，不会报这个错。）
- `weave.exportPng()` 需要画布上至少一个节点，画布为空会报错。
- 得到「编辑器尚未就绪」时，延迟后重试。
- `collapseNode` 返回 `false`：节点没有可达后代，或存在多父冲突（目标节点被 ≥2 个节点连接）。

## 参考

`App`、`Weave.Util`、`Weave.Color`、`Weave.Geom` 的完整成员列表见本仓库的 `docs/weave-api.md`（相对仓库根目录，插件包内已随附）。
