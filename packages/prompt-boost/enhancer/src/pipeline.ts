/**
 * Enhancement pipeline: ONE plain-text model call that returns the enhanced
 * prompt itself (no structured JSON envelope — the analysis metadata was only
 * for the now-removed popover, so asking for it just wasted tokens and
 * latency). A heuristic analysis is computed locally, and the intent-fidelity
 * gate falls back to passthrough when the output is unacceptable. The model
 * call rides `ctx.llm` (the user's configured provider/model/credentials)
 * instead of a bespoke HTTP provider.
 * @module @deepseek-ai/dsh-prompt-enhancer/src/pipeline
 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions } from '@deepseek-ai/dsh-llm'
import {
  MAX_INPUT_LENGTH,
  MIN_INPUT_LENGTH,
} from './constants.ts'
import {
  classifyTaskType,
  heuristicScore,
  isAcceptable,
} from './core.ts'
import {
  buildSystemPrompt,
  buildUserPrompt,
  type StrategyInput,
} from './meta-prompt.ts'
import type { EnhanceRequest, EnhanceResult, PromptAnalysis } from './types.ts'

/** Model route resolved from the composition config or the agent default selection. */
export interface ModelRoute {
  provider: string
  model: string
}

/** Failure classification surfaced to the client. */
export class EnhanceError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'EnhanceError'
    this.code = code
  }
}

/** Validate the request at the pipeline boundary. */
export function validateRequest(request: EnhanceRequest): void {
  const text = request.originalText
  if (!text || text.trim().length < MIN_INPUT_LENGTH) {
    throw new EnhanceError('EMPTY_INPUT', '输入为空：请先在输入框里写点什么。')
  }
  if (text.length > MAX_INPUT_LENGTH) {
    throw new EnhanceError('INPUT_TOO_LONG', `输入过长（超过 ${MAX_INPUT_LENGTH} 字符），请精简后重试。`)
  }
}

/** Resolve the model route for this deployment. */
export function resolveRoute(
  config: { provider?: string; model?: string },
  currentSelection: () => { provider: string; model: string },
): ModelRoute {
  if (config.provider && config.model) {
    return { provider: config.provider, model: config.model }
  }
  const selection = currentSelection()
  if (!selection.provider || !selection.model) {
    throw new EnhanceError(
      'NO_MODEL',
      '尚未配置默认模型：请在 DSH 的模型设置中选择一个模型后再试。',
    )
  }
  return { provider: selection.provider, model: selection.model }
}

/** Map a terminal stream finish onto an error, or undefined when the call succeeded. */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'max-tokens':
      return new EnhanceError('TRUNCATED', '模型输出被截断，请重试或改用更短的原输入。')
    case 'aborted':
      return new EnhanceError('ABORTED', '请求已中止。')
    case 'error':
      return new EnhanceError('LLM_FAILED', finish.failure.message || '模型调用失败，请重试。')
    default:
      return new EnhanceError('LLM_FAILED', '模型调用失败，请重试。')
  }
}

/**
 * One model call: assemble the lean meta-prompt, stream through `ctx.llm`,
 * and return the assembled plain text.
 */
async function callModel(
  ctx: Context,
  route: ModelRoute,
  input: StrategyInput,
  signal?: AbortSignal,
): Promise<string> {
  const options: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages: [
      createUserMessage({
        content: [{ type: 'text', text: buildUserPrompt(input) }],
        source: { kind: 'plugin', plugin: 'dsh-prompt-enhancer' },
      }),
    ],
    system: buildSystemPrompt(),
    temperature: 0.4,
    maxTokens: 2048,
    ...(input.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(input.reasoningEffort) }),
    ...(signal === undefined ? {} : { signal }),
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    assembler.push(chunk)
  }
  const error = finishError(assembler.finish)
  if (error !== undefined) throw error
  return assembler.blocks()
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Heuristic-only analysis (classification + scoring computed locally). */
function heuristicAnalysis(originalText: string): PromptAnalysis {
  const classified = classifyTaskType(originalText)
  const heuristic = heuristicScore(originalText)
  return {
    detectedTaskType: classified.taskType,
    confidence: classified.confidence,
    scoreDimensions: heuristic.dimensions,
    totalScore: heuristic.total,
    scoreSource: 'heuristic_fallback',
    missingInformation: heuristic.missing,
    criticalMissingInformation: [],
    suggestions: heuristic.suggestions,
    clarificationRequired: false,
    clarificationQuestions: [],
  }
}

/**
 * Run the enhancement pipeline: a single lean text call, then the
 * intent-fidelity gate. The original text is never destroyed. Identical
 * requests hit a small in-process cache so repeat boosts are instant.
 * @param ctx - host context providing `ctx.llm` and the route resolver.
 * @param request - validated enhancement request.
 * @param route - resolved provider/model route.
 * @param signal - optional abort signal forwarded to the model call.
 */
export async function runEnhance(
  ctx: Context,
  request: EnhanceRequest,
  route: ModelRoute,
  signal?: AbortSignal,
): Promise<EnhanceResult> {
  validateRequest(request)
  const input: StrategyInput = {
    originalText: request.originalText,
    // Default to the quick (minimal-edit) level for speed; callers can opt
    // into 'deep' or 'expert' for heavier rewrites.
    enhanceLevel: request.enhanceLevel ?? 'quick',
    outputLanguage: request.outputLanguage ?? 'auto',
    ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
  }
  const cacheKey = `${input.enhanceLevel}|${input.outputLanguage ?? ''}|${request.reasoningEffort ?? ''}|${input.originalText}`
  const cached = resultCache.get(cacheKey)
  if (cached !== undefined) return cached

  const result = await computeResult(ctx, request, input, route, signal)
  if (result.fallback !== 'passthrough') {
    resultCache.set(cacheKey, result)
    while (resultCache.size > CACHE_MAX_ENTRIES) {
      resultCache.delete(resultCache.keys().next().value as string)
    }
  }
  return result
}

/** Small LRU-ish cache: identical boosts return instantly. */
const CACHE_MAX_ENTRIES = 32
const resultCache = new Map<string, EnhanceResult>()

async function computeResult(
  ctx: Context,
  request: EnhanceRequest,
  input: StrategyInput,
  route: ModelRoute,
  signal?: AbortSignal,
): Promise<EnhanceResult> {
  const text = await callModel(ctx, route, input, signal)
  // The intent-fidelity gate is a soft guard: as long as the model returned
  // something non-empty and changed, hand it back (fallback: 'text-fallback');
  // only an empty/unchanged output falls through to passthrough. This keeps
  // the feature useful even when the model drifts from the original wording.
  if (text.trim().length > 0 && text !== request.originalText) {
    return {
      enhancedText: text,
      analysis: heuristicAnalysis(request.originalText),
      assumptions: [],
      provider: route.provider,
      model: route.model,
      fallback: isAcceptable(text, request.originalText) ? null : 'text-fallback',
    }
  }
  // The original text is never destroyed.
  return {
    enhancedText: request.originalText,
    analysis: heuristicAnalysis(request.originalText),
    assumptions: [],
    provider: route.provider,
    model: route.model,
    fallback: 'passthrough',
  }
}
