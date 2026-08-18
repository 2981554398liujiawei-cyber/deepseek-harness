/**
 * Pure prompt-quality logic ported from the Prompt Boost project
 * (packages/prompt-core): offline task classification, heuristic scoring,
 * dimension sanitizing, weighted totals, and intent-fidelity checking.
 * No host dependencies — deterministic, unit-testable.
 * @module @deepseek-ai/dsh-prompt-enhancer/src/core
 */

import { SCORE_WEIGHTS } from './constants.ts'
import type { ClassificationResult, ScoreSource, ScoreDimensions, TaskType } from './types.ts'

/** Rule-based classifier entry: contextual keywords + strong action verbs. */
interface RuleEntry {
  zh: string[]
  en: string[]
  strong: string[]
}

type RuleTaskGroup = Exclude<TaskType, 'general'>

const KEYWORDS: Record<RuleTaskGroup, RuleEntry> = {
  writing: {
    zh: ['文案', '文章', '邮件', '作文', '博客', '标题', '脚本', '报告', '摘要', '总结', '扩写', '缩写'],
    en: ['compose', 'draft', 'essay', 'email', 'copy', 'article', 'rewrite', 'polish', 'summarize', 'blog', 'headline', 'script', 'poem', 'caption', 'paragraph'],
    strong: ['写', '撰写', '起草', '润色', '改写'],
  },
  coding: {
    zh: ['函数', '组件', '接口', '报错', '调试', '算法', '登录页面', 'sql', 'js', 'python', 'typescript', 'react', 'node'],
    en: ['component', 'api', 'endpoint', 'bug', 'error', 'debug', 'algorithm', 'program', 'script', 'sql', 'python', 'typescript', 'react', 'node', 'login', 'refactor'],
    strong: ['代码', '开发', '实现功能', 'implement'],
  },
  business: {
    zh: ['推广', '营销', '商业', '市场', '销售', '运营', '品牌', '预算', '报价', '融资', '竞品', '增长', '获客', '投放', '活动策划'],
    en: ['marketing', 'sales', 'market', 'campaign', 'brand', 'growth', 'strategy', 'budget', 'pricing', 'pitch', 'ad', 'customer', 'conversion', 'proposal'],
    strong: ['方案', '计划书', '企划', '商业模式', 'business plan', 'go-to-market', 'gtm'],
  },
  analysis: {
    zh: ['评估', '对比', '比较', '解读', '复盘', '洞察', '指标', '数据', '趋势', '优劣势', '可行性', '绩效'],
    en: ['assess', 'evaluate', 'compare', 'interpret', 'review', 'insight', 'metrics', 'trend', 'pros and cons', 'feasibility', 'swot'],
    strong: ['分析'],
  },
  research: {
    zh: ['调研', '查找', '文献', '资料', '溯源', '考证', '搜集', '论文', '引用', '来源'],
    en: ['literature', 'sources', 'cite', 'references', 'find', 'investigate', 'survey', 'paper', 'evidence'],
    strong: ['研究', 'research'],
  },
  learning: {
    zh: ['教程', '入门', '掌握', '练习', '讲解', '理解', '复习', '课程', '备考', '教会我'],
    en: ['tutorial', 'teach', 'explain', 'understand', 'practice', 'beginner', 'course', 'lesson', 'exercise', 'guide'],
    strong: ['学习', 'learn', 'study'],
  },
  translation: {
    zh: ['译成', '中译英', '英译中'],
    en: ['into english', 'into chinese', 'translated'],
    strong: ['翻译', 'translate'],
  },
  planning: {
    zh: ['安排', '日程', '路线图', '步骤', '流程', '排期', '清单'],
    en: ['schedule', 'itinerary', 'roadmap', 'timeline', 'steps', 'checklist', 'todo', 'agenda', 'outline'],
    strong: ['计划', '规划', 'plan', 'planning'],
  },
  creative: {
    zh: ['脑洞', '故事', '小说', '剧本', '点子', '设计', '脑风暴', '灵感', '拟人', '童话'],
    en: ['idea', 'brainstorm', 'story', 'novel', 'poem', 'imagine', 'inspire', 'fiction'],
    strong: ['创意', 'creative', 'design'],
  },
}

