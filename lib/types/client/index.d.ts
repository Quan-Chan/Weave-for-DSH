/**
 * weave-for-dsh — Client half type declarations (browser bundle).
 *
 * The `/client` entrypoint is the package's public browser API and exports
 * only what the Cordis loader needs: the `inject` service list and `apply`.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export declare const inject: string[]
/** Browser plugin body: mount the Weave conversation-view tab and start the Host command loop. */
export declare function apply(ctx: ClientContext): void
