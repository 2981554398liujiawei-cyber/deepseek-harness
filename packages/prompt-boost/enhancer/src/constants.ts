/**
 * Prompt enhancement constants: task taxonomy, level vocabulary, score weights.
 * @module @deepseek-ai/dsh-prompt-enhancer/src/constants
 */

import type { EnhanceLevel, ScoreDimensions, TaskType } from './types.ts'

/** Accepted task-type vocabulary (detectedTaskType must be one of these). */
export const TASK_TYPES: readonly TaskType[] = [
  'writing',
  'coding',
  'business',
  'analysis',
  'research',
  'learning',
  'translation',
  'planning',
  'creative',
  'general',
]

/** Accepted enhancement levels. */
export const ENHANCE_LEVELS: readonly EnhanceLevel[] = ['quick', 'deep', 'expert']

/** Accepted clarification modes. */
export const CLARIFICATION_MODES: readonly string[] = ['off', 'smart', 'always']

/** Longest draft accepted for enhancement. */
export const MAX_INPUT_LENGTH = 20_000

/** Draft must contain at least this many characters. */
export const MIN_INPUT_LENGTH = 1

/** Per-dimension weights; total always sums to 100. */
export const SCORE_WEIGHTS: Record<keyof ScoreDimensions, number> = {
  objective: 20,
  context: 15,
  audience: 10,
  outputFormat: 15,
  constraints: 10,
  role: 10,
  materials: 10,
  actionability: 10,
}

/** The eight dimension keys in canonical order. */
export const SCORE_DIMENSION_KEYS: readonly (keyof ScoreDimensions)[] = [
  'objective',
  'context',
  'audience',
  'outputFormat',
  'constraints',
  'role',
  'materials',
  'actionability',
]

/** Default enhancement strategy when the request omits a knob. */
export const DEFAULT_ENHANCE_LEVEL: EnhanceLevel = 'deep'
export const DEFAULT_CLARIFICATION_MODE = 'smart'
export const DEFAULT_OUTPUT_LANGUAGE = 'auto'
