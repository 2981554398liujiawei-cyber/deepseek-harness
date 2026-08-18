/**
 * Prompt enhancement Remote contract. Types only — generated Remote clients
 * consume this module without importing host runtime code. Kept deliberately
 * simple (plain objects, string/number/boolean, literal unions, arrays) so the
 * Typert generator can project every shape onto Zod.
 * @module @deepseek-ai/dsh-prompt-enhancer/types
 */

/** Enhancement intensity levels (quick = minimal edits, deep = balanced, expert = full rewrite). */
export type EnhanceLevel = 'quick' | 'deep' | 'expert'

/** Clarification policy: off = never ask, smart = only when critical info is missing, always = whenever useful. */
export type ClarificationMode = 'off' | 'smart' | 'always'

/** Task taxonomy the enhancer detects and the model is asked to classify. */
export type TaskType =
  | 'writing'
  | 'coding'
  | 'business'
  | 'analysis'
  | 'research'
  | 'learning'
  | 'translation'
  | 'planning'
  | 'creative'
  | 'general'

/** Offline rule-classifier result. */
export interface ClassificationResult {
  readonly taskType: TaskType
  readonly confidence: number
}

/** The eight scored prompt-quality dimensions (0–100 each). */
export interface ScoreDimensions {
  readonly objective: number
  readonly context: number
  readonly audience: number
  readonly outputFormat: number
  readonly constraints: number
  readonly role: number
  readonly materials: number
  readonly actionability: number
}

/** One clarification question the model wants answered before enhancing. */
export interface ClarificationQuestion {
  readonly id: string
  readonly question: string
  readonly reason: string
  readonly required: boolean
}

/** One user-supplied answer to a clarification question (ordered, keyed by question id). */
export interface ClarificationAnswer {
  readonly id: string
  readonly answer: string
}

/** Score provenance: model dimensions vs offline heuristics. */
export type ScoreSource = 'llm' | 'heuristic_fallback'

/** Structured analysis of the ORIGINAL prompt, returned beside the enhanced text. */
export interface PromptAnalysis {
  readonly detectedTaskType: TaskType
  readonly confidence: number
  readonly scoreDimensions: ScoreDimensions
  /** Weighted total score (0–100), always computed by the program, never trusted from the model. */
  readonly totalScore: number
  readonly scoreSource: ScoreSource
  readonly missingInformation: string[]
  readonly criticalMissingInformation: string[]
  readonly suggestions: string[]
  readonly clarificationRequired: boolean
  readonly clarificationQuestions: ClarificationQuestion[]
}

/** Enhance a draft: original text plus optional strategy knobs. */
export interface EnhanceRequest {
  readonly originalText: string
  readonly enhanceLevel?: EnhanceLevel
  readonly clarificationMode?: ClarificationMode
  readonly taskType?: TaskType | 'auto'
  readonly clarificationAnswers?: readonly ClarificationAnswer[]
  readonly outputLanguage?: string
  /** Per-request model route override (wins over composition config / agent default). */
  readonly provider?: string
  readonly model?: string
  /** Per-request reasoning effort; `off` disables reasoning for the model call. */
  readonly reasoningEffort?: 'off' | 'high' | 'max'
}

/** The enhanced prompt plus its analysis and provenance. */
export interface EnhanceResult {
  readonly enhancedText: string
  readonly analysis: PromptAnalysis
  readonly assumptions: string[]
  readonly provider: string
  readonly model: string
  /** Degradation marker: null = full structured success; text-fallback / passthrough = pipeline fallback. */
  readonly fallback: 'text-fallback' | 'passthrough' | null
}