const GROUP_ORDER: RuleTaskGroup[] = [
  'translation',
  'coding',
  'writing',
  'business',
  'analysis',
  'research',
  'learning',
  'planning',
  'creative',
]

function scoreGroup(text: string, rule: RuleEntry): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of rule.zh) if (text.includes(kw)) score += 1
  for (const kw of rule.en) if (lower.includes(kw)) score += 1
  for (const kw of rule.strong) if (text.includes(kw)) score += 2
  return score
}

function ruleClassify(text: string): { group: RuleTaskGroup | null; score: number } {
  let best: RuleTaskGroup | null = null
  let bestScore = 0
  for (const group of GROUP_ORDER) {
    const s = scoreGroup(text, KEYWORDS[group])
    if (s > bestScore) {
      best = group
      bestScore = s
    }
  }
  return { group: bestScore > 0 ? best : null, score: bestScore }
}

/** Offline task classification (heuristic fallback when the model is unavailable). */
export function classifyTaskType(text: string): ClassificationResult {
  const { group, score } = ruleClassify(text)
  if (group === null) return { taskType: 'general', confidence: 0.2 }
  const confidence = Math.min(0.95, 0.5 + score * 0.1)
  return { taskType: group, confidence }
}

// ── scoring ────────────────────────────────────────────────────────────────

const clamp = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))

const containsAny = (text: string, tokens: readonly string[]): boolean => {
  const lower = text.toLowerCase()
  return tokens.some(t => lower.includes(t))
}

const countTokens = (text: string, tokens: readonly string[]): number => {
  const lower = text.toLowerCase()
  return tokens.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0)
}

/** Weighted total score (0–100). The program always computes the total itself. */
export function computeTotalScore(dimensions: ScoreDimensions): number {
  let weighted = 0
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    weighted += clamp(dimensions[key as keyof ScoreDimensions]) * weight
  }
  return Math.round(weighted / 100)
}

/** Heuristic per-dimension scoring used when the model produced no dimensions. */
export function heuristicScore(text: string): {
  dimensions: ScoreDimensions
  total: number
  missing: string[]
  suggestions: string[]
} {
  const objective = containsAny(text, [
    '帮', '请', '写', '生成', '分析', '设计', '制定', '翻译', '优化', '总结', '修改', '创建', '解释', '制作',
  ])
    ? 70 + countTokens(text, ['帮', '请', '写', '生成', '分析', '设计', '制定', '翻译', '优化', '总结', '修改', '创建', '解释', '制作']) * 10
    : 40

  const contextRatio = Math.min(1, text.length / 120)
  const context =
    (countTokens(text, ['背景', '我们', '我的', '公司', '目前', '现在', '面向', '对象', '场景', '情况']) > 0 ? 50 : 0)
    + Math.round(contextRatio * 50)

  const audience = containsAny(text, ['受众', '用户', '读者', '面向', '给', '对']) ? 70 : 20

  const outputFormat = containsAny(text, [
    '表格', '列表', 'json', 'markdown', '标题', '字数', '段落', '大纲', '结构', '代码', '输出格式', 'bullet', 'outline',
  ])
    ? 80
    : 20

  const constraints = containsAny(text, [
    '尽量', '不', '只', '保持', '字数', '时间', '预算', '格式', '语言', '约束', '限制', '不要', '不超过',
  ])
    ? 70
    : 25

  const role = containsAny(text, ['扮演', '作为', '你是一名', '你是', '充当']) ? 80 : 20

  const materials = containsAny(text, ['数据', '内容', '材料', '信息', '资料', '输入', '例子', '参考', '根据']) ? 60 : 25

  const lengthScore = Math.min(100, Math.round((text.length / 200) * 60) + 20)
  const actionability = clamp(lengthScore + (containsAny(text, ['步骤', '计划', '方案', '表格', '清单']) ? 20 : 0))

  const dimensions: ScoreDimensions = {
    objective: clamp(objective),
    context: clamp(context),
    audience: clamp(audience),
    outputFormat: clamp(outputFormat),
    constraints: clamp(constraints),
    role: clamp(role),
    materials: clamp(materials),
    actionability,
  }

  const total = computeTotalScore(dimensions)

  const missing: string[] = []
  const suggestions: string[] = []
  if (dimensions.objective < 60) {
    missing.push('明确的目标')
    suggestions.push('用一句动词开头写明你要什么，例如「制定…方案」「编写…代码」。')
  }
  if (dimensions.context < 60) {
    missing.push('背景信息')
    suggestions.push('补充背景：当前情况、已尝试过什么、为什么需要。')
  }
  if (dimensions.audience < 60) {
    missing.push('目标受众')
    suggestions.push('说明产出给谁看（客户、团队、读者、非技术用户…）。')
  }
  if (dimensions.outputFormat < 60) {
    missing.push('输出格式')
    suggestions.push('指定格式：表格 / 列表 / 代码 / Markdown 标题 / 字数范围。')
  }
  if (dimensions.constraints < 60) {
    missing.push('限制条件')
    suggestions.push('补充约束：时间、预算、字数、风格、技术栈或禁止事项。')
  }
  if (dimensions.role < 60) {
    missing.push('角色或专业视角')
    suggestions.push('指定一个对任务有帮助的视角，例如「你是一名产品经理」。')
  }
  if (dimensions.materials < 60) {
    missing.push('必要数据或素材')
    suggestions.push('如果依赖特定信息，请提供数据、文档或示例输入。')
  }
  if (dimensions.actionability < 60) {
    missing.push('可执行步骤')
    suggestions.push('要求给出步骤、计划或清单，让输出可落地执行。')
  }

  return { dimensions, total, missing, suggestions }
}

