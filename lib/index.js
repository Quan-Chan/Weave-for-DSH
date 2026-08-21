/**
 * @deepseek-ai/dsh-weave — Host half of the fixed Weave user plugin.
 *
 * Registers the model-facing `weave` tool that directly drives the Weave
 * node-graph editor embedded in the harness page: the tool evaluates a
 * JavaScript snippet inside the page's embedded app and returns the
 * JSON-serialized result. It also registers the `/weave` generic Connection
 * RPC channel over which the browser half pulls pending commands and posts
 * results back, and serves the single-file Weave app from
 * `assets/Weave.html` at `/weave/app` so the client half can embed it
 * same-origin (which keeps `contentWindow.App` reachable).
 *
 * Fixed plugin row (composed via the web profile's cordis.patch.yml), not a
 * dynamic package.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name. */
export const name = 'weave'

/** Required services: the model tool registry, the Host Connection transport, and the webserver. */
export const inject = ['tools', 'connection', 'webServer']

/** Where the single-file app is served from (exact route, same origin as the GUI). */
const APP_ROUTE = '/weave/app'

/** Generic Connection RPC channel owned by this plugin (client pulls tasks, posts results). */
const CHANNEL = '/weave'

/** How long a `take` long-poll holds before answering null. */
const TAKE_HOLD_MS = 20_000

/** Default budget for one page execution when the model does not set timeoutMs. */
const DEFAULT_TIMEOUT_MS = 60_000

/** Apply: register the AI tool, the command channel, and the app route. */
export function apply(ctx) {
  // The single-file editor, read once. The client iframe renders it inline in
  // the harness page (same origin), so the parent can reach contentWindow.App
  // directly — no postMessage bridge, no backend service.
  let appHtml
  try {
    appHtml = readFileSync(new URL('../assets/Weave.html', import.meta.url), 'utf8')
  } catch (error) {
    ctx.logger.warn(`weave: failed to read assets/Weave.html — the page cannot be served: ${String(error)}`)
    appHtml = '<!doctype html><html><body><p>Weave app asset missing.</p></body></html>'
  }

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: APP_ROUTE,
      handler: (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(appHtml)
      },
    }),
    'weave: app route',
  )

  /** Pending tool executions by commandId: { resolve, reject, timer }. */
  const pending = new Map()
  /** Commands waiting to be pulled by the page: { commandId, code, timeoutMs }. */
  const queue = []
  /** Resolvers of in-flight `take` long-polls. */
  const waiters = new Set()

  /** Hand a queued command to the oldest `take` waiter, if any. */
  const settleWaiters = () => {
    while (waiters.size > 0 && queue.length > 0) {
      const resolve = waiters.values().next().value
      waiters.delete(resolve)
      resolve({ ok: true, value: queue.shift() })
    }
  }

  ctx.effect(() => {
    const dispose = ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload, signal) => {
      if (endpoint === 'take') {
        if (queue.length > 0) return { ok: true, value: queue.shift() }
        return await new Promise((resolve) => {
          const wrap = (value) => {
            clearTimeout(timer)
            waiters.delete(wrap)
            resolve(value)
          }
          const timer = setTimeout(() => wrap({ ok: true, value: null }), TAKE_HOLD_MS)
          signal?.addEventListener('abort', () => wrap({ ok: true, value: null }), { once: true })
          waiters.add(wrap)
          settleWaiters()
        })
      }
      if (endpoint === 'submit') {
        const body = payload
        const commandId = body?.commandId
        const entry = commandId === undefined ? undefined : pending.get(commandId)
        if (entry === undefined) return { ok: true, value: { accepted: false } }
        pending.delete(commandId)
        clearTimeout(entry.timer)
        if (body?.ok === true) entry.resolve({ ok: true, value: body.value })
        else entry.reject(new Error(body?.error ?? 'weave: page evaluation failed'))
        return { ok: true, value: { accepted: true } }
      }
      return { ok: false, error: { code: 'internal', message: `unknown weave endpoint: ${String(endpoint)}`, details: {} } }
    }, { authority: 'loopback' })
    return () => { void dispose?.() }
  }, 'weave: command channel')

  ctx.tools.register(defineTool({
    name: 'weave',
    description:
      'Run a JavaScript expression directly inside the embedded Weave node-graph editor that is inlined in '
      + 'this harness page, and return the JSON result. The expression is evaluated in the Weave app document, '
      + 'where the globals `App` (the editor application), `Weave` (its utility namespace) and `weave` (this '
      + 'plugin\'s bridge: `await weave.exportPng()` returns {ok,value:{dataUrl,name}}; `weave.getData()` returns '
      + '{nodes,connections,viewport}; `weave.setData(data)` loads a full document; `weave.addNode(spec)` adds one '
      + 'node; `weave.count()` returns {nodes,connections}) are available. The expression may be async '
      + '(e.g. `await weave.exportPng()`), and its value — or the message on failure — is returned to you. '
      + 'Use it to let the AI generate nodes, change node/connection data so the canvas re-renders, place and '
      + 'connect nodes, inspect the current graph, or export the canvas as a PNG. Drawing rules: getData() and '
      + 'setData() node x/y are grid cells; weave.addNode() x/y and node w/h are pixels — multiply values read '
      + 'from getData() by 20 before passing them to addNode(). Omit w/h in addNode() for the default 170x80px '
      + 'node. Lay out graphs about 15 cells apart between horizontal neighbours and 10 between vertical ones, '
      + 'and keep every coordinate within about +-50 cells.',
    parameters: {
      code: {
        type: 'string',
        required: true,
        description:
          'One JavaScript expression evaluated inside the embedded Weave editor page (not in this host). '
          + 'Globals in scope: App, Weave, and weave (the bridge above). It may be async and return anything '
          + 'JSON-serializable. Example: `weave.addNode({label:"需求分析", color:"blue"})`.',
      },
      timeoutMs: {
        type: 'integer',
        description: 'Optional maximum milliseconds to wait for the page to finish executing (default 60000).',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute(args, exec) {
      const commandId = randomUUID()
      const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
      return new Promise((resolve, reject) => {
        const entry = {
          timer: setTimeout(() => {
            pending.delete(commandId)
            reject(new Error('weave: timed out waiting for the editor page to answer'))
          }, timeoutMs),
          resolve,
          reject,
        }
        pending.set(commandId, entry)
        queue.push({ commandId, code: args.code, timeoutMs })
        settleWaiters()
        exec.signal?.addEventListener('abort', () => {
          const at = queue.findIndex((command) => command.commandId === commandId)
          if (at !== -1) queue.splice(at, 1)
          const got = pending.get(commandId)
          if (got !== undefined) {
            pending.delete(commandId)
            clearTimeout(got.timer)
            got.reject(new Error('weave: aborted before the page answered'))
          }
        }, { once: true })
      })
    },
    presentCall: (callArgs) => ({
      card: 'generic',
      title: 'Run JS in Weave editor',
      kind: 'other',
      rawInput: callArgs,
    }),
  }))
}
