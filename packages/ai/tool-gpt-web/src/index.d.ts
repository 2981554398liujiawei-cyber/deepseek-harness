/**
 * Model-facing `gpt_web_ask` tool: ask the web-signed-in ChatGPT and read its
 * reply, so an agent can consult ChatGPT mid-task and adapt its workflow.
 *
 * Delegates to the user-level `gpt_web.py` automation script under
 * `$DSH_HOME/gpt-web/` (a Playwright + system-Chrome bridge that reuses a
 * persisted signed-in session profile). The script and its session profile
 * live OUTSIDE the repository because the profile holds the user's ChatGPT
 * sign-in cookies.
 *
 * Behavior is governed by the `gpt-web` settings namespace (registered here):
 * - `enabled`: master switch; when off the tool refuses calls and the dynamic
 *   system-prompt section tells the model not to call it.
 * - `mode`: `specified` (always chat inside the named conversation) or `auto`
 *   (the model may proactively consult GPT when stuck).
 * - `conversation`: the GPT conversation name used in `specified` mode.
 *
 * The system-prompt section is re-evaluated on every assembly from the live
 * settings value, so toggling the switch needs no plugin reload.
 * @module @deepseek-ai/dsh-tool-gpt-web
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
/** The `gpt-web` settings namespace: master switch, mode, and conversation name. */
export interface GptWebSettings {
  enabled: boolean
  mode: 'specified' | 'auto'
  conversation: string
}
/** Schema for the `gpt-web` settings namespace (live-applies). */
export declare const GptWebSettingsSchema: z<Schemastery.ObjectS<{
  enabled: z<boolean, boolean>
  mode: z<'specified' | 'auto', 'specified' | 'auto'>
  conversation: z<string, string>
}>, Schemastery.ObjectT<{
  enabled: z<boolean, boolean>
  mode: z<'specified' | 'auto', 'specified' | 'auto'>
  conversation: z<string, string>
}>>
/** Model-visible usage guidance rendered from the live settings at each assembly. */
export declare function renderGptWebUsage(settings: GptWebSettings): string
export declare const name = 'tool-gpt-web'
export declare const inject: readonly ['tools', 'settings', 'systemPrompt']
/**
 * Register the `gpt-web` settings namespace, the dynamic usage section, and
 * the `gpt_web_ask` tool.
 * @param ctx - context with `tools`, `settings`, and `systemPrompt` injected.
 */
export declare function apply(ctx: Context): void
//# sourceMappingURL=index.d.ts.map
