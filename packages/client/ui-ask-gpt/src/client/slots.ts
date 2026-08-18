/**
 * AskGptToggle's injected face: the bound `gpt-web` settings scope. The
 * `conversation.input.right` seat and the locale translate face come from
 * ui-conversation / the slot system; this package only contributes the entry.
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Mirror of the host-owned `gpt-web` settings section (kept in sync with
 * `@deepseek-ai/dsh-tool-gpt-web`'s `GptWebSettings`). Mirrored instead of
 * imported so the browser bundle never pulls the Host plugin's Node source
 * into its program.
 */
/** A session's override entry: the non-recursive subset of {@link GptWebSettings}. */
export type GptWebOverride = Omit<GptWebSettings, 'sessionOverrides'>

export interface GptWebSettings {
  /** Master switch: off refuses tool calls and tells the model not to ask. */
  enabled: boolean
  /** `specified` = always chat inside the named conversation; `auto` = proactive consultation. */
  mode: 'specified' | 'auto'
  /** GPT conversation name used in `specified` mode. */
  conversation: string
  /** true: browser pops up visibly; false: browser works minimized in the background. */
  showBrowser: boolean
  /**
   * Per-session overrides keyed by SessionId. A session with an entry uses
   * that entry merged over the global defaults — one conversation's switch
   * never leaks into another conversation.
   */
  sessionOverrides: Record<string, GptWebOverride>
}

/** Injected business face of the composer ask_gpt toggle. */
export interface AskGptToggleInjected {
  /** Bound settings scope of the `gpt-web` namespace (host-owned). */
  scope: SettingsScope<GptWebSettings>
}
