/**
 * ask_gpt plugin, browser half: the animated composer toggle that switches the
 * web ChatGPT consultation tool, seated in 'conversation.input.right' right
 * before the send button. Reads/writes the host-owned `gpt-web` settings
 * namespace through the standard settings scope, so the Host tool plugin and
 * its model-facing usage section see the switch live.
 * @module @deepseek-ai/dsh-client-ui-ask-gpt/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.right seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settingsScope service (ctx.settingsScope.bind).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AskGptToggle } from './AskGptToggle.tsx'
import type { AskGptToggleInjected } from './slots.ts'
import { en, zh, type AskGptKey } from './locales.ts'

export { AskGptToggle } from './AskGptToggle.tsx'
export type { AskGptToggleInjected } from './slots.ts'
export type { AskGptKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ask_gpt toggle and its hover-menu copy. */
    askGpt: AskGptKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'askGpt'

/** Required services: slot registry, copy, and the settings scope binder. */
export const inject = ['slots', 'locale', 'settingsScope'] as const

/**
 * Client plugin body: register the ask_gpt toggle into the composer's right
 * tool row (order 1, after prompt-boost).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-ask-gpt: dictionaries')

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'ask-gpt',
    order: 1,
    locale: NS,
    inject: (): AskGptToggleInjected => ({
      scope: ctx.settingsScope.bind({ namespace: 'gpt-web' }),
    }),
  }, AskGptToggle))
}
