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

    /** Build (once per document) the `weave` bridge object the model's code uses. */
    function buildBridge(win) {
      const app = () => win.App;
      const saveAndRender = () => {
        const a = app();
        if (a && a.saveCanvasSnapshot) a.saveCanvasSnapshot();
        if (a && a.renderCanvas) a.renderCanvas();
      };
      return {
        /** Reuse Weave's own export pipeline and return the PNG data URL instead of downloading. */
        exportPng: async () => {
          const a = app();
          if (!a || typeof a.exportPNG !== "function") throw new Error("Weave 应用尚未就绪");
          const original = a._triggerDownload;
          let captured = null;
          a._triggerDownload = (dataUrl, name) => { captured = { dataUrl, name: name || "flow.png" }; };
          try {
            await a.exportPNG();
          } finally {
            a._triggerDownload = original;
          }
          if (!captured) throw new Error("导出未产生图片（画布为空?）");
          return { dataUrl: captured.dataUrl, name: captured.name };
        },
        /** Current document in Weave's own serialized format ({nodes,connections,viewport}). */
        getData: () => {
          const a = app();
          if (!a || typeof a._serializeData !== "function") throw new Error("Weave 应用尚未就绪");
          return a._serializeData();
        },
        /** Replace the whole canvas from the serialized format and return the new state. */
        setData: (data) => {
          const a = app();
          if (!a || typeof a._loadFromData !== "function") throw new Error("Weave 应用尚未就绪");
          a._loadFromData(data);
          if (a.renderCanvas) a.renderCanvas();
          return a._serializeData();
        },
        /** Add one node (label/desc/color/x/y/w/h), select it, save, and re-render. */
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
            w: spec.w ?? 170,
            h: spec.h ?? 80,
          };
          a.canvasState.nodes.push(node);
          if (a.selectedNodeIds) {
            a.selectedNodeIds.clear();
            a.selectedNodeIds.add(id);
          }
          saveAndRender();
          return node;
        },
        count: () => {
          const a = app();
          if (!a || !a.canvasState) throw new Error("Weave 应用尚未就绪");
          return { nodes: a.canvasState.nodes.length, connections: a.canvasState.connections.length };
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
