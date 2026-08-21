/**
 * @deepseek-ai/dsh-weave — Host half type declarations.
 *
 * Functions-plugin entrypoint (named exports), following the loader contract:
 * `name`, `inject`, and `apply`. The `Config` is omitted because this plugin
 * takes no configuration, matching the profile patch row that mounts it bare.
 */
export declare const name: string
export declare const inject: string[]
export declare function apply(ctx: import('@deepseek-ai/cordis').Context): void
export default apply
