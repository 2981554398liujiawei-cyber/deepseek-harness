/**
 * Prompt Boost plugin, browser half: the enhance button seated in the
 * composer tool row right before the send button ('conversation.input.right').
 * The verb rides the generated promptEnhancer Remote; the draft read and
 * write-back ride the standard kit (useInput / inputActions).
 * @module @deepseek-ai/dsh-client-ui-prompt-boost/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the
// Client assembly boundary (the promptEnhancer namespace merges here).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.right seat)
// and the session standard kit (useInput / inputActions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { EnhanceRequest, EnhanceResult } from '@deepseek-ai/dsh-prompt-enhancer/types'
import { BoostButton } from './BoostButton.tsx'
import type { BoostButtonInjected } from './slots.ts'
import { en, zh, type BoostKey } from './locales.ts'

export { BoostButton } from './BoostButton.tsx'
export type { BoostButtonInjected } from './slots.ts'
export type { BoostKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The boost button and result-panel copy. */
    boost: BoostKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'boost'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'remote', 'remote.promptEnhancer', 'locale']

/**
 * Client plugin body: register the enhance button into the composer's
 * right tool row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-prompt-boost: dictionaries')

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'prompt-boost',
    order: 0,
    locale: NS,
    inject: (): BoostButtonInjected => ({
      onEnhance: async (request: EnhanceRequest): Promise<EnhanceResult> => {
        const result = await ctx.remote.promptEnhancer.enhance(request)
        if (!result.ok) {
          throw new Error(result.error.message)
        }
        return result.value
      },
    }),
  }, BoostButton))
}
