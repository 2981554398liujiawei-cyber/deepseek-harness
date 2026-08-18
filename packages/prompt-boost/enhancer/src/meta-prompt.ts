/**
 * Prompt enhancement meta-prompts, ported from the Prompt Boost project
 * (apps/local-agent/src/prompt-engine/meta-prompt.ts). One lean plain-text
 * call returns the enhanced prompt itself — no JSON envelope, no task
 * taxonomy, no scoring instructions, so the model spends its tokens on the
 * enhancement only (fast, and the metadata was only for a removed popover).
 * @module @deepseek-ai/dsh-prompt-enhancer/src/meta-prompt
 */

import type { EnhanceLevel } from './types.ts'

/** Strategy knobs assembled into the user message. */
export interface StrategyInput {
  originalText: string
  enhanceLevel: EnhanceLevel
  outputLanguage?: string
  /** Requested reasoning effort, forwarded verbatim to the model call. */
  reasoningEffort?: 'off' | 'high' | 'max'
}

/** Lean system prompt: the quality rules that matter, nothing else. */
export function buildSystemPrompt(): string {
  return [
    '你是一个专业的 Prompt 增强引擎。你的任务是：把用户写好的 Prompt 改写得更完整、更清晰、更具可执行性。',
    '',
    '【最关键规则】你输出的必须是「增强后的 Prompt」本身，绝对不要替用户执行他们的任务。',
    '例如：用户要「写一个产品推广方案」，你必须输出「如何让 AI 更好地写出这个方案的指令」，而不是方案正文。',
    '',
    '【原始意图保真】改写时保留用户原始 Prompt 的核心动作、目标、领域与所有具体细节；只补强结构与表达，绝不改变用户的核心诉求，也不要为了显得专业而无意义地膨胀。',
    '',
    '【输出要求】只输出增强后的 Prompt 纯文本本身：不要输出 JSON、不要用 Markdown 代码围栏、不要解释、不要标题、不要评分、不要任何前后缀。',
    '【长度控制】严格按上述增强强度的长度比例输出（quick 约原文 1–1.3 倍、deep 约 1.3–1.8 倍、expert 约 1.5–2.5 倍），整段不超过 600 字；宁可精炼，不要为凑长度而重复或堆砌。',
  ].join('\n')
}

/** Enhancement intensity definition for the requested level. */
export function enhanceLevelDefinition(level: EnhanceLevel): string {
  switch (level) {
    case 'quick':
      return [
        '【当前增强强度：quick 快速】',
        '- 只做必要的最小改动：补全最关键的缺失信息、修正明显的歧义、统一结构。',
        '- 保持原文的措辞与长度基本不变，输出长度控制在原文的 1–1.3 倍。',
        '- 最多追加 1–2 个结构化动作；不做大段重写。',
      ].join('\n')
    case 'expert':
      return [
        '【当前增强强度：expert 专家】',
        '- 全面结构化：为原文补充明确的目标、背景、受众、输出格式、限制条件、角色视角、所需素材、可执行步骤。',
        '- 显著重写，输出可以是原文的 1.5–2.5 倍长度，但必须保留原文每个核心诉求，禁止堆砌与任务无关的内容。',
        '- 输出适合直接交给资深模型执行的完整 Prompt。',
      ].join('\n')
    default:
      return [
        '【当前增强强度：deep 深度】',
        '- 中等重写：在保留原文核心诉求的前提下，补充背景、受众、输出格式、限制条件、角色、素材、步骤等缺失要素。',
        '- 输出长度控制在原文的 1.3–1.8 倍。',
        '- 重写要自然、聚焦，避免为凑长度而重复。',
      ].join('\n')
  }
}

/** Per-scenario reinforcement instructions. */
export function scenarioMix(scenario: 'instruction' | 'outputFormat' | 'audience' | 'constraints' | 'role' | 'materials'): string {
  const map: Record<string, string[]> = {
    instruction: [
      '- 用清晰的动词明确你希望 AI 执行的步骤（分析 / 生成 / 对比 / 总结…）。',
      '- 把一个大任务拆成可执行的子步骤。',
    ],
    outputFormat: [
      '- 明确输出格式：表格 / 列表 / JSON / Markdown / 代码 / 字数范围。',
    ],
    audience: [
      '- 明确产出给谁看：客户 / 团队 / 读者 / 非技术用户…，并说明受众关注点。',
    ],
    constraints: [
      '- 补充约束：时间、预算、字数、风格、技术栈、禁止事项。',
    ],
    role: [
      '- 指定一个对任务有帮助的视角，例如「你是一名资深产品经理」「你是一名资深后端工程师」。',
    ],
    materials: [
      '- 若任务依赖特定信息，提示需要提供数据、文档或示例输入。',
    ],
  }
  return map[scenario]?.join('\n') ?? ''
}

/** Assemble the lean user message: level + language + reinforcement + original. */
export function buildUserPrompt(input: StrategyInput): string {
  const parts: string[] = []
  parts.push(enhanceLevelDefinition(input.enhanceLevel))
  parts.push('')
  parts.push('【输出语言】' + (input.outputLanguage && input.outputLanguage !== 'auto' ? `用「${input.outputLanguage}」输出。` : '跟随用户原始 Prompt 的语言输出。'))
  parts.push('')
  parts.push('【场景补强原则】在改写时按需应用以下补强（不要机械地全部套用，缺什么补什么）；关键信息缺失时用占位符（如【具体内容】）标注，不要凭空编造细节）：')
  parts.push(scenarioMix('instruction'))
  parts.push(scenarioMix('outputFormat'))
  parts.push(scenarioMix('audience'))
  parts.push(scenarioMix('constraints'))
  parts.push(scenarioMix('role'))
  parts.push(scenarioMix('materials'))
  parts.push('')
  parts.push('【用户原始 Prompt】')
  parts.push(input.originalText)
  return parts.join('\n')
}
