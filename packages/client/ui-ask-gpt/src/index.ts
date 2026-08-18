/**
 * ask_gpt surface plugin, node half. The empty apply exists so the plugin
 * appears in the host cordis.yml / Loader; the browser half owns the composer
 * toggle and the `gpt-web` settings writes. All state is owned by the Host
 * plugin `@deepseek-ai/dsh-tool-gpt-web`.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
