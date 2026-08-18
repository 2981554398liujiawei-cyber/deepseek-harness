/**
 * Prompt enhancement host service (`ctx.promptEnhancer`): read a draft, call
 * the deployment's configured model through `ctx.llm` (route resolved from
 * composition config or `ctx.agentDefaultModel`), and return the enhanced
 * prompt plus a structured analysis. Exposed to the Web client as the
 * `promptEnhancer` Remote namespace.
 * @module @deepseek-ai/dsh-prompt-enhancer
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { resolveRoute, runEnhance } from './pipeline.ts'
import type { EnhanceRequest, EnhanceResult } from './types.ts'

export type * from './types.ts'

/** Optional route override: when both are set, they win over the agent default model. */
export interface Config {
  readonly provider?: string
  readonly model?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** One-shot prompt enhancement over the deployment's configured model. */
    promptEnhancer: PromptEnhancerService
  }
}

/**
 * Prompt enhancement service.
 * Requires the LLM runtime and the agent default-model config; the Web
 * composition registers this row with an empty route so the agent default
 * model (what the user picked in the Models settings) is used.
 */
export class PromptEnhancerService extends TypertRemoteService {
  static inject = ['llm', 'agentDefaultModel']

  static Config: z<Config> = z.object({
    provider: z.string().default(''),
    model: z.string().default(''),
  })

  private readonly route: { provider?: string; model?: string }

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'promptEnhancer')
    this.route = {
      ...(config.provider ? { provider: config.provider } : {}),
      ...(config.model ? { model: config.model } : {}),
    }
  }

  /**
   * Enhance one draft.
   * @param request - original text plus optional strategy knobs; per-request
   * `provider`/`model` override the composition route (wins over config and
   * the agent default model).
   * @returns the enhanced prompt, structured analysis, and model provenance.
   * @throws EnhanceError (empty/oversized input, missing model route, model failure).
   */
  @Remote('enhance')
  async enhance(request: EnhanceRequest): Promise<EnhanceResult> {
    const baseRoute = resolveRoute(this.route, () => {
      const selection: ModelSelection = this.ctx.agentDefaultModel.currentSelection()
      return { provider: selection.provider, model: selection.model }
    })
    const route = request.provider !== undefined && request.model !== undefined
      ? { provider: request.provider, model: request.model }
      : baseRoute
    return runEnhance(this.ctx, request, route)
  }
}

export default PromptEnhancerService
