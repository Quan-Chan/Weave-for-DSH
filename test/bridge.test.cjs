// Bridge regression against the bundled Weave asset (puppeteer-core, no deps).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const REPO = path.resolve(__dirname, '..');
const HTML = path.join(REPO, 'assets', 'Weave.html');
const CLIENT = path.join(REPO, 'lib', 'client.js');
const CHROME = 'C:/Users/wsaasw/.cache/puppeteer/chrome/win64-155.0.8059.84/chrome-win64/chrome.exe';

const html = fs.readFileSync(HTML, 'utf8');
const clientSrc = fs.readFileSync(CLIENT, 'utf8');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.setContent(html, { waitUntil: 'load' });

  // Wait for the app to boot.
  for (let i = 0; i < 100; i++) {
    const ok = await page.evaluate(() => !!(window.App && window.App.canvasState));
    if (ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Extract the bridge factory from client.js and build it in the page.
  const start = clientSrc.indexOf('function buildBridge(win)');
  const end = clientSrc.indexOf('    /** Whether the Weave application is booted in `win`. */');
  if (start < 0 || end < 0) throw new Error('cannot locate buildBridge in client.js');
  const fnSrc = clientSrc.slice(start, end);
  await page.evaluate((src) => {
    const f = new Function('return (' + src + ')')();
    window.__weaveBridge = f(window);
  }, fnSrc);

  const results = [];
  const check = (name, cond, extra) => {
    results.push({ name, ok: !!cond, extra: cond ? undefined : extra });
  };

  const run = async (code) => page.evaluate(async (c) => {
    const wrapped =
      'const __source = ' + JSON.stringify(c) + ';'
      + " const __body = 'return (async () => { try { const __value = await (' + __source + '); "
      + "return JSON.stringify({ ok: true, value: __value === undefined ? null : __value }); } "
      + "catch (__e) { return JSON.stringify({ ok: false, error: String((__e && __e.message) || __e) }); } })()';"
      + " const __run = new Function('weave','App','Weave', __body);"
      + '__run(window.__weaveBridge, window.App, window.Weave)';
    const text = await window.eval(wrapped);
    return JSON.parse(text);
  }, code);
  // --- 1. mode ---
  let r = await run('weave.getMode()');
  check('getMode default graph', r.ok && r.value === 'graph', r);

  // --- 2. graph node + connection ---
  r = await run(`(() => {
    const a = weave.addNode({ label: 'A', color: 'blue', x: 0, y: 0 });
    const b = weave.addNode({ label: 'B', color: 'green', x: 400, y: 0 });
    const c = weave.addConnection(a.id, b.id, { label: '依赖' });
    return { a, b, c, count: weave.count() };
  })()`);
  check('graph addNode/addConnection', r.ok && r.value.c && r.value.c.label === '依赖' && r.value.count.connections === 1, r);
  const aId = r.ok ? r.value.a.id : null;
  const bId = r.ok ? r.value.b.id : null;

  // --- 3. node default width 180 ---
  r = await run('weave.addNode({ label: "W" }).w');
  check('node default width 180', r.ok && r.value === 180, r);

  // --- 4. region in graph mode ---
  r = await run(`(() => {
    const rg = weave.addRegion({ x: -60, y: -100, w: 920, h: 320, label: '模块 A' });
    return { rg, count: weave.count() };
  })()`);
  check('addRegion in graph mode', r.ok && r.value.rg && r.value.count.regions === 1, r);
  const rgId = r.ok ? r.value.rg.id : null;

  // --- 5. region captures nodes inside ---
  r = await run('weave.getData().regions[0].nodeIds.length');
  check('region captured nodes', r.ok && r.value >= 2, r);

  // --- 6. addConnection rejected in sequence mode ---
  r = await run('(() => { weave.setMode("sequence"); return weave.addConnection("x","y"); })()');
  check('addConnection blocked in sequence mode', !r.ok && /时序图/.test(r.error), r);

  // --- 7. sequence mode: participants + message ---
  r = await run(`(() => {
    const c = weave.addNode({ label: '客户端', color: 'blue', x: 0, y: 40 });
    const s = weave.addNode({ label: '服务器', color: 'green', x: 600, y: 40 });
    const m = weave.addMessage(c.id, s.id, 360, { label: '查询订单' });
    const m2 = weave.addMessage(s.id, c.id, undefined, { label: '返回结果' });
    return { c, s, m, m2, count: weave.count(), mode: weave.getMode() };
  })()`);
  check('sequence addNode/addMessage', r.ok && r.value.m && r.value.m2 && r.value.mode === 'sequence', r);
  const cId = r.ok ? r.value.c.id : null;
  const sId = r.ok ? r.value.s.id : null;
  check('sequence node has life (auto-extended to cover message)', r.ok && r.value.c.life >= 200 && r.value.c.life % 20 === 0, r);

  // --- 8. region now allowed in sequence mode (v2.0.2+) ---
  r = await run(`(() => {
    const rg = weave.addRegion({ x: -100, y: -60, w: 1000, h: 400, label: '时序分组' });
    return { rg, count: weave.count() };
  })()`);
  check('addRegion allowed in sequence mode', r.ok && r.value.rg && r.value.count.regions === 1, r);
  check('region in sequence captured participants', r.ok && r.value.rg.nodeIds.length >= 2, r);

  // --- 9. nested region re-parenting ---
  r = await run(`(() => {
    const outer = weave.addRegion({ x: -200, y: -200, w: 1200, h: 700, label: '外' });
    const inner = weave.getData().regions.find(x => x.label === '时序分组');
    return { outer, innerParent: inner ? inner.parentId : null, outerId: outer.id };
  })()`);
  check('outer region adopts inner region', r.ok && r.value.innerParent === r.value.outerId, r);

  // --- 10. removeRegion ---
  r = await run('weave.removeRegion("nonexistent-id").length');
  check('removeRegion returns remaining', r.ok && typeof r.value === 'number', r);

  // --- 11. collapse only in graph mode ---
  r = await run('weave.collapseNode("x")');
  check('collapseNode blocked in sequence mode', !r.ok && /时序图/.test(r.error), r);

  // --- 12. getData in sequence mode has weave-sequence shape ---
  r = await run('weave.getData()');
  check('sequence getData format', r.ok && r.value.format === 'weave-sequence' && r.value.mode === 'sequence', r);
  check('sequence getData has time axis', r.ok && r.value.time && typeof r.value.time.step === 'number', r);

  // --- 13. setData with sequence format switches mode ---
  r = await run(`(() => {
    weave.setMode("graph");
    const d = {
      format: "weave-sequence", mode: "sequence", unit: "grid", gridPx: 20,
      time: { originY: 6, step: 1, start: 1 },
      nodes: [{ id: "x1", label: "P", color: "blue", x: 0, y: 2, w: 9, h: 4, lifeline: { x: 4.5, y: 6, length: 10 } }],
      connections: [],
    };
    const out = weave.setData(d);
    return { mode: weave.getMode(), nodes: out.nodes.length };
  })()`);
  check('setData switches to sequence mode', r.ok && r.value.mode === 'sequence' && r.value.nodes === 1, r);

  // --- 14. back to graph: documents are independent ---
  r = await run('(() => { weave.setMode("graph"); return weave.count(); })()');
  check('graph document preserved (3 nodes from graph phase)', r.ok && r.value.nodes === 3 && r.value.connections === 1, r);

  // --- 15. exportPng returns data url ---
  r = await run('(async () => { const p = await weave.exportPng(); return { head: p.dataUrl.slice(0, 22), name: p.name }; })()');
  check('exportPng data url', r.ok && /^data:image\/png;base64/.test(r.value.head), r);

  // --- 16. getData/setData round trip in graph mode ---
  r = await run(`(() => {
    const d = weave.getData();
    const out = weave.setData(d);
    return { before: d.nodes.length, after: out.nodes.length };
  })()`);
  check('graph getData/setData round trip', r.ok && r.value.before === r.value.after, r);

  // --- 17. message height grid snapping ---
  r = await run(`(() => {
    weave.setMode("sequence");
    const a = weave.addNode({ label: "A", x: 0, y: 40 });
    const b = weave.addNode({ label: "B", x: 600, y: 40 });
    const m = weave.addMessage(a.id, b.id, 355);
    return { y: m.y };
  })()`);
  check('message y snapped to grid', r.ok && r.value.y % 20 === 0, r);

  await browser.close();

  let pass = 0;
  for (const t of results) {
    if (t.ok) { pass++; console.log('PASS', t.name); }
    else { console.log('FAIL', t.name, JSON.stringify(t.extra)); }
  }
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
