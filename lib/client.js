/**
 * weave-for-dsh — Client half (browser bundle).
 *
 * The Weave editor lives OUTSIDE the conversation view ring so it is always
 * reachable by the `weave` tool even while the user reads the chat: one
 * iframe is mounted permanently in a hidden shell-overlay host (offscreen,
 * fixed size, no pointer events), keeping its in-app state alive. The
 * `conversation.view` entry (the third page tab) is a display seat that
 * re-parents that SAME iframe into the session body while the tab is active,
 * and moves it back offscreen when the user switches away. The take-loop that
 * drives the `weave` tool reads the shared iframe, so AI edits apply at any
 * time and the user simply returns to the Weave tab to see them.
 *
 * Since the bundled editor v2.0 the app holds TWO independent documents —
 * the node graph ("graph") and the sequence diagram ("sequence") — switched
 * by swapping the canvasState pointer (`App._setMode`). The bridge mirrors
 * that: mode get/set, and separate connection verbs per mode (`addConnection`
 * for graph edges, `addMessage` for sequence messages), while node, read,
 * write, export, region and count verbs stay mode-agnostic.
 *
 * Bundled editor: Weave v2.0.3. Since v2.0.2 region frames are available in
 * BOTH canvas modes again, so `addRegion`/`removeRegion` no longer refuse to
 * run in sequence mode; node-chain collapse/expand remains node-graph only.
 */

