/**
 * weave-for-dsh — Client half type declarations (browser bundle).
 *
 * The `/client` entrypoint is the package's public browser API and exports
 * only what the Cordis loader needs: the `inject` service list and `apply`.
 * The browser half is an ordinary Cordis plugin: the client services it uses
 * (`connection`, `slots`) are attached to the client root context by the shell
 * kernel, so the context is the plain Cordis `Context` every harness client
 * plugin declares.
 */
import type { Context } from '@deepseek-ai/cordis'

export declare const inject: string[]
/** Browser plugin body: mount the Weave conversation-view tab and start the Host command loop. */
export declare function apply(ctx: Context): void
