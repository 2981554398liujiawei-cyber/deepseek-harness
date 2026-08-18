/**
 * BoostButton's injected face. The target 'conversation.input.right' seat is
 * declared (children table) and typed by ui-conversation; this package only
 * contributes the entry, so no SlotMap merge lives here. The draft read and
 * the write-back ride the framework standard kit (useInput / inputActions);
 * inject carries only the Remote-backed enhance verb.
 */

import type { EnhanceRequest, EnhanceResult } from '@deepseek-ai/dsh-prompt-enhancer/types'

/** Injected business face of the composer enhance button. */
export interface BoostButtonInjected {
  /**
   * Run one enhancement through the host `promptEnhancer` Remote.
   * @param request - original text plus optional strategy knobs.
   * @returns the enhanced prompt and analysis, or the carrier failure thrown.
   */
  onEnhance: (request: EnhanceRequest) => Promise<EnhanceResult>
}
