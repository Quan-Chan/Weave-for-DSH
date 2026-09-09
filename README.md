<h1 align="center">Weave-for-DSH</h1>

<p align="center">纯网页的节点式图编辑器 —— 自由摆放节点，拖拽 socket 连线，构建思维导图、流程图与逻辑树。</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Quan-Chan/Weave-for-DSH/main/gif/usage.gif" alt="Weave 使用演示" width="720">
</p>

<hr>

<h2>DeepSeek Harness 插件版</h2>

本仓库在原版 Weave 之上做了插件化封装，编辑器本体原样打包（当前捆绑 [Weave v1.3](https://github.com/Quan-Chan/Weave/releases/tag/v1.3)）、未做任何修改：

- **页面内嵌** — 编辑器作为会话的第三个页面视图（chat / trajectory / **Weave**）嵌入 DeepSeek Harness，用户可直接拖拽节点、连线、编辑
- **离屏常驻** — 编辑器 iframe 始终存活，AI 在任意页面视图下操作的都是同一份画布
- **`weave` AI 工具** — AI 可直接操控画布，见下文
- **AI 教学 skill 与文档** — 内置 [skills/weave/SKILL.md](skills/weave/SKILL.md) 与 [docs/weave-api.md](docs/weave-api.md)；skill 由插件自动注册进 agent 技能目录，装好即可用，无需手动复制

安装（声明了 `dsh.bundle` 的组合包，一条命令装进 Web profile）：

```sh
dsh plugin --profile web add github:Quan-Chan/Weave-for-DSH
```

`dsh plugin` 转发给 pnpm，需先安装 pnpm（`npm install -g pnpm` 或启用 corepack）。安装来源可为 git 仓库、npm registry 包名、tgz 文件或本地目录；这些来源都匿名可装，不需要 npm 账号（npm 账号只在发布时使用）。本包是纯 JS + 静态资源，无构建脚本，git 直装不触发 pnpm 的构建审批。

各来源对应命令：

```sh
dsh plugin --profile web add github:Quan-Chan/Weave-for-DSH   # git 仓库
dsh plugin --profile web add weave-for-dsh                     # npm registry（发布后）
dsh plugin --profile web add ./weave-for-dsh-0.1.2.tgz         # npm pack 产物
dsh plugin --profile web add ./weave-for-dsh                    # 本地 checkout
```

无 pnpm 时也可手工安装：把包目录复制到 `$DSH_HOME/profiles/node_modules/weave-for-dsh`，并在 profile 的 `cordis.patch.yml` 中插入插件行（见包内 `cordis.patch.yml`）。安装后重启 `dsh web` 并刷新会话页面，会话页面上方出现 **Weave** 页面选项，agent 工具集中出现 `weave` 工具。

<hr>

<h2>功能</h2>

- **节点** — 添加、删除、选中（单击 / 框选 / 多选）、拖拽移动、内联编辑、复制粘贴、收起 / 展开节点串（隐藏沿连线可达的后代，保存相对位置，展开时恢复）
- **关联高亮** — 按住 Alt 单击节点，高亮该节点及其直接关联的节点与连线，其余内容模糊（Alt 点击其他节点可切换高亮对象）
- **分区** — 顶栏「分区」按钮或 Shift+R / Alt+拖拽绘制可嵌套分区框，整框收编节点，名称 / 颜色可编辑，移动分区随动其节点
- **连线** — socket 拖拽创建、删除、标签编辑、贝塞尔曲线自定义调整
- **画布** — 平移（拖拽 / 中键）、滚轮缩放、适应视图、坐标 HUD 编辑
- **颜色** — 5 种预设色 + 自定义色轮选择器，Ctrl+滚轮快速切换
- **导入/导出** — JSON 导入导出（含分区、收起记录与视口信息）、PNG 导出、拖拽 JSON 文件导入
- **其他** — 撤销/重做（最多 50 步）、只读模式、专注模式（Ctrl+H）、对齐设置（节点/分区位置与大小 4 项，含一键重置）、键位设置（首次启动自动弹出，快捷键可自定义）、语言切换（设置内：中文 / English）、自动保存到 localStorage

<hr>

<h2>AI 工具</h2>

插件注册 `weave` 工具，把一段 JavaScript 表达式送进编辑器执行并返回 JSON，AI 据此直接增删改节点/连线、整体读写画布、导出 PNG：

- `code`（必填）— JavaScript 表达式，支持 `await`
- `timeoutMs`（可选）— 超时，默认 60000

表达式内可用的全局：`App`（编辑器应用对象）、`Weave`（工具库：`Util` / `Color` / `Geom`）、`weave`（桥接对象：`addNode` / `addRegion` / `removeRegion` / `collapseNode` / `expandNode` / `toggleCollapse` / `canCollapse` / `getData` / `setData` / `exportPng` / `count`）。

```js
weave.addNode({ label: "需求分析", color: "blue", x: 0, y: 0 })   // 加节点
weave.addRegion({ x: -80, y: -120, w: 600, h: 280, label: "模块" }) // 画分区
weave.collapseNode(id)                                            // 收起节点后代
weave.getData()                                                    // 读整张图（含 regions 与 collapse）
weave.setData({ nodes: [...], connections: [...], regions: [...] }) // 整体替换
await weave.exportPng()                                            // 导出 PNG，返回 {dataUrl, name}
weave.count()                                                      // 数量
```

完整接口与示例见 [docs/weave-api.md](docs/weave-api.md)，AI 教学版见 [skills/weave/SKILL.md](skills/weave/SKILL.md)。

<hr>

<h2>技术栈展示</h2>

Weave 用纯前端技术构建，零框架、零依赖、零构建步骤，一个 HTML 文件构成完整产品：

- **纯 JavaScript** — 全部逻辑内联在单文件中，无框架、无构建，源码即产品
- **HTML5 + CSS3** — 结构标记 + CSS 变量主题，界面风格统一易维护
- **Canvas 2D** — 绘制网格背景与连线，缩放平移时流畅重绘
- **SVG** — 叠加层承载贝塞尔曲线控制手柄与连线标签，可精确交互
- **localStorage** — 画布数据自动持久化，刷新或重开不丢失

<hr>

<h2>贡献与主仓库</h2>

本项目分两层，修改目标不同：

- **编辑器本体**（画布、节点、连线、分区、收起/展开等编辑功能）— 主仓库 [Quan-Chan/Weave](https://github.com/Quan-Chan/Weave)
- **DSH 插件封装**（页面嵌入、`weave` AI 工具、桥接方法、skill 与文档）— 本仓库 [Quan-Chan/Weave-for-DSH](https://github.com/Quan-Chan/Weave-for-DSH)

问题与改动建议按上述归属提交到对应仓库的 issue 与 pull request。编辑器本体以 release 资产形式捆绑进本包（见上文版本说明），上游发版后由本仓库同步更新。

<hr>

<h2>许可证</h2>

本项目采用 <a href="LICENSE">Apache License 2.0</a> 开源。

<pre>Copyright © 2026 Quan-Chan</pre>