window.__ModuleLoader__.load({
  id: "weave-for-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let React = require("react");

    const APP_URL = "/weave/app";
    const CHANNEL = "/weave";

    // The single Weave iframe instance, permanent for the page lifetime. It is
    // owned by no React subtree (created imperatively), so unmounting a view
    // tab never destroys it — only its parent container changes.
    let frameElement = null;
    // Detached offscreen host (created in apply) that parks the frame while no
    // Weave tab is active.
    let parkHost = null;
    // The frame the take-loop drives (always the shared instance).
    let liveFrame = null;

    /** Create the shared Weave iframe once, or return the existing instance. */
    function ensureFrame() {
      if (frameElement !== null) return frameElement;
      const frame = document.createElement("iframe");
      frame.title = "Weave 节点图编辑器";
      frame.setAttribute("src", APP_URL);
      frame.style.cssText =
        "position:absolute; left:-9999px; top:0; width:1200px; height:800px;"
        + " border:0; background:#f8f9fb; pointer-events:none;";
      frameElement = frame;
      liveFrame = frame;
      return frame;
    }

    /** Park the shared iframe back into the offscreen host. */
    function parkFrame() {
      if (frameElement === null || parkHost === null) return;
      if (frameElement.parentNode !== parkHost) {
        frameElement.style.cssText =
          "position:absolute; left:-9999px; top:0; width:1200px; height:800px;"
          + " border:0; background:#f8f9fb; pointer-events:none;";
        parkHost.appendChild(frameElement);
      }
      liveFrame = frameElement;
    }

    /** Sequence lifeline default length in px (upstream SEQ_LIFE_DEFAULT). */
    const SEQ_LIFE_DEFAULT = 200;
    /** Node default width in px (upstream NODE_DEFAULT_W, 180 since v2.0). */
    const NODE_DEFAULT_W = 180;

    /** Build (once per document) the `weave` bridge object the model's code uses. */
    function buildBridge(win) {
      const app = () => win.App;
      const saveAndRender = () => {
        const a = app();
        if (a && a.saveCanvasSnapshot) a.saveCanvasSnapshot();
        if (a && a.renderCanvas) a.renderCanvas();
      };
      /** Whether the editor currently shows the sequence-diagram document. */
      const isSeq = (a) => !!(a && typeof a._isSeqMode === "function" && a._isSeqMode());
      /** Drop the parallel-line offset cache after a direct connections mutation. */
      const dropConnCache = (a) => { if ("_connOffsCache" in a) a._connOffsCache = null; };
      return {
        /** Current canvas mode: "graph" (node graph) or "sequence" (sequence diagram). */
        getMode: () => {
          const a = app();
          if (!a || !a._mode) throw new Error("Weave 应用尚未就绪");
          return a._mode;
        },
        /** Switch the canvas mode; each mode keeps its own independent document. */
        setMode: (mode) => {
          const a = app();
          if (!a || typeof a._setMode !== "function") throw new Error("Weave 应用尚未就绪或当前版本不支持切换模式");
          if (mode !== "graph" && mode !== "sequence") throw new Error('mode 只能是 "graph"（节点图）或 "sequence"（时序图）');
          a._setMode(mode);
          saveAndRender();
          return a._mode;
        },
        /** Reuse Weave's own export pipeline and return the PNG as a data URL.
         *  Since v2.0 the app embeds the document archive into the PNG bytes and
         *  hands out a blob: object URL; normalize it so the result survives the
         *  JSON transport to the host. */
        exportPng: async () => {
          const a = app();
          if (!a || typeof a.exportPNG !== "function") throw new Error("Weave 应用尚未就绪");
          const original = a._triggerDownload;
          let captured = null;
          a._triggerDownload = (href, name) => { captured = { href, name: name || "flow.png" }; };
          try {
            await a.exportPNG();
          } finally {
            a._triggerDownload = original;
          }
          if (!captured) throw new Error("导出未产生图片（画布为空?）");
          let href = captured.href;
          if (typeof href === "string" && href.startsWith("blob:")) {
            const blob = await (await fetch(href)).blob();
            href = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error("导出图片读取失败"));
              reader.readAsDataURL(blob);
            });
          }
          if (typeof href !== "string" || !href.startsWith("data:")) throw new Error("导出产生了无法识别的图片引用");
          return { dataUrl: href, name: captured.name };
        },
        /** Current document in Weave's own serialized format (shape depends on the mode). */
        getData: () => {
          const a = app();
          if (!a || typeof a._serializeData !== "function") throw new Error("Weave 应用尚未就绪");
          return a._serializeData();
        },
        /** Replace the current document from the serialized format and return the new state. */
        setData: (data) => {
          const a = app();
          if (!a || typeof a._loadFromData !== "function") throw new Error("Weave 应用尚未就绪");
          a._loadFromData(data);
          if (a.renderCanvas) a.renderCanvas();
          return a._serializeData();
        },
        /** Add one node (label/desc/color/x/y/w/h; seq mode also life), select it, save, and re-render. */
        addNode: (spec = {}) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          const id = (a._genId && a._genId()) || ("n" + Date.now() + Math.random().toString(16).slice(2, 8));
          const x = a._snap ? a._snap(spec.x ?? 0) : (spec.x ?? 0);
          const y = a._snap ? a._snap(spec.y ?? 0) : (spec.y ?? 0);
          const node = {
            id,
            label: spec.label ?? (a.t ? a.t("misc.newNode") : "未命名"),
            desc: spec.desc ?? "",
            color: spec.color ?? a._selectedGenColor ?? "blue",
            x,
            y,
            mirrored: false,
            w: spec.w ?? NODE_DEFAULT_W,
            h: spec.h ?? 80,
          };
          // Sequence document: every participant carries a lifeline; graph
          // document nodes never carry the key (upstream _addNodeAt semantics).
          if (isSeq(a)) node.life = spec.life ?? SEQ_LIFE_DEFAULT;
          a.canvasState.nodes.push(node);
          if (a.selectedNodeIds) {
            a.selectedNodeIds.clear();
            a.selectedNodeIds.add(id);
          }
          if (a._syncNodeRegionMembership) a._syncNodeRegionMembership(id);
          saveAndRender();
          return node;
        },
        /** Create one region frame.
         *  spec is all pixels: x/y top-left, w/h size; optional label/color.
         *  Whole contained un-owned nodes are captured into nodeIds; deepest
         *  existing region under the center becomes parentId.
         *  Since Weave v2.0.2 region frames work in BOTH canvas modes (the
         *  node graph and the sequence diagram), so this verb is mode-agnostic. */
        addRegion: (spec = {}) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (!Array.isArray(a.canvasState.regions)) a.canvasState.regions = [];
          const Geom = win.Weave && win.Weave.Geom;
          const snapPos = (v) => (a._snap ? a._snap(v, a._snapRegionPos !== false) : v);
          const snapSize = (v) => (a._snap ? a._snap(v, a._snapRegionSize === true) : v);
          const id = (a._genId && a._genId("rg")) || ("rg" + Date.now().toString(36) + Math.random().toString(16).slice(2, 6));
          const x = snapPos(spec.x ?? 0);
          const y = snapPos(spec.y ?? 0);
          const w = Math.max(40, snapSize(spec.w ?? 400));
          const h = Math.max(30, snapSize(spec.h ?? 300));
          const region = {
            id,
            label: spec.label ?? (a.t ? a.t("misc.region") : "分区"),
            color: spec.color ?? a._selectedGenColor ?? "blue",
            x, y, w, h,
            nodeIds: [],
            parentId: null,
          };
          const owned = new Set();
          a.canvasState.regions.forEach((r) => (r.nodeIds || []).forEach((nid) => owned.add(nid)));
          const inRect = (nr) => Geom
            ? Geom.rectContains(x, y, x + w, y + h, nr.x, nr.y, nr.w, nr.h)
            : (nr.x >= x && nr.y >= y && nr.x + nr.w <= x + w && nr.y + nr.h <= y + h);
          a.canvasState.nodes.forEach((n) => {
            if (owned.has(n.id)) return;
            if (a._isCollapseHidden && a._isCollapseHidden(n.id)) return;
            const nr = Geom ? Geom.getNodeRect(n) : { x: n.x, y: n.y, w: n.w, h: n.h };
            if (inRect(nr)) region.nodeIds.push(n.id);
          });
          // Regions wholly inside the new frame become its children; the new
          // frame's own parent is the deepest existing region under its center
          // that is NOT one of those captured children (avoids a cycle).
          const capturedRegionIds = new Set();
          a.canvasState.regions.forEach((r) => {
            if (inRect({ x: r.x, y: r.y, w: r.w, h: r.h })) capturedRegionIds.add(r.id);
          });
          if (a._regionAtPoint) {
            let parent = a._regionAtPoint(x + w / 2, y + h / 2);
            let guard = 0;
            while (parent && capturedRegionIds.has(parent.id) && guard++ < 1000) {
              parent = parent.parentId && a._getRegionById ? a._getRegionById(parent.parentId) : null;
            }
            if (parent && parent.id !== id) region.parentId = parent.id;
          }
          a.canvasState.regions.push(region);
          capturedRegionIds.forEach((cid) => {
            const cr = a._getRegionById ? a._getRegionById(cid) : null;
            if (cr && cr.parentId !== region.id) cr.parentId = region.id;
          });
          if (a.selectedNodeIds) {
            a.selectedNodeIds.clear();
            a.selectedNodeIds.add(...region.nodeIds);
          }
          if (a.selectedRegionId !== undefined) a.selectedRegionId = id;
          saveAndRender();
          return region;
        },
        /** Delete one region frame only; nodes/connections inside stay. */
        removeRegion: (id) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (typeof a.removeRegion !== "function") throw new Error("当前版本不支持分区");
          a.removeRegion(id);
          return a._serializeData().regions;
        },
        /** Collapse a node (node graph only): hide its reachable descendant chain (App.collapseChain). */
        collapseNode: (nodeId) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (isSeq(a)) throw new Error("时序图模式不支持节点串收起（消息不是节点串的后继）");
          if (typeof a.collapseChain !== "function") throw new Error("当前版本不支持收起");
          return a.collapseChain(nodeId) === true;
        },
        /** Expand a collapsed node: restore hidden descendants at saved relative offsets (App.expandChain). */
        expandNode: (nodeId) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (isSeq(a)) throw new Error("时序图模式不支持节点串收起");
          if (typeof a.expandChain !== "function") throw new Error("当前版本不支持收起");
          return a.expandChain(nodeId) === true;
        },
        /** Toggle a node between collapsed and expanded (node graph only). */
        toggleCollapse: (nodeId) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (isSeq(a)) throw new Error("时序图模式不支持节点串收起");
          if (typeof a.toggleCollapse !== "function") throw new Error("当前版本不支持收起");
          return a.toggleCollapse(nodeId) === true;
        },
        /** Whether the node can be collapsed (has reachable descendants and no multi-parent conflict). */
        canCollapse: (nodeId) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (isSeq(a)) throw new Error("时序图模式不支持节点串收起");
          if (typeof a._canToggleCollapse !== "function") throw new Error("当前版本不支持收起");
          if (!a._getNodeById || !a._getNodeById(nodeId)) throw new Error("节点不存在");
          return a._canToggleCollapse(nodeId);
        },
        /** Create one graph edge between two nodes (node graph only).
         *  opts: label, cp1/cp2 (bezier control points), mirrored. */
        addConnection: (fromId, toId, opts = {}) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (isSeq(a)) throw new Error("时序图模式请用 weave.addMessage() 建消息；addConnection 仅用于节点图连线");
          if (typeof a._createConnection !== "function") throw new Error("当前版本不支持直接建线");
          if (!a._getNodeById || !a._getNodeById(fromId) || !a._getNodeById(toId)) throw new Error("节点不存在");
          if (fromId === toId) throw new Error("连线的两端不能是同一节点");
          const spec = { mirrored: !!opts.mirrored };
          if (opts.label !== undefined) spec.label = opts.label;
          if (opts.cp1) spec.cp1 = opts.cp1;
          if (opts.cp2) spec.cp2 = opts.cp2;
          const conn = a._createConnection(fromId, toId, spec);
          a.canvasState.connections.push(conn);
          dropConnCache(a);
          saveAndRender();
          return conn;
        },
        /** Create one sequence message between two lifelines (sequence mode only).
         *  y is the message height in world px; default is the source lifeline
         *  midpoint. opts: label, dashed, color. Too-short lifelines are
         *  auto-extended (upstream invariant: message ends never dangle). */
        addMessage: (fromId, toId, y, opts = {}) => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          if (!isSeq(a)) throw new Error('仅时序图模式可添加消息；可先 weave.setMode("sequence") 切换');
          if (typeof a._createConnection !== "function") throw new Error("当前版本不支持直接建线");
          if (!a._getNodeById || !a._getNodeById(fromId) || !a._getNodeById(toId)) throw new Error("节点不存在");
          if (fromId === toId) throw new Error("消息的两端不能是同一节点");
          const Geom = win.Weave && win.Weave.Geom;
          const anchorY = (n) => (Geom && Geom.seqLifeAnchor ? Geom.seqLifeAnchor(n).y : n.y + n.h);
          const lo = Math.max(anchorY(a._getNodeById(fromId)), anchorY(a._getNodeById(toId)));
          const want = Number.isFinite(y) ? y
            : (Geom && Geom.seqMsgDefaultY ? Geom.seqMsgDefaultY(a._getNodeById(fromId)) : lo + 100);
          // Land directly on the snapped height instead of riding the drag
          // preview animation, so the value AI reads back is already final.
          const snapped = Math.max(lo, a._snapSeqY ? a._snapSeqY(want) : want);
          const spec = { y: snapped };
          if (opts.label !== undefined) spec.label = opts.label;
          if (opts.dashed) spec.dashed = true;
          if (opts.color) spec.color = opts.color;
          const conn = a._createConnection(fromId, toId, spec);
          a.canvasState.connections.push(conn);
          dropConnCache(a);
          // Extend too-short lifelines so both arrow ends stay anchored.
          if (a._repairSeqMessages) a._repairSeqMessages(false, true);
          saveAndRender();
          return conn;
        },
        count: () => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          return {
            nodes: a.canvasState.nodes.length,
            connections: a.canvasState.connections.length,
            regions: a.canvasState.regions ? a.canvasState.regions.length : 0,
          };
        },
      };
    }

    /** Whether the Weave application is booted in `win`. */
    function readyApp(win) {
      return !!win && !!win.App && !!win.App.canvasState;
    }

    /** Run one model snippet inside the embedded app and return {ok,value}|{ok,error}. */
    async function runInFrame(code, timeoutMs) {
      // The offscreen host mounts at page boot; a very early tool call can
      // race it, so wait briefly for the shared frame before failing.
      const frameDeadline = Date.now() + 5000;
      while (liveFrame === null && Date.now() < frameDeadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const frame = liveFrame;
      if (!frame) return { ok: false, error: "Weave 编辑器尚未就绪（请稍后重试）" };
      const win = frame.contentWindow;
      if (!win) return { ok: false, error: "Weave 编辑器尚未就绪（请稍后重试）" };
      const deadline = Date.now() + 15000;
      while (!readyApp(win)) {
        if (Date.now() > deadline) return { ok: false, error: "Weave 应用加载超时" };
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!win.__weaveBridge) win.__weaveBridge = buildBridge(win);
      // The user expression travels as a JSON string, never interpolated into a
      // literal, then becomes an awaited function body. `weave`, `App`, and
      // `Weave` are bound as parameters so the code runs in the app document
      // scope where those globals live. The generated source concatenates
      // `__source` (the decoded user code) into a `new Function` body.
      const wrapped =
        "const __source = " + JSON.stringify(code) + ";"
        + " const __body = 'return (async () => { try { const __value = await (' + __source + '); "
        + "return JSON.stringify({ ok: true, value: __value === undefined ? null : __value }); } "
        + "catch (__e) { return JSON.stringify({ ok: false, error: String((__e && __e.message) || __e) }); } })()';"
        + " const __run = new Function('weave','App','Weave', __body);"
        + "__run(window.__weaveBridge, window.App, window.Weave)";
      let text;
      try {
        const promise = win.eval(wrapped);
        text = await promise;
      } catch (err) {
        return { ok: false, error: "编辑器执行出错: " + String(err) };
      }
      try {
        return JSON.parse(text);
      } catch {
        return { ok: false, error: "编辑器返回了无法解析的结果" };
      }
    }

    /**
     * Permanent offscreen host in `shell.overlay` (root scope, always mounted).
     * It owns the single Weave iframe. While no Weave tab is active the frame
     * parks here — hidden but alive, so the `weave` tool keeps working.
     */
    function WeaveHost(_props) {
      const ref = React.useRef(null);
      React.useEffect(function () {
        const div = ref.current;
        if (div === null) return;
        parkHost = div;
        const frame = ensureFrame();
        if (frame.parentNode !== div) div.appendChild(frame);
        return function cleanup() {
          // Frame outlives the host container (page lifetime); on the off-chance
          // this entry remounts, it is re-parented in the next effect run.
          parkHost = null;
        };
      }, []);
      return React.createElement("div", {
        ref,
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          pointerEvents: "none",
        },
      });
    }

    /**
     * The third conversation view tab: shows the SHARED Weave instance inline
     * while this tab is active. When the user switches to chat/trajectory the
     * tab unmounts and parks the frame offscreen again; its state (and the
     * AI's in-flight edits) survive.
     */
    function WeaveView(_props) {
      const ref = React.useRef(null);
      React.useLayoutEffect(function () {
        const div = ref.current;
        if (div === null) return;
        const frame = ensureFrame();
        if (frame.parentNode !== div) {
          frame.style.cssText =
            "width:100%; height:100%; min-height:60vh; border:0;"
            + " background:#f8f9fb; display:block; pointer-events:auto;";
          div.appendChild(frame);
        }
        liveFrame = frame;
        return function cleanup() {
          parkFrame();
        };
      }, []);
      return React.createElement("div", { ref, style: { width: "100%", height: "100%" } });
    }

    /** Pull pending commands from the Host and run them in the embedded page. */
    async function takeLoop(ctx, stopped) {
      while (!stopped.aborted) {
        let taken;
        try {
          const res = await ctx.connection.rpc.call(CHANNEL, "take", {});
          taken = res && res.ok ? res.value : null;
        } catch (err) {
          if (stopped.aborted) break;
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        if (!taken) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        const out = await runInFrame(taken.code, taken.timeoutMs);
        try {
          await ctx.connection.rpc.call(CHANNEL, "submit", {
            commandId: taken.commandId,
            ok: out.ok,
            value: out.ok ? out.value : undefined,
            error: out.ok ? undefined : out.error,
          });
        } catch (err) {
          // A lost submit means the tool times out on the Host; nothing to retry.
        }
      }
    }

    const inject = ["connection", "slots"];

    function apply(ctx) {
      const stopped = { aborted: false };
      ctx.effect(function () {
        void takeLoop(ctx, stopped);
        return function () { stopped.aborted = true; };
      }, "weave: take loop");
      // Permanent offscreen host: the editor instance never unmounts, so the
      // `weave` tool is reachable in every view.
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "weave-host",
          order: 100,
        }, WeaveHost);
      });
      // Third conversation view tab (after chat 0 and trajectory 10): a display
      // seat that brings the shared instance into the session body.
      ctx.slots.inject("conversation.view", function () {
        return ctx.slots.register({
          name: "conversation.view",
          id: "weave",
          order: 20,
          label: () => "Weave",
        }, WeaveView);
      });
    }

    exports.apply = apply;
    exports.inject = inject;

    return module.exports;
  }
});