// ── intent fidelity ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  '的', '了', '是', '我', '你', '他', '她', '它', '们', '把', '被', '让', '给',
  '这', '那', '在', '有', '和', '与', '及', '或', '也', '就', '都', '而', '并',
  '请', '帮', '要', '会', '能', '为', '对', '从', '到', '向', '将', '着', '过',
  '一个', '一下', '然后', '所以', '因为', '但是', '如果', '可以', '需要',
  '一', '个', '首', '份', '篇', '次', '段', '款',
  '写', '做', '发', '想', '求', '用', '弄', '搞', '于',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'for', 'of', 'in', 'on',
  'and', 'or', 'but', 'with', 'you', 'i', 'please', 'help', 'write', 'make',
  'can', 'could', 'would', 'should', 'will', 'that', 'this', 'these', 'those',
])

/** Split text into intent tokens: CJK chars kept per-char, ASCII runs as whole tokens, stopwords dropped. */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens = lower.match(/[㐀-鿿]|[a-z0-9]+/g) ?? []
  return tokens.filter(t => !STOPWORDS.has(t) && t.trim().length > 0)
}

const CJK_CHAR = /[㐀-鿿]/

/**
 * Core-intent fidelity check: the enhanced text must not lose the original's
 * core concepts. Returns the missing core tokens (empty = pass). Consecutive
 * missing CJK chars merge into one phrase token so near-synonym rewrites of a
 * whole term count as one miss instead of many.
 */
export function missingCoreTokens(original: string, enhanced: string): string[] {
  const enhancedSet = new Set(tokenize(enhanced))
  const core = tokenize(original)
  const missing: string[] = []
  const seen = new Set<string>()
  let run = ''
  const flush = (): void => {
    if (run && !seen.has(run)) {
      missing.push(run)
      seen.add(run)
    }
    run = ''
  }
  for (const t of core) {
    if (enhancedSet.has(t)) {
      flush()
      continue
    }
    if (CJK_CHAR.test(t)) {
      run += t
    } else {
      flush()
      if (!seen.has(t)) {
        missing.push(t)
        seen.add(t)
      }
    }
  }
  flush()
  return missing
}

/** Whether the enhanced text is acceptable: non-empty, changed, and intent-preserving. */
export function isAcceptable(enhanced: string, original: string): boolean {
  if (!enhanced || !enhanced.trim()) return false
  if (enhanced === original) return false
  return missingCoreTokens(original, enhanced).length <= 1
}

export type { ClassificationResult, ScoreSource }
