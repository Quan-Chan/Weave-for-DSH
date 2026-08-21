/**
 * @deepseek-ai/dsh-weave — package-owned invariant companion.
 *
 * Registered with `dsh-invariants` like every harness package. The plugin owns
 * no durable state and emits no cordis events; its runtime invariant is that
 * the fixed row is mounted only through the profile composition, which the
 * mount itself proves. The register call is the only effect.
 */
const PACKAGE_NAME = '@deepseek-ai/dsh-weave'

/** Cordis companion plugin name. */
export const name = 'weave-invariant'

/** Required service: the package-owned invariant registry. */
export const inject = ['invariants']

/** No-op installer: the fixed-composition row is the invariant. */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration disposer after setup succeeds.
 */
export function apply(ctx) {
  return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
}
