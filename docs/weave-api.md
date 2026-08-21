# Weave 编辑器 —— 插件 API 完全参考

> 本文档描述 `weave-for-dsh` 插件通过 AI 工具 `weave` 暴露出来的、可以操控嵌入在 DeepSeek Harness 页面内的 Weave 节点图编辑器的全部接口。
>
> 使用方式：AI 调用工具 `weave`，参数为一段 **JavaScript 表达式**（支持 `await`），表达式在页面内嵌的 Weave 编辑器（iframe）内执行，随后把求值结果以 JSON 返回，出错时回传错误信息。
>
> 执行作用域里可用的全局：`App`（编辑器应用对象）、`Weave`（工具库命名空间）、`weave`（插件桥接对象）、以及浏览器页面的 `window` / `document` / `localStorage` 等。

---

## 目录

1. [快速上手](#1-快速上手)
2. [`weave` 桥接对象（推荐优先使用）](#2-weave-桥接对象推荐优先使用)
3. [`Weave` 工具库命名空间](#3-weave-工具库命名空间)
4. [`App` 编辑器应用对象](#4-app-编辑器应用对象)
   - [4.1 节点增删改查](#41-节点增删改查)
   - [4.2 连线管理](#42-连线管理)
   - [4.3 画布与视口](#43-画布与视口)
   - [4.4 选择与右键菜单](#44-选择与右键菜单)
   - [4.5 内联编辑与模态框](#45-内联编辑与模态框)
   - [4.6 撤销 / 重做 / 保存](#46-撤销--重做--保存)
   - [4.7 导入 / 导出](#47-导入--导出)
   - [4.8 颜色系统](#48-颜色系统)
   - [4.9 设置 / 语言 / 快捷键](#49-设置--语言--快捷键)
   - [4.10 只读模式 / UI 显示](#410-只读模式--ui-显示)
   - [4.11 App 全部成员索引](#411-app-全部成员索引)
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

## 2. `weave` 桥接对象（推荐优先使用）

插件在页面内注入的 `weave` 对象，封装了最常用操作，返回值都经过 Weave 自身的序列化 / 渲染管线，安全且语义完整。

| 方法 | 参数 | 返回 | 用途 |
|---|---|---|---|
| `addNode(spec)` | `spec: { label?, desc?, color?, x?, y?, w?, h? }` | 新节点对象 `{id,label,desc,color,x,y,mirrored,w,h}` | 加一个节点，自动选中、保存、重渲染。颜色可为预设 id（`blue`/`cyan`/`green`/`yellow`/`orange`，旧名 `amber`/`rose`/`teal`/`violet` 亦可）或 `#rrggbb`；未知 id 会回退为蓝色 |
| `getData()` | — | `{nodes, connections, viewport}` | 当前画布的完整序列化状态（环境：Weave 导出 JSON 同款格式） |
| `setData(data)` | `data: {nodes, connections?, viewport?}` | 加载后的新状态（同 `getData` 格式） | 用一份 JSON 整体替换画布，自动校验、重建层次、重置撤销历史并渲染 |
| `exportPng()` | — | `Promise<{ok, value:{dataUrl, name}}>` | 复用 Weave 自己的导出管线，返回当前画布渲染出的 PNG data URL（不触发下载） |
| `count()` | — | `{nodes, connections}` | 节点与连线数量 |

**示例**

```js
// 一句话生成一张三节点两连线的图
weave.setData({
  nodes: [
    { id: "a", label: "开始", color: "green", x: 0, y: 0 },
    { id: "b", label: "处理", color: "blue", x: 320, y: 0 },
    { id: "c", label: "结束", color: "orange", x: 640, y: 0 },
  ],
  connections: [
    { id: "c1", from: "a", to: "b", label: "" },
    { id: "c2", from: "b", to: "c", label: "" },
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
| `boxRect` | `boxRect(lx,ly,rx,ry) -> rect` | 矩形对象 |
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

**示例**

```js
Weave.Geom.worldToScreen(100, 200, App.panX, App.panY, App.scale)
Weave.Color.shadeColor("#3366cc", -20)   // 加深
Weave.Util.clamp(150, 0, 100)            // 100
```

---

## 4. `App` 编辑器应用对象

`App` 是编辑器的核心对象，所有状态与方法都挂在它上面。下面按功能分组介绍**常用**接口；完整成员见 [4.11](#411-app-全部成员索引)。

### 4.1 节点增删改查

| 函数 | 签名 | 说明 |
|---|---|---|
| `addNode()` | `addNode() -> void` | 通过「+节点」同款锚点逻辑加一个节点（默认在视口中心或上次锚点右侧） |
| `_addNodeAt(worldX, worldY, asPosition?)` | `_addNodeAt(x, y, asPosition) -> id` | 在世界坐标处加节点；`asPosition=true` 时把 (x,y) 当左上角而非居中点 |
| `removeNode(id)` | `removeNode(id) -> void` | 删除一个节点（连带删除相关连线） |
| `removeNodes(ids)` | `removeNodes([id,...]) -> void` | 批量删除 |
| `clearAllNodes()` | `clearAllNodes() -> void` | 清空所有节点与连线 |
| `_cloneNode(src, offsetX?, offsetY?)` | `_cloneNode(src, dx?, dy?) -> newId` | 克隆节点（标签带「副本」后缀），默认偏移 (30,30) |
| `copyNodes()` / `pasteNodes()` | — | 复制/粘贴所选节点（含连线，居中到视口） |
| `selectAllNodes()` | — | 全选节点 |
| `_getNodeById(id)` | `_getNodeById(id) -> node\|undefined` | 按 id 查节点 |
| `_genId(prefix?)` | `_genId('c') -> string` | 生成唯一 id |
| `canvasState.nodes` | 数组 | 画布节点数据本身，可直接 push/splice/改字段（改后需 `saveCanvasSnapshot()` + `renderCanvas()`） |

**示例**

```js
// 用原生数据直接改（最灵活）
App.canvasState.nodes.push({
  id: App._genId(), label: "手写节点", desc: "", color: "violet",
  x: 0, y: 0, mirrored: false, w: 170, h: 80,
})
App.saveCanvasSnapshot(); App.renderCanvas()
```

### 4.2 连线管理

| 函数 | 签名 | 说明 |
|---|---|---|
| `_createConnection(fromId, toId, opts)` | `_createConnection(from, to, {label?, cp1?, cp2?, mirrored?}) -> conn` | 构造连线对象（**不自动加入画布**）。`cp1/cp2` 为 `{dx,dy}` 控制点 |
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
| `_snap(v)` | — | 网格吸附 |
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
| `_serializeData()` | — | 返回导出用序列化对象 `{nodes, connections, viewport}` |
| `_restoreFromSerialized(d, opts?)` | — | 用序列化数据整体恢复画布 |
| `_restoreCanvasSnapshot(snapshot)` | — | 恢复一条历史快照 |
| `updateCanvasUndoButtons()` | — | 刷新撤销/重做按钮禁用态 |

### 4.7 导入 / 导出

| 函数 | 签名 | 说明 |
|---|---|---|
| `exportPNG()` | `async exportPNG() -> Promise<void>` | 触发 PNG 下载（含能力探测与回退） |
| `_exportPNGLegacy()` | — | 旧版数据重绘导出 |
| `doExport()` | — | 导出 JSON 文件下载 |
| `doImport()` | — | 打开文件选择器导入 JSON |
| `_loadFromData(d)` | `_loadFromData({nodes, connections, viewport}) -> void` | 用一份 JSON 替换整个画布（自动校验/重建/渲染/快照） |
| `_readJsonFile(file)` | — | 读取 JSON 文件对象 |
| `_triggerDownload(dataUrl, name)` | — | 触发下载 |
| `_guardHasNodes()` | — | 是否有节点（导出前置检查） |

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

支持的快捷键动作：`undo`、`redo`、`selectAll`、`copy`、`paste`、`delete`、`autoModal`、`chrome`。

### 4.10 只读模式 / UI 显示

| 函数 | 签名 | 说明 |
|---|---|---|
| `toggleReadOnly()` | — | 切换只读模式（读写状态存在 `readOnly` 字段） |
| `toggleChrome()` | — | 切换界面 chrome（隐藏/显示工具栏等） |
| `showToast(text, type?, ms?)` | — | 顶部 toast 提示 |
| `_getEl(id)` | — | 取某 id 的 DOM 元素（见 §5） |
| `_updateStatusBadge()` | — | 刷新左下角「N 节点 · M 连线」徽标 |

### 4.11 App 全部成员索引

> 以下为 `App` 上可直接调用的完整成员表（源自 `Object.getOwnPropertyNames(App)`）。`#` 表示点击后通常伴随 `saveCanvasSnapshot()` + `renderCanvas()`。

| 类别 | 成员 |
|---|---|
| **状态字段** | `canvasState`、`dragState`、`isDragging`、`socketDragState`、`panX`、`panY`、`scale`、`selectedNodeIds`、`canvasPanState`、`canvasBoxState`、`_boxSelectJustCompleted`、`canvasHistoryIndex`、`_canvasHistoryMax`、`_linesRaf`、`_renderFilter`、`_cellSize`、`_nodeCells`、`_nodeCellMap`、`_connByNode`、`_connByIdMap`、`_lastVisibleCells`、`_lastRenderScale`、`_resolveColorCache`、`_forceRerenderPending`、`_modalNodeId`、`_inlineEditTarget`、`_inlineTeardown`、`_descEditNodeId`、`_descEditBlur`、`_descEditKeydown`、`_chromeHidden`、`_ctxNodeId`、`_ctxConnId`、`_ctxEditTarget`、`selectedConnIds`、`_curveEditState`、`_customColors`、`_cpState`、`_cpEls`、`_cpOnConfirm`、`_wheelImageData`、`_wheelCleanup`、`_selectedGenColor`、`readOnly`、`_autoOpenModal`、`_snapNodes`、`_snapSize`、`_suppressNextCanvasClick`、`_dragJustFinished`、`_zOrderDirty`、`_lastAddCenterX`、`_lastAddCenterY`、`_addCounter`、`_lang`、`_keybinds`、`_keybindEditing`、`_els`、`_nodeElMap`、`_nodeByIdCache`、`_nodeZOrder`、`_cachedCW`、`_cachedCH`、`_settings`、`_idSeq`、`_connOffsCache`、`debouncedAutoSave`、`_clipboard`、`_activeSnapAnims`、`_snapDataInterval`、`_snapRenderRaf`、`_snapDataHz`、`_dblClickTarget`、`_visPathByKey`、`_hitPathByKey`、`_labelByKey`、`_arrowPathByKey` |
| **工具方法** | `_getEl`、`_genId`、`_snap`、`t`、`showToast` |
| **语言** | `_applyLangUI`、`setLang`、`setLangZh`、`setLangEn`、`_updateLangButtons` |
| **存储** | `_lsGet`、`_lsSet`、`_lsGetJson` |
| **查找** | `_getNodeMap`、`_getNodeById` |
| **状态徽标** | `_updateStatusBadge` |
| **撤销/保存** | `saveCanvasSnapshot`、`_serializeData`、`saveCanvas`、`canvasUndo`、`canvasRedo`、`_restoreCanvasSnapshot`、`updateCanvasUndoButtons` |
| **导入/校验** | `_validateLoadedData`、`_restoreFromSerialized`、`_loadFromData` |
| **颜色** | `_resolveColor`、`_loadCustomColors`、`_saveCustomColors`、`_cycleNodeColors`、`openCustomPicker`、`cancelCustomPicker`、`confirmCustomColor`、`_renderModalDots`、`_dotsHtml`、`_setActiveDot`、`_buildDotPanel`、`_buildModalDots`、`_renderColorWheel`、`_updateWheelDot`、`_updateCpUI`、`_cpFromRGB`、`_cpFromWheel`、`_applyGenColorUI`、`_setGenColor`、`_buildGDots`、`_gOpenCustomPicker` |
| **视口/网格** | `_refreshContainerCache`、`getWorldPos`、`_viewportCenterWorld`、`_computeViewport`、`_zoomAbout`、`applyViewTransform`、`_drawGrid`、`updateCoordDisplay`、`_initCoordEditable`、`clampPan`、`centerCanvasOnNodes`、`centerCanvasOnOrigin` |
| **渲染** | `_rebuildZOrder`、`_applyZOrder`、`_bringToFront`、`_destroyNodeEls`、`_forceRerender`、`updateNodePositions`、`_prepCanvas`、`_ensureCanvasSkeleton`、`_renderNodes`、`_syncResizeHandles`、`_applyNodeSize`、`_hideResizeHandles`、`_showResizeHandles`、`_updateNodeAppearance`、`_postRenderUpdate`、`_finalizeRender`、`_refreshOverflowFlags`、`_cancelSnapAnim`、`renderCanvas` |
| **连线渲染** | `_getConnGeometry`、`_buildLinePath`、`_ensureSvgLayers`、`renderLines`、`_bindConnEl`、`_doRenderLines`、`_renderTempLine`、`_reconcileEl`、`_removeReconciled`、`_renderConnection`、`_removeConnection` |
| **空间索引/性能** | `_buildSpatialIndex`、`_getActiveCells`、`_getCellConnections`、`_updateNodeVisibility`、`_panUpdateConnections`、`_animateNodeToGrid`、`_snapDataTick`、`_snapRenderTick` |
| **交互** | `_bindDragListeners`、`onCanvasMouseDown`、`finalizeBoxSelect`、`onCanvasWheel`、`_bindSocketDrag`、`_bindNodeEvents`、`_bindResizeHandles`、`_initGlobalEvents`、`startNodeDrag`、`startSocketDrag`、`_findSocketHit`、`_onCanvasClick`、`_onCanvasDblClick` |
| **快捷键** | `_loadKeybinds`、`_keyMatch`、`_keybindLabel` |
| **描述编辑** | `_showDescEdit`、`_saveDescEdit`、`_closeDescEdit` |
| **节点操作** | `clearAllNodes`、`_addNodeAt`、`_resetAddAnchor`、`addNode`、`copyNodes`、`pasteNodes`、`selectAllNodes`、`removeNode`、`removeNodes` |
| **模态框** | `openNodeModal`、`closeModal`、`saveModal` |
| **克隆/内联** | `_cloneNode`、`_enterNodeInlineEdit`、`_bindInlineInputs`、`closeInlineEdit`、`_getInlineInput`、`saveInlineEdit`、`inlineEdit` |
| **右键菜单** | `ctxProps`、`ctxMirror`、`ctxResize`、`ctxResetSize`、`ctxDup`、`ctxDel` |
| **连线工具** | `_getConnById`、`_createConnection`、`_getConnOffY`、`_buildConnOffsetMap`、`_dropSelectionIfGone`、`_clearCurveEditIfNodesGone`、`_removeCurveHandles`、`_clearConnSelection`、`ctxCurveDrag`、`ctxResetCurve`、`_renderCurveHandles`、`_exitCurveEdit`、`_deleteConnection`、`_deleteConnections`、`_clearCtx` |
| **只读/设置/chrome** | `toggleReadOnly`、`showSettings`、`_showSettingsTab`、`_startKeybindEdit`、`_cancelKeybindEdit`、`_bindKeybindInputs`、`_resetKeybinds`、`closeSettings`、`toggleChrome` |
| **右键/导入导出** | `showCtx`、`ctxEdit`、`_readJsonFile`、`_guardHasNodes`、`_triggerDownload`、`doExport`、`_inlineExportFonts`、`_buildExportStyleText`、`_buildExportSnapshot`、`_buildExportSvgXml`、`_loadSvgImage`、`_foreignObjectProbe`、`_canUseDomSnapshot`、`_runSnapshotTiles`、`_validateExportContent`、`_drawExportGrid`、`_computeContentBounds`、`exportPNG`、`_exportPNGLegacy`、`doImport` |

> 约定：带 `_` 前缀的方法虽属「内部」，但在该 iframe 内同样可直接调用；下划线方法多用于底层管线，改数据后记得调用 `saveCanvasSnapshot()` 与 `renderCanvas()` 使改动可见并进入撤销历史。

---

## 5. 页面 UI 元素与可打开的界面

编辑器的 DOM 元素 id 如下，可用 `App._getEl('id')` 或 `document.getElementById('id')` 访问（多数由 `App._getEl` 缓存）。

**工具栏按钮**：`btnAddNode`（+节点）、`btnClearAllNodes`（清空）、`btnDoExport`（导出 JSON）、`btnDoImport`（导入 JSON）、`btnExportPNG`（导出 PNG）、`btnCenterCanvas`（居中）、`btnShowSettings`（设置）、`sidebarReadOnlyBtn`（只读）、`undoBtn` / `redoBtn`、`btnLangZh` / `btnLangEn`、`btnResetKeybinds`。

**可打开的界面**：

| 界面 | 触发方式 | 相关元素 |
|---|---|---|
| 节点属性模态框（标签/描述/颜色） | `App.openNodeModal(id)`，或双击节点 / 右键「属性」 | `modal`、`mLabel`、`mDesc`、`mTitle`、`mColors`、`mColorWheel`、`btnSaveModal`、`btnCloseModal` |
| 自定义色轮选择器 | `App.openCustomPicker(cb, hex)`，或节点模态框内选自定义 | `cpModal`、`cpModalBox`、`gPanelWheel`、`btnCancelPicker`、`btnConfirmColor` |
| 右键菜单 | `App.showCtx(x, y, nodeId, connId, target)` | `ctx` 及 `ctxProps/ctxEdit/ctxDup/ctxMirror/ctxResize/ctxResetSize/ctxCurveDrag/ctxResetCurve/ctxDel` |
| 设置面板 | `App.showSettings()` | `settingsModal`、`settingsBtns`、`setSnapNodes`、`setSnapSize`、`genColorDropdown`、`genColorPanel`、`genColorTrigger`、`gColorDots` |
| 节点标题/描述内联编辑 | `App.inlineEdit('nodeTitle'\|'nodeDesc', id)` | `inlineEdit`、`inlineInp`、`inlineTa` |
| 描述编辑行 | `App._showDescEdit(nodeId)` | `descEdit`、`descEditTa` |
| 坐标 HUD | 画布左下角 | `coord`、`coordX`、`coordY`、`coordZ` |
| 节点提示 | 悬停 | `nodeTip` |
| toast | `App.showToast(text, type?, ms?)` | `toastContainer` |

---

## 6. 常用示例

**① 生成一张见简的流程图（思维导图风格）**

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
const r = await weave.exportPng(); // {ok, value:{dataUrl, name}}
r.ok ? r.value.dataUrl : r.error
```

**⑤ 居中视口并放大**

```js
App.centerCanvasOnNodes(); App.scale = 1.5; App.applyViewTransform();
```

**⑥ 只读测评（切换只读 / 反复改后撤销）**

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

---

## 7. 注意事项与边界

1. **执行环境**：代码在嵌入的 Weave iframe 内执行，只能访问该编辑器页面的全局（`App` / `Weave` / `weave` / `document` / `localStorage`）。不能访问 harness 外壳，不能 import/require 外部模块，也不具备 Node / shell 权限（那些是其他工具如 `write` / `pwsh` 的职责）。
2. **入口是单个表达式**：需要多步时用 IIFE 包裹 —— `(() => { ...; return ... })()`，或 `(async () => {...})()` + `await`。
3. **改完记得渲染**：直接改 `App.canvasState.nodes/connections` 后，调用 `App.saveCanvasSnapshot()`（产生撤销历史并持久化）+ `App.renderCanvas()`（刷新画面）。若只想持久化不想要历史步骤，用 `App.saveCanvas()`。
4. **数据格式**：`weave.getData()` / `setData()` / `_serializeData()` 使用同一个文档格式（节点带 `id/label/desc/color/x/y/mirrored/w/h`，连线带 `id/from/to/label/cp1/cp2/mirrored`，外加 `viewport`）。该序列化格式里的 `x/y` 是网格单位（1 单位 = 20px），加载时自动换算回像素；而 `weave.addNode` / `App._addNodeAt` / 直接读写 `App.canvasState.nodes` 时 `x/y` 都是像素。把 `getData()` 读到的坐标用于 `weave.addNode()` 前先乘 20；`weave.addNode()` 省略 `w`/`h` 即为默认 170×80px 节点。布局时相邻节点中心距取横向约 15 格、纵向约 10 格，全部坐标控制在 ±50 格以内。
5. **断开/切换视图无影响**：编辑器为离屏常驻实例，用户切到聊天页等任意页面时，`weave` 工具仍可操作同一份画布；改完切回 Weave 页即可看到。
6. **清空**：`weave.setData({nodes:[],connections:[]})` 会清空全部内容并把撤销历史重置为新基线，是彻底清空的可信路径。`App.clearAllNodes()` 另带原生 `confirm()` 确认弹窗，离屏执行时可能被自动取消而无效，故优先用 `weave.setData()`。

---

*本文档由 `weave-for-dsh` 固定插件交付，接口列表直接来自运行实例的可见成员。*
