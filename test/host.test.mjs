// Host-side regression: real @deepseek-ai/dsh-tools + cordis, against lib/index.js.
//
// Run it from a directory that has the harness packages installed, e.g.
//   mkdir -p /tmp/dshreg && cd /tmp/dshreg
//   npm i @deepseek-ai/dsh-tools@0.2.1-rc.2 @deepseek-ai/cordis@4.0.5
//   node <repo>/test/host.test.mjs
// (or, from elsewhere: WEAVE_REPO=<repo> node <repo>/test/host.test.mjs)
//
// The plugin package itself is staged into that same project (so its bare
// import of "@deepseek-ai/dsh-tools" resolves) and exercised from there.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
// The plugin source lives in the repo; point WEAVE_REPO at it when this
// script is run from a different project (it must run where the harness
// packages are installed).
const repo = process.env.WEAVE_REPO
  ? path.resolve(process.env.WEAVE_REPO)
  : path.resolve(here, '..')
const require = createRequire(import.meta.url)

// Locate the installed harness packages (must be resolvable from CWD).
const dshToolsPkg = require.resolve('@deepseek-ai/dsh-tools/package.json', { paths: [process.cwd()] })
// .../project/node_modules/@deepseek-ai/dsh-tools/package.json -> project root
const projectRoot = path.resolve(path.dirname(dshToolsPkg), '..', '..', '..')

const { defineTool } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools', { paths: [process.cwd()] })).href)

const results = []
const check = (name, cond, extra) => results.push({ name, ok: !!cond, extra: cond ? undefined : extra })

// --- 1. defineTool with our tool shape compiles ---
const tool = defineTool({
  name: 'weave',
  description: 'test',
  parameters: {
    code: { type: 'string', required: true, description: 'x' },
    timeoutMs: { type: 'integer', description: 'y' },
  },
  output: { schema: { type: 'json' }, render: () => [{ type: 'text', text: '{}' }] },
  execute: async () => ({ ok: true }),
  presentCall: (a) => ({ card: 'generic', title: 't', kind: 'other', rawInput: a }),
})
check('defineTool accepts our shape', !!tool && tool.name === 'weave', tool)

// --- 2. stage the plugin where its bare imports resolve ---
const staged = path.join(projectRoot, '.weave-plugin-stage')
rmSync(staged, { recursive: true, force: true })
for (const dir of ['lib', 'skills', 'assets']) {
  cpSync(path.join(repo, dir), path.join(staged, dir), { recursive: true })
}

const mod = await import(pathToFileURL(path.join(staged, 'lib', 'index.js')).href)
check('module exports name', mod.name === 'weave', mod.name)
check('module exports inject', Array.isArray(mod.inject) && mod.inject.includes('tools'), mod.inject)
check('module exports apply', typeof mod.apply === 'function', typeof mod.apply)

// --- 3. apply() against a mock cordis context ---
const routes = []
const tools = []
const skills = []
const handlers = new Map()

const ctx = {
  logger: { warn: (m) => console.log('WARN', m), info: () => {}, error: () => {} },
  effect: (fn) => { fn(); return () => {} },
  get: (key) => (key === 'skills' ? { register: (s) => skills.push(s) } : undefined),
  tools: { register: (t) => tools.push(t) },
  webServer: { register: (r) => { routes.push(r); return () => {} } },
  root: {
    connection: {
      rpc: {
        handle: (channel, handler) => { handlers.set(channel, handler); return () => handlers.delete(channel) },
      },
    },
  },
}
mod.apply(ctx)

check('app route registered', routes.length === 1 && routes[0].path === '/weave/app', routes.map(r => r.path))
check('tool registered', tools.length === 1 && tools[0].name === 'weave', tools.map(t => t.name))
check('skill registered from bundled SKILL.md', skills.length === 1 && skills[0].name === 'weave', skills.map(s => s.name))
check('skill content non-empty', skills.length === 1 && skills[0].content.length > 1000, skills[0]?.content?.length)
check('rpc channel /weave registered', handlers.has('/weave'), [...handlers.keys()])

// --- 4. tool schema ---
const schema = tools[0].parameters ?? tools[0].inputSchema
check('tool param code is string', schema?.properties?.code?.type === 'string', schema)
check('tool param timeoutMs is integer', schema?.properties?.timeoutMs?.type === 'integer', schema)
check('tool param code is required', Array.isArray(schema?.required) && schema.required.includes('code'), schema?.required)

// --- 5. the app route serves the real asset ---
const res = { writeHead: () => {}, end: (body) => { res.body = body } }
routes[0].handler({}, res)
check('route serves Weave.html', typeof res.body === 'string' && res.body.includes('Weave'), res.body?.length)
check('served asset is v2.0.3', typeof res.body === 'string' && res.body.includes('v2.0.3'), res.body?.includes('v2.0.3'))

// --- 6. take/submit round trip ---
const take = handlers.get('/weave')
const taken = await take('take', {}, undefined)
check('take with empty queue waits (returns null after hold)', taken.ok === true, taken)

const execPromise = tools[0].execute({ code: 'weave.getMode()' }, { signal: undefined })
const t2 = await take('take', {}, undefined)
check('take returns queued command', t2.ok === true && typeof t2.value.code === 'string', t2)
const sub = await take('submit', { commandId: t2.value.commandId, ok: true, value: 'graph' }, undefined)
check('submit accepted', sub.ok === true && sub.value.accepted === true, sub)
const execResult = await execPromise
check('execute resolves with page value', execResult?.ok === true && execResult?.value === 'graph', execResult)

// --- 7. error path ---
const execPromise2 = tools[0].execute({ code: 'boom' }, { signal: undefined })
const t3 = await take('take', {}, undefined)
await take('submit', { commandId: t3.value.commandId, ok: false, error: '编辑器执行出错' }, undefined)
let rejected = null
try { await execPromise2 } catch (e) { rejected = e }
check('execute rejects on page error', rejected !== null && /编辑器执行出错/.test(rejected.message), rejected?.message)

// --- 8. abort ---
const ac = new AbortController()
const execPromise3 = tools[0].execute({ code: 'x' }, { signal: ac.signal })
ac.abort()
let abortErr = null
try { await execPromise3 } catch (e) { abortErr = e }
check('execute rejects on abort', abortErr !== null && /abort/i.test(abortErr.message), abortErr?.message)

// --- 9. unknown endpoint ---
const unknown = await take('nope', {}, undefined)
check('unknown endpoint returns error', unknown.ok === false, unknown)

rmSync(staged, { recursive: true, force: true })

let pass = 0
for (const t of results) {
  if (t.ok) { pass++; console.log('PASS', t.name) }
  else { console.log('FAIL', t.name, JSON.stringify(t.extra)) }
}
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
