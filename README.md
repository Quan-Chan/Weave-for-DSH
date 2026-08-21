<h1 align="center">Weave-for-DSH</h1>

<p align="center">纯网页的节点式图编辑器 —— 自由摆放节点，拖拽 socket 连线，构建思维导图、流程图与逻辑树。</p>

<p align="center">
  <img src="gif/usage.gif" alt="Weave 使用演示" width="720">
</p>

<hr>

<h2>DeepSeek Harness 插件版</h2>

本仓库在原版 Weave 之上做了插件化封装，编辑器本体原样打包、未做任何修改：

- **页面内嵌** — 编辑器作为会话的第三个页面视图（chat / trajectory / **Weave**）嵌入 DeepSeek Harness，用户可直接拖拽节点、连线、编辑
- **离屏常驻** — 编辑器 iframe 始终存活，AI 在任意页面视图下操作的都是同一份画布
- **`weave` AI 工具** — AI 可直接操控画布，见下文
- **AI 教学 skill 与文档** — 内置 [skills/weave/SKILL.md](skills/weave/SKILL.md) 与 [docs/weave-api.md](docs/weave-api.md)；skill 由插件自动注册进 agent 技能目录，装好即可用，无需手动复制

安装（声明了 `dsh.bundle` 的组合包，一条命令装进 Web profile）：

```sh
dsh plugin --profile web add github:Quan-Chan/Weave-for-DSH
```

本包是纯 JS + 静态资源，没有构建步骤，git 直装即可，也不需要 pnpm 的构建授权。也支持其他安装形式：`dsh plugin --profile web add weave-for-dsh`（发布到 npm 后）、`dsh plugin --profile web add ./weave-for-dsh-0.1.0.tgz`（`pnpm pack` 产物）、`dsh plugin --profile web add ./weave-for-dsh`（本地 checkout）。安装后重启 `dsh web` 并刷新会话页面，会话页面上方出现 **Weave** 页面选项，agent 工具集中出现 `weave` 工具。

<hr>

<h2>功能</h2>

- **节点** — 添加、删除、选中（单击 / 框选 / 多选）、拖拽移动、内联编辑、复制粘贴
- **连线** — socket 拖拽创建、删除、标签编辑、贝塞尔曲线自定义调整
- **画布** — 平移（拖拽 / 中键）、滚轮缩放、适应视图、坐标 HUD 编辑
- **颜色** — 5 种预设色 + 自定义色轮选择器，Ctrl+滚轮快速切换
- **导入/导出** — JSON 导入导出（含视口信息）、PNG 导出、拖拽 JSON 文件导入
- **其他** — 撤销/重做（最多 50 步）、只读模式、专注模式（Ctrl+H）、键位设置（首次启动自动弹出，快捷键可自定义）、语言切换（设置内：中文 / English）、自动保存到 localStorage

<hr>

<h2>AI 工具</h2>

插件注册 `weave` 工具，把一段 JavaScript 表达式送进编辑器执行并返回 JSON，AI 据此直接增删改节点/连线、整体读写画布、导出 PNG：

- `code`（必填）— JavaScript 表达式，支持 `await`
- `timeoutMs`（可选）— 超时，默认 60000

表达式内可用的全局：`App`（编辑器应用对象）、`Weave`（工具库：`Util` / `Color` / `Geom`）、`weave`（桥接对象：`addNode` / `getData` / `setData` / `exportPng` / `count`）。

```js
weave.addNode({ label: "需求分析", color: "blue", x: 0, y: 0 })   // 加节点
weave.getData()                                                    // 读整张图
weave.setData({ nodes: [...], connections: [...] })                // 整体替换
await weave.exportPng()                                            // 导出 PNG，返回 {dataUrl, name}
weave.count()                                                      // 数量
```

完整接口与示例见 [docs/weave-api.md](docs/weave-api.md)，AI 教学版见 [skills/weave/SKILL.md](skills/weave/SKILL.md)。

<hr>

<h2>技术栈展示</h2>

Weave 用纯前端技术构建，零框架、零依赖、零构建步骤，一个 HTML 文件就是完整产品：

- **纯 JavaScript** — 全部逻辑内联在单文件中，无框架、无构建，源码即产品
- **HTML5 + CSS3** — 语义化结构 + CSS 变量主题，界面风格统一易维护
- **Canvas 2D** — 绘制网格背景与连线，缩放平移时流畅重绘
- **SVG** — 叠加层承载贝塞尔曲线控制手柄与连线标签，可精确交互
- **localStorage** — 画布数据自动持久化，刷新或重开不丢失

<hr>

<h2>许可证</h2>

本项目采用 <a href="LICENSE">Apache License 2.0</a> 开源。

<pre>Copyright © 2026 Quan-Chan</pre>
