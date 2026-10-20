# Weave 编辑器 —— 插件 API 完全参考

> 本文档描述 `weave-for-dsh` 插件通过 AI 工具 `weave` 暴露出来的、可以操控嵌入在 DeepSeek Harness 页面内的 Weave 画布编辑器的全部接口。编辑器（v2.0+）有**节点图**与**时序图**两种画布模式，各自持有一份独立文档；除特别说明外，`weave` 桥接方法在当前模式下工作。
>
> 使用方式：AI 调用工具 `weave`，参数为一段 **JavaScript 表达式**（支持 `await`），表达式在页面内嵌的 Weave 编辑器（iframe）内执行，随后把求值结果以 JSON 返回，出错时回传错误信息。
>
> 执行作用域里可用的全局：`App`（编辑器应用对象）、`Weave`（工具库命名空间）、`weave`（插件桥接对象）、以及浏览器页面的 `window` / `document` / `localStorage` 等。

---

## 目录

1. [快速上手](#1-快速上手)
2. [`weave` 桥接对象](#2-weave-桥接对象)
3. [`Weave` 工具库命名空间](#3-weave-工具库命名空间)
4. [`App` 编辑器应用对象](#4-app-编辑器应用对象)
   - [4.1 节点增删改查](#41-节点增删改查)
   - [4.2 连线管理](#42-连线管理)
   - [4.2.1 分区（region）](#421-分区region)
   - [4.2.2 收起 / 展开（collapse）](#422-收起--展开collapse)
   - [4.2.3 关联高亮](#423-关联高亮)
   - [4.3 画布与视口](#43-画布与视口)
   - [4.4 选择与右键菜单](#44-选择与右键菜单)
   - [4.5 内联编辑与模态框](#45-内联编辑与模态框)
   - [4.6 撤销 / 重做 / 保存](#46-撤销--重做--保存)
   - [4.7 导入 / 导出](#47-导入--导出)
   - [4.8 颜色系统](#48-颜色系统)
   - [4.9 设置 / 语言 / 快捷键](#49-设置--语言--快捷键)
   - [4.10 只读模式 / UI 显示](#410-只读模式--ui-显示)
   - [4.11 画布模式与时序图](#411-画布模式与时序图)
   - [4.12 App 全部成员索引](#412-app-全部成员索引)
5. [页面 UI 元素与可打开的界面](#5-页面-ui-元素与可打开的界面)
6. [常用示例](#6-常用示例)
7. [注意事项与边界](#7-注意事项与边界)

---

## 1. 快速上手

```js
// 查看当前画布有几个节点、几条连线
weave.count()
// 加一个节点
weave.addNode({ label: "需求分析", color: "blue", x: 0, y: 0 })
// 读取整张图
weave.getData()
// 导出当前画布为 PNG（返回 dataUrl）
await weave.exportPng()
```

---

## 2. `weave` 桥接对象

插件在页面内注入的 `weave` 对象，封装了最常用操作，返回值都经过 Weave 自身的序列化 / 渲染管线。标注「仅节点图」/「仅时序图」的方法在错误模式下会抛出带切换提示的错误；其余方法随当前模式工作。

| 方法 | 参数 | 返回 | 用途 |
|---|---|---|---|
| `getMode()` | — | `"graph"` \| `"sequence"` | 当前画布模式（节点图 / 时序图） |
| `setMode(mode)` | `mode: "graph" \| "sequence"` | 切换后的模式 | 切换画布模式。两种模式各持一份完全独立的文档（含各自的撤销历史与视口），互不影响 |
| `addNode(spec)` | `spec: { label?, desc?, color?, x?, y?, w?, h?, life? }` | 新节点对象 `{id,label,desc,color,x,y,mirrored,w,h[,life]}` | 加一个节点，自动选中、保存、重渲染。`x`/`y`/`w`/`h` 为像素，省略 `w`/`h` 即默认 180×80。颜色可为预设 id（`blue`/`cyan`/`green`/`yellow`/`orange`）或 `#rrggbb`；未知 id 会回退为蓝色。节点落进已有分区时自动加入该分区 `nodeIds`。**时序图下**节点自动带 `life`（时序线长度，像素，缺省 200），也可显式传入 |
| `addConnection(fromId, toId, opts?)` | `opts: { label?, cp1?, cp2?, mirrored? }` | 新连线对象 `{id,from,to,label,...}` | 在两个节点之间建一条连线（仅节点图），自动保存重渲染 |
| `addMessage(fromId, toId, y?, opts?)` | `y` 为消息高度（像素）；`opts: { label?, dashed?, color? }` | 新消息对象 `{id,from,to,y,label?,...}` | 在两条时序线之间建一条消息（仅时序图）。`y` 省略时落在源时序线中点并按格取整；低于两端锚点时自动抬高；时序线不够长时自动延长，箭头两端永不悬空 |
| `addRegion(spec)` | `spec: { x, y, w, h, label?, color? }` | 新分区对象 `{id,label,color,x,y,w,h,nodeIds,parentId}` | 画一个分区框（仅节点图）。`x`/`y`/`w`/`h` 为像素。**整框包含**的未归属节点自动加入 `nodeIds`；中心命中的最深现存分区设为 `parentId`；自动选中、保存、重渲染 |
| `removeRegion(id)` | `id` | 剩余分区数组 | 删除一个分区框；框内节点与连线保留，直接子分区上提到被删分区的父级 |
| `collapseNode(nodeId)` | `nodeId` | `boolean` | 收起节点的可达后代链（仅节点图）。无可收起内容或多父冲突时返回 `false` 且不改状态 |
| `expandNode(nodeId)` | `nodeId` | `boolean` | 展开已收起节点，隐藏节点按保存的相对偏移恢复。未收起时返回 `false` |
| `toggleCollapse(nodeId)` | `nodeId` | `boolean` | 收起 ⇄ 展开切换 |
| `canCollapse(nodeId)` | `nodeId` | `boolean` | 节点当前是否可收起（有可达后代且无多父冲突） |
| `getData()` | — | 序列化文档（形态随模式） | 当前模式文档的完整序列化状态。节点图：`{mode:"graph", nodes, connections, regions, viewport}`，`x`/`y`/`w`/`h` 为网格单位，已收起节点带 `collapse` 字段。时序图：可读的 `weave-sequence` 格式（见 [4.11](#411-画布模式与时序图)） |
| `setData(data)` | `data` | 加载后的新状态（同 `getData` 格式） | 用一份 JSON 整体替换当前文档，自动校验、重建层次、重置撤销历史并渲染；数据自带 `mode`（或 `format:"weave-sequence"`）时先切换到对应模式再落盘，因此可用于跨模式写文档 |
| `exportPng()` | — | `Promise<{dataUrl, name}>` | 复用 Weave 自己的导出管线，返回当前画布渲染出的 PNG data URL（不触发下载）。v2.0 起导出的 PNG 内嵌文档存档，拖回画布即可还原整张图 |
| `count()` | — | `{nodes, connections, regions}` | 当前文档的节点 / 连线 / 分区数量 |

**示例**

```js
// 一句话生成一张三节点两连线加一个分区的图
weave.setData({
  nodes: [
    { id: "a", label: "开始", color: "green", x: 0, y: 0 },
    { id: "b", label: "处理", color: "blue", x: 16, y: 0 },
    { id: "c", label: "结束", color: "orange", x: 32, y: 0 },
  ],
  connections: [
    { id: "c1", from: "a", to: "b", label: "" },
    { id: "c2", from: "b", to: "c", label: "" },
  ],
  regions: [
    { id: "r1", label: "流程", color: "cyan", x: -1, y: -2, w: 36, h: 8, nodeIds: ["a", "b", "c"], parentId: null },
  ],
})
// await weave.exportPng() 可取得这张图的 PNG
```

---

## 3. `Weave` 工具库命名空间

`Weave` 提供三个纯工具命名空间，不依赖编辑器状态，适合做几何 / 颜色 / 字符串处理。

### `Weave.Util`

| 函数 | 签名 | 用途 |
|---|---|---|
| `escapeHtml` | `escapeHtml(str) -> string` | HTML 转义 |
| `xmlEscapeText` | `xmlEscapeText(str) -> string` | XML 转义（导出 SVG 内嵌样式用） |
| `debounce` | `debounce(fn, ms) -> fn` | 防抖包装 |
| `clamp` | `clamp(v, min, max) -> number` | 数值夹取 |
| `svgEl` | `svgEl(tag) -> Element` | 创建 SVG 元素 |
| `strokeGridLines` | `strokeGridLines(ctx, step, color, x1,y1,x2,y2, toX, toY)` | 在 canvas 上画网格线 |
| `positionNearNode` | `positionNearNode(...)` | 计算节点附近的位置 |
| `roundedRectPath` | `roundedRectPath(...)` | 圆角矩形路径字符串 |
| `truncateDescForExport` | `truncateDescForExport(desc, maxLines) -> string` | 截断描述文本（导出用） |
| `drawExportArrow` | `drawExportArrow(...)` | 在导出 canvas 上画箭头 |
| `arrayBufferToBase64` | `arrayBufferToBase64(buf) -> string` | ArrayBuffer 转 base64 |

### `Weave.Color`

| 函数 | 签名 | 用途 |
|---|---|---|
| `hslToRgb` | `hslToRgb(h,s,l) -> {r,g,b}` | HSL → RGB |
| `rgbToHsl` | `rgbToHsl(r,g,b) -> {h,s,l}` | RGB → HSL |
| `shadeColor` | `shadeColor(hex, pct) -> hex` | 颜色变亮/变暗 |
| `hexToRgb` | `hexToRgb(hex) -> {r,g,b}` | HEX → RGB |
| `rgbToHex` | `rgbToHex(r,g,b) -> hex` | RGB → HEX |

### `Weave.Geom`

| 函数 | 签名 | 用途 |
|---|---|---|
| `bezierPoint` | `bezierPoint(t, p0, c1, c2, p1) -> {x,y}` | 三次贝塞尔曲线上的点 |
| `curveSamples` | `curveSamples(...) -> {x,y}[]` | 曲线采样点序列 |
| `segHitsRect` | `segHitsRect(...) -> bool` | 线段是否命中矩形 |
| `curvePointAtArc` | `curvePointAtArc(...) -> {x,y}` | 按弧长取曲线上的点 |
| `curveLength` | `curveLength(...) -> number` | 曲线长度 |
| `arrowShapeD` | `arrowShapeD(...) -> string` | 箭头 SVG path |
| `worldToScreen` | `worldToScreen(wx, wy, panX, panY, scale) -> {x,y}` | 世界坐标 → 屏幕坐标 |
| `screenToWorld` | `screenToWorld(sx, sy, panX, panY, scale) -> {x,y}` | 屏幕坐标 → 世界坐标 |
| `boxRect` | `boxRect(sx, sy, cx, cy) -> {lx,ly,rx,ry}` | 框选矩形的规范 min/max 归一化 |
| `rectContains` | `rectContains(lx, ly, rx, ry, bx, by, bw, bh) -> bool` | 整矩形 `(bx,by,bw,bh)` 位于 `(lx,ly)-(rx,ry)` 之内（含边界） |
| `rectsIntersect` | `rectsIntersect(lx, ly, rx, ry, bx, by, bw, bh) -> bool` | 矩形相交（擦边不算相交） |
| `collapseClosure` | `collapseClosure(connections, rootId) -> id[]` | 沿连线方向收集根节点之后全部可达节点的 id（不含根自身） |
| `hasMultiParentConflict` | `hasMultiParentConflict(connections, closureIds) -> bool` | 闭包内是否存在被 ≥2 个不同节点连接的节点（同一节点平行连线只算一个父节点） |
| `snapFrames` | `snapFrames(dx, dy) -> {x,y}[]` | 过冲吸附帧序列（100ms 线性 + 50ms 过冲尾段，1ms 采样） |
| `nodesBBox` | `nodesBBox(nodes, sizeFn) -> {minX,minY,maxX,maxY}` | 批量节点包围盒 |
| `getSocketAnchor` | `getSocketAnchor(...) -> {x,y}` | socket 锚点位置 |
| `connLabelPos` | `connLabelPos(...) -> {x,y}` | 连线标签位置 |
| `connArrowBaseX` | `connArrowBaseX(...) -> number` | 箭头基线 x |
| `buildPathFromCp` | `buildPathFromCp(...) -> string` | 用控制点构建路径 |
| `getConnControlPoints` | `getConnControlPoints(conn, fromNode, toNode) -> {cp1,cp2}` | 计算连线控制点 |
| `connOffYFromIdx` | `connOffYFromIdx(idx) -> number` | 平行连线垂直偏移 |
| `getNodeSize` | `getNodeSize(node) -> {w,h}` | 节点尺寸 |
| `getNodeRect` | `getNodeRect(node) -> rect` | 节点矩形 |
| `getNodeClamp` | `getNodeClamp(...)` | 节点世界坐标夹取 |
| `connArrows` | `connArrows(conn, fromNode, toNode) -> ...` | 连线箭头信息 |
| `seqLifeLen` | `seqLifeLen(node) -> number` | 时序线有效长度（`node.life` 缺省时取 200，像素） |
| `seqLifeAnchor` | `seqLifeAnchor(node) -> {x,y}` | 时序线锚点 = 节点底边中点 |
| `seqLifeEnd` | `seqLifeEnd(node) -> {x,y}` | 时序线末端坐标 = 锚点向下延伸 life |
| `seqMsgDefaultY` | `seqMsgDefaultY(node) -> number` | 消息缺省高度：源时序线中点按格取整 |
| `seqMsgOffsetGroups` | `seqMsgOffsetGroups(items) -> ...` | 时序消息避让分组（同一高度水平投影重叠的消息错开） |

**示例**

```js
Weave.Geom.worldToScreen(100, 200, App.panX, App.panY, App.scale)
Weave.Color.shadeColor("#3366cc", -20)   // 加深
Weave.Util.clamp(150, 0, 100)            // 100
```

---

## 4. `App` 编辑器应用对象

`App` 是编辑器的核心对象，所有状态与方法都挂在它上面。下面按功能分组介绍**常用**接口；完整成员见 [4.12](#412-app-全部成员索引)，画布模式与时序图专有接口见 [4.11](#411-画布模式与时序图)。

### 4.1 节点增删改查

| 函数 | 签名 | 说明 |
|---|---|---|
| `addNode()` | `addNode() -> void` | 通过「+节点」同款锚点逻辑加一个节点（默认在视口中心或上次锚点右侧）；落进已有分区时自动加入该分区 `nodeIds` |
| `_addNodeAt(worldX, worldY, asPosition?)` | `_addNodeAt(x, y, asPosition) -> id` | 在世界坐标处加节点；`asPosition=true` 时把 (x,y) 当左上角而非居中点 |
| `removeNode(id)` | `removeNode(id) -> void` | 删除一个节点（连带删除相关连线，并从分区 `nodeIds` 剔除） |
| `removeNodes(ids)` | `removeNodes([id,...]) -> void` | 批量删除 |
| `clearAllNodes()` | `clearAllNodes() -> void` | 清空所有节点与连线与分区（含原生 confirm 弹窗） |
| `_cloneNode(src, offsetX?, offsetY?)` | `_cloneNode(src, dx?, dy?) -> newId` | 克隆节点（标签带「副本」后缀），默认偏移 (30,30) |
| `copyNodes()` / `pasteNodes()` | — | 复制/粘贴所选节点（含连线，居中到视口） |
| `selectAllNodes()` | — | 全选节点 |
| `_getNodeById(id)` | `_getNodeById(id) -> node\|undefined` | 按 id 查节点 |
| `_genId(prefix?)` | `_genId('c') -> string` | 生成唯一 id |
| `canvasState.nodes` | 数组 | 画布节点数据本身，可直接 push/splice/改字段（改后需 `saveCanvasSnapshot()` + `renderCanvas()`） |

**示例**

```js
// 用原生数据直接改
App.canvasState.nodes.push({
  id: App._genId(), label: "手写节点", desc: "", color: "violet",
  x: 0, y: 0, mirrored: false, w: 180, h: 80,
})
App.saveCanvasSnapshot(); App.renderCanvas()
```

### 4.2 连线管理

| 函数 | 签名 | 说明 |
|---|---|---|
| `_createConnection(fromId, toId, opts)` | `_createConnection(from, to, {label?, cp1?, cp2?, mirrored?, y?, dashed?, color?}) -> conn` | 构造连线对象（**不自动加入画布**）。`cp1/cp2` 为 `{dx,dy}` 控制点；`y`（消息高度）/`dashed`/`color` 仅时序图消息使用。日常建线优先用 `weave.addConnection()`（节点图）/ `weave.addMessage()`（时序图） |
| `_createSeqMessage(fromId, toId, y)` | — | 时序消息的创建入口（含落点夹取、避让与吸附动画）；`weave.addMessage` 直接落定吸附值不走动画 |
| `_deleteConnection(connId)` | — | 删除一条连线 |
| `_deleteConnections(connIds)` | — | 批量删除连线 |
| `_getConnById(id)` | — | 按 id 查连线 |
| `_clearConnSelection()` | — | 清除连线选中并刷新 |
| `renderLines()` / `_renderConnection(conn, ...)` | — | 渲染连线层 |
| `canvasState.connections` | 数组 | 连线数据，可直接 push（之后 `saveCanvasSnapshot()` + `renderCanvas()`） |

**示例**

```js
const c = App._createConnection("a", "b", { label: "依赖" });
App.canvasState.connections.push(c);
App.saveCanvasSnapshot(); App.renderCanvas();
```

### 4.2.1 分区（region）

分区是画布上的可见矩形框，用于把若干节点归入同一区域，可嵌套（**仅节点图**——时序图模式没有分区入口，`weave.addRegion` 在时序图下会抛错）。一个节点同一时刻至多归属一个分区；`nodeIds` 为该分区的直属节点（拖入拖出自动维护），`parentId` 为父分区 id，`null` 表示顶级。分区在渲染上位于连线层之下，父分区先画、子分区叠于其上。

| 函数 | 签名 | 说明 |
|---|---|---|
| `addRegion(spec)` | `addRegion({x,y,w,h,label?,color?}) -> region` | 建分区（像素坐标），见 §2 `weave.addRegion`。整框包含的未归属节点入 `nodeIds`，中心命中的最深现存分区为 `parentId` |
| `removeRegion(id)` | `removeRegion(id) -> void` | 删除分区框；框内节点/连线保留，直接子分区上提到被删分区的父级 |
| `openRegionModal(id)` | — | 打开分区属性模态框（名称 / 颜色） |
| `saveRegionModal()` / `closeRegionModal()` | — | 保存 / 关闭分区模态框 |
| `_getRegionById(id)` | — | 按 id 查分区 |
| `_regionAtPoint(wx, wy)` | — | 世界坐标点命中的最深分区；未命中返回 `null` |
| `_regionChildIds(parentId)` | — | 直接子分区 id 集合 |
| `_regionDescendantIds(id)` | — | 全部后代分区 id（DFS） |
| `_regionAncestorIds(id)` | — | 父链上所有分区 id |
| `_regionAllNodeIds(regionId)` | — | 分区及全部后代分区的节点 id 并集 |
| `_syncNodeRegionMembership(nodeId)` | — | 按节点中心点命中的最深分区同步归属（拖拽落位与新建节点后调用） |
| `selectedRegionId` | 字段 | 当前选中分区 id，无选中为 `null` |
| `canvasState.regions` | 数组 | 分区数据，可直接 push/splice（之后 `saveCanvasSnapshot()` + `renderCanvas()`） |

分区格式（内存 / 序列化）：`{id, label, color, x, y, w, h, nodeIds, parentId}`。序列化时 `x`/`y`/`w`/`h` 与节点同规则折算为网格单位。

**示例**

```js
// 三个节点外面套一个分区
const rg = weave.addRegion({ x: -80, y: -140, w: 1100, h: 360, label: "核心模块", color: "green" });
rg.id
```

### 4.2.2 收起 / 展开（collapse）

收起把一个节点沿连线可达的后代链隐藏，画布只显示根节点（**仅节点图**——时序图的消息不是节点串的后继，收起不可用）。收起根节点的 `collapse` 字段记录 `{hidden: [{id, dx, dy}, ...]}`，`dx`/`dy` 是各隐藏节点相对根节点的偏移（收起瞬间保存；展开时按根最新坐标 + 偏移恢复相对位置）。

规则：
- 闭包沿连线方向（`from` → `to`）收集全部可达节点，含分支与汇合。
- 闭包内任一节点被 ≥2 个节点连接时禁止收起（多父冲突），收起操作返回 `false`。
- 嵌套收起：外层根的闭包一并收下内层根节点；内层根的 `collapse` 记录原样保留，展开外层不会展开内层。
- 被收起的节点不参与渲染与"适应视图"边界；删除收起根节点时先释放其隐藏节点。

| 函数 | 签名 | 说明 |
|---|---|---|
| `collapseChain(nodeId)` | `collapseChain(id) -> bool` | 收起节点可达链；无后续节点或冲突时返回 `false` |
| `expandChain(nodeId)` | `expandChain(id) -> bool` | 展开收起；未收起时返回 `false` |
| `toggleCollapse(nodeId)` | `toggleCollapse(id) -> bool` | 收起 ⇄ 展开切换 |
| `_canToggleCollapse(nodeId)` | — | 该节点是否可收起（闭包非空且无多父冲突） |
| `_isCollapseHidden(id)` | — | 节点是否被任意收起记录隐藏 |
| `_isConnectionCollapseHidden(conn)` | — | 连线是否因任一端点被收起而隐藏 |
| `_rebuildCollapseDerived()` | — | 重建收起派生缓存（隐藏并集 + 徽标可用性） |

节点格式包含可选 `collapse` 字段（见 §2 `getData`）。`Weave.Geom.collapseClosure` 与 `Weave.Geom.hasMultiParentConflict` 提供同规则纯函数（见 §3）。

**示例**

```js
// 建一条 A → B → C 链后收起 B（C 与 B→C 连线隐藏）
const a = weave.addNode({ label: "A", x: 0, y: 0 });
const b = weave.addNode({ label: "B", x: 300, y: 0 });
const c = weave.addNode({ label: "C", x: 600, y: 0 });
App.canvasState.connections.push(
  App._createConnection(a.id, b.id),
  App._createConnection(b.id, c.id),
);
App.saveCanvasSnapshot(); App.renderCanvas();
weave.collapseNode(b.id);      // true
weave.getData().nodes.find(n => n.id === b.id).collapse
```

### 4.2.3 关联高亮

关联高亮把指定节点与其直接关联内容抬升到清晰层，其余内容模糊。高亮集合 = 被点节点 + 与它有连线关系的全部节点（一层）+ 两端都在集合内的连线（含标签）。纯视觉状态：不写入 `selectedNodeIds` / `selectedConnIds`，不产生撤销步骤，不随存档保存。拖动视角与缩放保留高亮；节点拖拽、连线点击、右键菜单、保存快照、渲染等画布操作清除高亮。

| 函数 | 签名 | 说明 |
|---|---|---|
| `_highlightAtNode(nodeId)` | `_highlightAtNode(id) -> void` | 高亮一个节点及其一层关联节点与连线；再次调用其他节点时先清除上一次高亮 |
| `_clearHighlight()` | — | 清除高亮，还原节点/连线原叠放顺序与模糊状态 |
| `hlNodeIds` | 字段 | 当前高亮节点 id 集合；无高亮为 `null` |
| `hlConnKeys` | 字段 | 当前高亮连线 key 集合；无高亮为 `null` |

用户交互入口为按住 Alt 单击节点；`App._highlightAtNode(id)` 提供相同效果的程序化入口。

**示例**

```js
// 高亮根节点及其一层关联内容
App._highlightAtNode("a");
// 清除
App._clearHighlight();
```

### 4.3 画布与视口

| 函数 / 字段 | 签名 | 说明 |
|---|---|---|
| `panX`, `panY`, `scale` | 数值字段 | 画布平移与缩放（直接赋值后调用 `applyViewTransform()`） |
| `applyViewTransform()` | — | 应用平移/缩放到 DOM |
| `centerCanvasOnNodes()` | — | 视口居中到所有节点 |
| `centerCanvasOnOrigin()` | — | 视口居中到原点 |
| `clampPan()` | — | 限制平移范围 |
| `_zoomAbout(scale, cx, cy)` | — | 绕屏幕点缩放 |
| `getWorldPos(e)` | — | 由鼠标事件取世界坐标 |
| `_viewportCenterWorld()` | — | 视口中心的世界坐标 |
| `_snap(v, useGrid?)` | `_snap(v, useGrid?) -> number` | 网格吸附；`useGrid` 缺省跟随「对齐节点」设置，显式传 `false` 只取整 |
| `renderCanvas(opts?)` | `renderCanvas({center?}) -> void` | 全量重渲染（模型改完必调） |
| `updateNodePositions()` | — | 只更新节点位置层 |
| `updateCoordDisplay()` | — | 更新坐标 HUD |

### 4.4 选择与右键菜单

| 函数 | 签名 | 说明 |
|---|---|---|
| `selectedNodeIds` / `selectedConnIds` | Set | 当前选中 id 集合 |
| `showCtx(x, y, nodeId?, connId?, editTarget?)` | — | 在屏幕坐标弹出右键菜单 |
| `_clearCtx()` | — | 关闭右键菜单 |
| 菜单动作 | `ctxProps` / `ctxEdit` / `ctxDup` / `ctxMirror` / `ctxResize` / `ctxResetSize` / `ctxCurveDrag` / `ctxResetCurve` / `ctxDel` / `ctxResetKeybinds` | 对应菜单项的行为（属性/编辑/复制/镜像/调整大小/重置大小/曲线编辑/重置曲线/删除） |

### 4.5 内联编辑与模态框

| 函数 | 签名 | 说明 |
|---|---|---|
| `inlineEdit(type, nodeId)` | `inlineEdit('nodeTitle'\|'nodeDesc', id)` | 直接在节点上进入标题/描述内联编辑，回车或失焦保存 |
| `saveInlineEdit()` / `closeInlineEdit()` | — | 保存 / 关闭内联编辑 |
| `openNodeModal(id)` | — | 打开节点属性模态框（标签、描述、颜色） |
| `saveModal()` / `closeModal()` | — | 保存 / 关闭模态框 |
| `showDescEdit(nodeId)` / `_saveDescEdit()` / `_closeDescEdit()` | — | 节点标题下方的描述编辑行 |

### 4.6 撤销 / 重做 / 保存

| 函数 | 签名 | 说明 |
|---|---|---|
| `saveCanvasSnapshot()` | — | 当前状态入撤销历史（**每次数据变更后调用**），并自动 localStorage 保存 |
| `canvasUndo()` / `canvasRedo()` | — | 撤销 / 重做（最多 50 步） |
| `saveCanvas()` | — | 仅持久化到 localStorage（不产生历史） |
| `_serializeData()` | — | 返回导出用序列化对象 `{nodes, connections, regions, viewport}`（已收起节点带 `collapse` 字段；分区 `x/y/w/h` 与节点同规则折算为网格单位） |
| `_restoreFromSerialized(d, opts?)` | — | 用序列化数据整体恢复画布 |
| `_restoreCanvasSnapshot(snapshot)` | — | 恢复一条历史快照 |
| `updateCanvasUndoButtons()` | — | 刷新撤销/重做按钮禁用态 |

### 4.7 导入 / 导出

| 函数 | 签名 | 说明 |
|---|---|---|
| `exportPNG()` | `async exportPNG() -> Promise<void>` | 触发 PNG 下载（含能力探测与回退）。v2.0 起导出的 PNG 内嵌文档存档（拖回画布可还原整张图） |
| `_exportPNGLegacy()` | — | 旧版数据重绘导出 |
| `doExport()` | — | 导出 JSON 文件下载 |
| `doImport()` | — | 打开文件选择器导入 JSON |
| `_loadFromData(d)` | `_loadFromData(data) -> bool` | 用一份 JSON 替换整个画布（自动校验/重建/渲染/快照；数据带 `mode` 或 `format:"weave-sequence"` 时先切换到对应模式再落盘） |
| `_readJsonFile(file)` | — | 读取 JSON 文件对象 |
| `_triggerDownload(href, name)` | — | 触发下载（`href` 可为 data URL 或 blob URL） |
| `_guardHasNodes()` | — | 是否有可导出内容（导出前置检查） |

**提示**：`weave.exportPng()` / `weave.setData()` 已封装上述能力且返回结果，优先使用。

### 4.8 颜色系统

| 函数 | 签名 | 说明 |
|---|---|---|
| `_resolveColor(hexOrId)` | — | 归一为 `{cls?, hex, isPreset}` |
| `_setGenColor(id)` | — | 设置生成颜色（新节点默认色） |
| `_cycleNodeColors()` | — | 循环切换所选节点颜色 |
| `openCustomPicker(onPick, initial?)` | — | 打开自定义色轮选择器 |
| `cancelCustomPicker()` / `confirmCustomColor()` | — | 关闭 / 确认自定义色 |
| `_loadCustomColors()` / `_saveCustomColors()` | — | 读写自定义色（localStorage） |

### 4.9 设置 / 语言 / 快捷键

| 函数 | 签名 | 说明 |
|---|---|---|
| `showSettings()` / `closeSettings()` | — | 打开 / 关闭设置面板 |
| `_showSettingsTab(tab)` | — | 切到指定设置页 |
| `setLang('zh'\|'en')` / `setLangZh()` / `setLangEn()` | — | 切换语言 |
| `t(key, params?)` | — | 取当前语言文案 |
| `_keybinds` | 对象 | 当前快捷键映射表 |
| `_keyMatch(action, e)` | — | 判断事件是否匹配某快捷键动作 |
| `_keybindLabel(action)` | — | 取快捷键的显示标签 |
| `_loadKeybinds()` / `_resetKeybinds()` | — | 加载 / 恢复默认快捷键 |
| `_startKeybindEdit(key, action)` / `_bindKeybindInputs()` / `_cancelKeybindEdit()` | — | 录制自定义快捷键 |

支持的快捷键动作：`undo`、`redo`、`selectAll`、`copy`、`paste`、`delete`、`region`（画分区）、`hlNode`（高亮关联节点）、`autoModal`、`chrome`。

### 4.10 只读模式 / UI 显示

| 函数 | 签名 | 说明 |
|---|---|---|
| `toggleReadOnly()` | — | 切换只读模式（读写状态存在 `readOnly` 字段） |
| `toggleChrome()` | — | 切换界面 chrome（隐藏/显示工具栏等） |
| `showToast(text, type?, ms?)` | — | 顶部 toast 提示 |
| `_getEl(id)` | — | 取某 id 的 DOM 元素（见 §5） |
| `_updateStatusBadge()` | — | 刷新左下角「N 节点 · M 连线」徽标（分区不计入） |

### 4.11 画布模式与时序图

编辑器（v2.0+）有**两种画布模式**，各持一份完全独立的文档（节点/连线/分区、撤销历史、视口都分开），切换 = 换 `canvasState` 指针，因此渲染与编辑路径不分模式。存档分两个 localStorage 键：`flow_data`（节点图）与 `flow_data_seq`（时序图）；模式本身记在设置表（`flow_mode`），启动时回到上次使用的模式。

| 成员 | 签名 | 说明 |
|---|---|---|
| `_mode` | 字段 | 当前模式：`'graph'` \| `'sequence'` |
| `_isSeqMode()` | `_isSeqMode() -> bool` | 当前是否时序图模式 |
| `_setMode(next)` | `_setMode('graph'\|'sequence') -> bool` | 状态级切换（已是目标模式返回 `false`）。切换是一次存档事务：先落盘当前文档，再换指针、清瞬态、重渲染。`weave.setMode` 封装了它 |
| `_modeStore` | 字段 | 双文档槽：`{graph: {state, historyIndex, viewport}, sequence: {...}}` |
| `_docKey(mode?)` | — | 当前（或指定）模式的存档键 |
| `_ensureModeStore()` / `_loadStoredDoc(mode)` | — | 文档槽惰性装配 / 从存档装入指定模式的文档 |
| `_snapSeqY(v)` | — | 消息高度网格吸附 |
| `_repairSeqMessages(allowRemove, allowExtend)` | — | 整理时序图不变量：补足不够长的时序线；`allowRemove=true` 时删除越界悬空消息。手工改时序数据后调用 |
| `_cancelSeqAnim()` | — | 收掉在途的时序吸附动画（切模式/导入前自动调用） |
| `_connFollowSeq` | 设置字段 | 无 color 消息的取色规则：跟随源参与者或固定缺省线色 |

时序图专有数据语义（内存像素）：

- **参与者**即节点，时序线自节点**底边中点**（`seqLifeAnchor`）垂直向下，长度由 `node.life`（缺省 200、最小 40）决定，可带 `lifeColor`。
- **消息**是连线加高度：`conn.y` 为画布绝对 Y（像素）；平行消息的避让偏移按"同一时间高度上水平投影重叠"分组。
- 不变量：消息必须落在两端时序线范围内，落点超出现有长度时自动延长相应时序线（箭头两端永不悬空）。

时序图的序列化形态（`weave.getData()` / `App._serializeData()` 在时序图下的返回）是**可读的 `weave-sequence` 格式**：

```json
{
  "format": "weave-sequence",
  "mode": "sequence",
  "unit": "grid",
  "gridPx": 20,
  "time": { "originY": 6, "step": 1, "start": 1 },
  "messageStyle": { "colorSource": "participant" },
  "nodes": [
    { "id": "n1", "label": "客户端", "color": "blue", "x": 0, "y": 2, "w": 9, "h": 4,
      "lifeline": { "x": 4.5, "y": 6, "length": 10 } }
  ],
  "connections": [
    { "id": "c1", "from": "n1", "to": "n2", "label": "查询订单", "t": 8, "line": "solid" }
  ],
  "viewport": { "panX": 0, "panY": 0, "scale": 1, "unit": "px" }
}
```

- 坐标仍为网格单位；`lifeline{x, y, length}` 三个数定死一条时序线（列、起点=节点底边、长度）。
- 消息高度写成时间步 `t`：以最顶部时序线起点为 `time.start`（1），向下每 `time.step` 格加 1；整份文件的时间与画布摆放高度无关（整体平移参与者不改变 `t`）。
- `line` 是 `"solid"` / `"dashed"` 枚举且总是写出；空 desc / 空标签 / 空 regions / mirrored / cp1/cp2 不写。
- 导入由 `_sequenceDocumentToData` 反向翻译回内存形状；`setData` / `_loadFromData` 见到 `format:"weave-sequence"` 或 `mode:"sequence"` 时自动切到时序图再落盘。

### 4.12 App 全部成员索引

> 以下为 `App` 上可直接调用的完整成员表（源自 `Object.getOwnPropertyNames(App)`）。`#` 表示点击后通常伴随 `saveCanvasSnapshot()` + `renderCanvas()`。

| 类别 | 成员 |
|---|---|
| **状态字段** | `canvasState`、`dragState`、`isDragging`、`socketDragState`、`panX`、`panY`、`scale`、`selectedNodeIds`、`canvasPanState`、`canvasBoxState`、`regionDragState`、`regionMoveState`、`selectedRegionId`、`_regionModeActive`、`_regionJustCreated`、`_regionPanMoved`、`_regionDblCreated`、`_regionDblRect`、`_regionDblLabel`、`_regionEditEl`、`_frameMoveRegionId`、`_regionResizeId`、`_boxSelectJustCompleted`、`canvasHistoryIndex`、`_canvasHistoryMax`、`_linesRaf`、`_renderFilter`、`_cellSize`、`_nodeCells`、`_nodeCellMap`、`_connByNode`、`_connByIdMap`、`_lastVisibleCells`、`_lastRenderScale`、`_resolveColorCache`、`_forceRerenderPending`、`_modalNodeId`、`_regionModalId`、`_inlineEditTarget`、`_inlineTeardown`、`_descEditNodeId`、`_descEditBlur`、`_descEditKeydown`、`_chromeHidden`、`_ctxNodeId`、`_ctxConnId`、`_ctxRegionId`、`_ctxEditTarget`、`selectedConnIds`、`_curveEditState`、`_customColors`、`_cpState`、`_cpEls`、`_cpOnConfirm`、`_wheelImageData`、`_wheelCleanup`、`_selectedGenColor`、`readOnly`、`_autoOpenModal`、`_snapNodes`、`_snapSize`、`_snapRegionPos`、`_snapRegionSize`、`_suppressNextCanvasClick`、`_dragJustFinished`、`_zOrderDirty`、`_lastAddCenterX`、`_lastAddCenterY`、`_addCounter`、`_lang`、`_keybinds`、`_keybindEditing`、`_els`、`_nodeElMap`、`_nodeByIdCache`、`_nodeZOrder`、`_cachedCW`、`_cachedCH`、`_settings`、`_idSeq`、`_connOffsCache`、`_collapseDerived`、`_regionSnapAnim`、`_eggRunning`、`debouncedAutoSave`、`_clipboard`、`_activeSnapAnims`、`_snapDataInterval`、`_snapRenderRaf`、`_snapDataHz`、`_dblClickTarget`、`_visPathByKey`、`_hitPathByKey`、`_labelByKey`、`_arrowPathByKey`、`hlNodeIds`、`hlConnKeys`、`_hlBaseOrder`、`_hlLiftPos` |
| **工具方法** | `_getEl`、`_genId`、`_snap`、`t`、`showToast` |
| **语言** | `_applyLangUI`、`setLang`、`setLangZh`、`setLangEn`、`_updateLangButtons` |
| **存储** | `_lsGet`、`_lsSet`、`_lsGetJson` |
| **查找** | `_getNodeMap`、`_getNodeById` |
| **状态徽标** | `_updateStatusBadge` |
| **撤销/保存** | `saveCanvasSnapshot`、`_serializeData`、`_serializeSequenceData`、`_serializeRegions`、`saveCanvas`、`canvasUndo`、`canvasRedo`、`_restoreCanvasSnapshot`、`updateCanvasUndoButtons` |
| **导入/校验** | `_validateLoadedData`、`_prepareSerializedData`、`_sequenceDocumentToData`、`_commitSerialized`、`_restoreFromSerialized`、`_loadFromData` |
| **颜色** | `_resolveColor`、`_loadCustomColors`、`_saveCustomColors`、`_cycleNodeColors`、`openCustomPicker`、`cancelCustomPicker`、`confirmCustomColor`、`_renderModalDots`、`_dotsHtml`、`_setActiveDot`、`_buildDotPanel`、`_buildModalDots`、`_renderColorWheel`、`_updateWheelDot`、`_updateCpUI`、`_cpFromRGB`、`_cpFromWheel`、`_applyGenColorUI`、`_setGenColor`、`_buildGDots`、`_gOpenCustomPicker` |
| **视口/网格** | `_refreshContainerCache`、`getWorldPos`、`_viewportCenterWorld`、`_computeViewport`、`_zoomAbout`、`applyViewTransform`、`_drawGrid`、`updateCoordDisplay`、`_initCoordEditable`、`clampPan`、`centerCanvasOnNodes`、`centerCanvasOnOrigin` |
| **渲染** | `_rebuildZOrder`、`_applyZOrder`、`_bringToFront`、`_destroyNodeEls`、`_forceRerender`、`updateNodePositions`、`_prepCanvas`、`_ensureCanvasSkeleton`、`_renderNodes`、`_syncResizeHandles`、`_applyNodeSize`、`_hideResizeHandles`、`_showResizeHandles`、`_updateNodeAppearance`、`_postRenderUpdate`、`_finalizeRender`、`_refreshOverflowFlags`、`_cancelSnapAnim`、`renderCanvas` |
| **连线渲染** | `_getConnGeometry`、`_buildLinePath`、`_ensureSvgLayers`、`renderLines`、`_bindConnEl`、`_doRenderLines`、`_renderTempLine`、`_reconcileEl`、`_removeReconciled`、`_renderConnection`、`_removeConnection` |
| **空间索引/性能** | `_buildSpatialIndex`、`_getActiveCells`、`_getCellConnections`、`_updateNodeVisibility`、`_panUpdateConnections`、`_animateNodeToGrid`、`_snapDataTick`、`_snapRenderTick` |
| **交互** | `_bindDragListeners`、`onCanvasMouseDown`、`finalizeBoxSelect`、`onCanvasWheel`、`_bindSocketDrag`、`_bindNodeEvents`、`_bindResizeHandles`、`_initGlobalEvents`、`startNodeDrag`、`startSocketDrag`、`_findSocketHit`、`_onCanvasClick`、`_onCanvasDblClick` |
| **快捷键** | `_loadKeybinds`、`_keyMatch`、`_keybindLabel` |
| **描述编辑** | `_showDescEdit`、`_saveDescEdit`、`_closeDescEdit` |
| **节点操作** | `clearAllNodes`、`_addNodeAt`、`_resetAddAnchor`、`addNode`、`copyNodes`、`pasteNodes`、`selectAllNodes`、`removeNode`、`removeNodes`、`_pruneCollapseOnRemove` |
| **分区（region）** | `openRegionModal`、`saveRegionModal`、`closeRegionModal`、`removeRegion`、`ctxRegionFrameMove`、`ctxRegionResizeMode`、`toggleRegionMode`、`finalizeRegionCreate`、`startRegionMove`、`_setRegionMode`、`_regionAtPoint`、`_getRegionById`、`_regionChildIds`、`_regionDescendantIds`、`_regionAncestorIds`、`_regionDepth`、`_regionAllNodeIds`、`_regionContainsRegion`、`_syncNodeRegionMembership`、`_selectRegionOnly`、`_renderRegions`、`_updateRegionPreview`、`_applyRegionTransform`、`_startRegionResizeDrag`、`_enterRegionResize`、`_exitRegionResize`、`_enterRegionLabelEdit`、`_endRegionLabelEdit`、`_beginRegionLabelEdit`、`_cancelRegionSnapAnim`、`_animateRegionSnap`、`_clearRegionSelection`、`_markRegionDragFinished`、`_buildRegionModalDots` |
| **收起 / 展开（collapse）** | `collapseChain`、`expandChain`、`toggleCollapse`、`_canToggleCollapse`、`_isCollapseHidden`、`_isConnectionCollapseHidden`、`_rebuildCollapseDerived`、`_collapseDerivedData`、`_flushRenderSync` |
| **画布模式与时序图** | `_mode`、`_isSeqMode`、`_setMode`、`_modeStore`、`_docKey`、`_ensureModeStore`、`_loadStoredDoc`、`_applyModeChrome`、`_snapSeqY`、`_seqMsgY`、`_seqLifeAnchor`、`_tailClampY`、`_repairSeqMessages`、`_cancelSeqAnim`、`_animateSeqValue`、`_createSeqMessage`、`_connFollowSeq`、`_seqMoveState` |
| **关联高亮** | `_highlightAtNode`、`_clearHighlight`、`_hlBlur`、`_hlLiftLayer`、`_hlLiftConnection`、`_hlLiftConns` |
| **模态框** | `openNodeModal`、`closeModal`、`saveModal` |
| **克隆/内联** | `_cloneNode`、`_enterNodeInlineEdit`、`_bindInlineInputs`、`closeInlineEdit`、`_getInlineInput`、`saveInlineEdit`、`inlineEdit` |
| **右键菜单** | `ctxProps`、`ctxMirror`、`ctxResize`、`ctxResetSize`、`ctxDup`、`ctxDel` |
| **连线工具** | `_getConnById`、`_createConnection`、`_getConnOffY`、`_buildConnOffsetMap`、`_dropSelectionIfGone`、`_clearCurveEditIfNodesGone`、`_removeCurveHandles`、`_clearConnSelection`、`ctxCurveDrag`、`ctxResetCurve`、`_renderCurveHandles`、`_exitCurveEdit`、`_deleteConnection`、`_deleteConnections`、`_clearCtx` |
| **只读/设置/chrome** | `toggleReadOnly`、`showSettings`、`_showSettingsTab`、`_startKeybindEdit`、`_cancelKeybindEdit`、`_bindKeybindInputs`、`_resetKeybinds`、`closeSettings`、`toggleChrome` |
| **右键/导入导出** | `showCtx`、`ctxEdit`、`_readJsonFile`、`_guardHasNodes`、`_triggerDownload`、`doExport`、`_inlineExportFonts`、`_buildExportStyleText`、`_buildExportSnapshot`、`_buildExportSvgXml`、`_loadSvgImage`、`_foreignObjectProbe`、`_canUseDomSnapshot`、`_runSnapshotTiles`、`_validateExportContent`、`_drawExportGrid`、`_computeContentBounds`、`exportPNG`、`_exportPNGLegacy`、`doImport` |

> 带 `_` 前缀的方法属内部实现，在该 iframe 内同样可直接调用；这些方法多用于底层管线，改数据后调用 `saveCanvasSnapshot()` 与 `renderCanvas()` 使改动可见并进入撤销历史。

---

## 5. 页面 UI 元素与可打开的界面

编辑器的 DOM 元素 id 如下，可用 `App._getEl('id')` 或 `document.getElementById('id')` 访问（多数由 `App._getEl` 缓存）。

**工具栏按钮**：`btnAddNode`（+节点）、`btnClearAllNodes`（清空）、`btnRegion`（分区）、`btnDoExport`（导出 JSON）、`btnDoImport`（导入 JSON）、`btnExportPNG`（导出 PNG）、`btnCenterCanvas`（居中）、`btnShowSettings`（设置）、`sidebarReadOnlyBtn`（只读）、`undoBtn` / `redoBtn`、`btnLangZh` / `btnLangEn`、`btnResetKeybinds`。

分区创建入口：顶栏「分区」按钮，或快捷键 `Region`（默认 `Shift+R`），或在画布空白处按住 `Alt` 拖拽。

**可打开的界面**：

| 界面 | 触发方式 | 相关元素 |
|---|---|---|
| 节点属性模态框（标签/描述/颜色） | `App.openNodeModal(id)`，或双击节点 / 右键「属性」 | `modal`、`mLabel`、`mDesc`、`mTitle`、`mColors`、`mColorWheel`、`btnSaveModal`、`btnCloseModal` |
| 自定义色轮选择器 | `App.openCustomPicker(cb, hex)`，或节点模态框内选自定义 | `cpModal`、`cpModalBox`、`gPanelWheel`、`btnCancelPicker`、`btnConfirmColor` |
| 右键菜单 | `App.showCtx(x, y, nodeId, connId, target)` | `ctx` 及 `ctxProps/ctxEdit/ctxDup/ctxMirror/ctxResize/ctxResetSize/ctxCurveDrag/ctxResetCurve/ctxDel`；分区上右键另有 `ctxRegionMove`、`ctxRegionResize` |
| 设置面板 | `App.showSettings()` | `settingsModal`、`settingsBtns`、`setSnapNodes`、`setSnapSize`、`setSnapRegionPos`、`setSnapRegionSize`、`btnResetSnap`（重置对齐设置，调 `_resetSnapSettings()`）、`genColorDropdown`、`genColorPanel`、`genColorTrigger`、`gColorDots` |
| 分区属性模态框（名称/颜色） | `App.openRegionModal(id)`，或分区上右键「属性」 | `regionModal`、`regionModalBox`、`rmLabel`、`rmColors`、`btnSaveRegionModal`、`btnCloseRegionModal` |
| 节点标题/描述内联编辑 | `App.inlineEdit('nodeTitle'\|'nodeDesc', id)` | `inlineEdit`、`inlineInp`、`inlineTa` |
| 描述编辑行 | `App._showDescEdit(nodeId)` | `descEdit`、`descEditTa` |
| 坐标 HUD | 画布左下角 | `coord`、`coordX`、`coordY`、`coordZ` |
| 节点提示 | 悬停 | `nodeTip` |
| toast | `App.showToast(text, type?, ms?)` | `toastContainer` |

---

## 6. 常用示例

**① 生成一张简明流程图（思维导图风格）**

```js
weave.setData({
  nodes: [
    { id: "root", label: "项目", color: "blue", x: 0, y: 0, w: 200, h: 80 },
    { id: "a", label: "需求", color: "green", x: 400, y: -160 },
    { id: "b", label: "开发", color: "amber", x: 400, y: 0 },
    { id: "c", label: "测试", color: "violet", x: 400, y: 160 },
  ],
  connections: [
    { id: "c1", from: "root", to: "a" },
    { id: "c2", from: "root", to: "b" },
    { id: "c3", from: "root", to: "c" },
  ],
})
```

**② 在现有图上追加一个节点并连到根节点**

```js
const d = weave.getData();
const rootId = d.nodes[0].id;
const id = weave.addNode({ label: "新分支", color: "orange", x: 600, y: 40 }).id;
App.canvasState.connections.push(App._createConnection(rootId, id, { label: "→" }));
App.saveCanvasSnapshot(); App.renderCanvas();
weave.count();
```

**③ 改某个节点的文字与颜色**

```js
const n = App.canvasState.nodes[0];
n.label = "已改名"; n.color = "amber"; n.desc = "补充说明";
App.saveCanvasSnapshot(); App.renderCanvas();
```

**④ 导出画布为 PNG 数据**

```js
const r = await weave.exportPng(); // {dataUrl, name}
r.dataUrl
```

**⑤ 居中视口并放大**

```js
App.centerCanvasOnNodes(); App.scale = 1.5; App.applyViewTransform();
```

**⑥ 只读模式与撤销/重做**

```js
App.toggleReadOnly();       // 切只读
App.toggleReadOnly();       // 切回可写
App.canvasUndo(); App.canvasRedo();
```

**⑦ 打开节点属性界面**

```js
const id = App.canvasState.nodes[0]?.id;
if (id) App.openNodeModal(id); // 用户可看到模态框并编辑
```

**⑧ 给一组节点套分区并收起分支**

```js
(async () => {
  const a = weave.addNode({ label: "模块", color: "blue", x: 0, y: 0 });
  const b = weave.addNode({ label: "子项", color: "green", x: 300, y: 0 });
  App.canvasState.connections.push(App._createConnection(a.id, b.id));
  App.saveCanvasSnapshot(); App.renderCanvas();
  weave.addRegion({ x: -80, y: -120, w: 900, h: 320, label: "分区", color: "cyan" });
  const collapsed = weave.collapseNode(a.id);
  return { collapsed };
})()
```

**⑨ 切到时序图画一张两方交互图**

```js
(async () => {
  weave.setMode("sequence");                       // 与节点图互不影响
  const client = weave.addNode({ label: "客户端", color: "blue", x: 0, y: 40 });
  const server = weave.addNode({ label: "服务器", color: "green", x: 600, y: 40 });
  const m1 = weave.addMessage(client.id, server.id, 360, { label: "查询订单" });
  const m2 = weave.addMessage(server.id, client.id, 480, { label: "返回结果" });
  return { mode: weave.getMode(), msgs: [m1.id, m2.id], data: weave.getData() };
})()
```

时序图下 `getData()` 返回 `weave-sequence` 可读格式（消息高度是时间步 `t`，时序线是 `lifeline{x,y,length}`）；`weave.setMode("graph")` 切回后，节点图的文档原样还在。

---

## 7. 注意事项与边界

1. **执行环境**：代码在嵌入的 Weave iframe 内执行，只能访问该编辑器页面的全局（`App` / `Weave` / `weave` / `document` / `localStorage`）。不能访问 harness 外壳，不能 import/require 外部模块，也不具备 Node / shell 权限（那些是其他工具如 `write` / `pwsh` 的职责）。
2. **入口是单个表达式**：需要多步时用 IIFE 包裹 —— `(() => { ...; return ... })()`，或 `(async () => {...})()` + `await`。
3. **改完记得渲染**：直接改 `App.canvasState.nodes/connections/regions` 后，调用 `App.saveCanvasSnapshot()`（产生撤销历史并持久化）+ `App.renderCanvas()`（刷新画面）。若只想持久化不想要历史步骤，用 `App.saveCanvas()`。时序图下改完消息数据还要 `App._repairSeqMessages(false, true)` 保持"箭头不悬空"。
4. **数据格式**：`weave.getData()` / `setData()` / `_serializeData()` 使用同一个文档格式（节点带 `id/label/desc/color/x/y/mirrored/w/h` 及可选 `collapse`、`life`，连线带 `id/from/to/label/cp1/cp2/mirrored` 及可选 `y`，分区带 `id/label/color/x/y/w/h/nodeIds/parentId`，外加 `regions` 与 `viewport`）。该序列化格式里的 `x/y/w/h`（节点与分区）是网格单位（1 格 = 20px），加载时自动换算回像素；而 `weave.addNode` / `weave.addRegion` / `App._addNodeAt` / 直接读写 `App.canvasState.nodes` 时 `x/y` 都是像素。把 `getData()` 读到的坐标用于 `weave.addNode()` 前先乘 20；`weave.addNode()` 省略 `w`/`h` 即为默认 180×80px 节点。布局时相邻节点中心距取横向约 15 格、纵向约 10 格，全部坐标控制在 ±50 格以内。收起记录的 `dx`/`dy` 同为网格单位。时序图文档的序列化形态不同（`weave-sequence` 可读格式，见 [4.11](#411-画布模式与时序图)）。
5. **画布模式**：节点图与时序图是两份独立文档，模式能力不同——分区与收起仅节点图，消息仅时序图；`addNode`/`getData`/`setData`/`count`/`exportPng` 随当前模式工作。构造表达式前先用 `weave.getMode()` 确认模式；`setData` 写入带模式标记的数据时自动切换模式。节点 id 不跨文档通用。
6. **断开/切换视图无影响**：编辑器为离屏常驻实例，用户切到聊天页等任意页面时，`weave` 工具仍可操作同一份画布；改完切回 Weave 页即可看到。
7. **清空**：`weave.setData({nodes:[],connections:[]})` 只清空**当前模式**的文档并把撤销历史重置为新基线，另一份文档不受影响。`App.clearAllNodes()` 会清空当前文档的节点与连线，另带原生 `confirm()` 确认弹窗，离屏执行时可能被自动取消而无效。

---

*本文档由 `weave-for-dsh` 固定插件交付，接口列表直接来自运行实例的可见成员。*
